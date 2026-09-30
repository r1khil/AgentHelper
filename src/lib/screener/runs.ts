import "server-only";
import { cached } from "@/lib/providers/cache";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns, screenHits, screenRuns, teamSectors, type ScreenCheckpoint, type ScreenHit, type ScreenRun } from "@/db/schema";
import type { GicsSector } from "@/lib/attribution/sectors";
import { claimJobLock, releaseJobLock } from "@/lib/jobs/lock";
import { createJobReporter } from "@/lib/jobs/progress";
import { todayNY } from "@/lib/providers/calendar";
import { fetchFrame, fetchListedCompanies, getCompanyProfile } from "@/lib/providers/edgar-frames";
import { getBarsRange, SPX_SYMBOL } from "@/lib/providers/yahoo";
import { yahooBulkSource, yahooSymbol } from "./prices";
import { advanceScreen, type ScreenDeps } from "./screen-job";
import { addMonths, forwardReturns, isFirstSaturday, monthStart, type ForwardReturns } from "./screen-schedule";
import { screenerStore } from "./screen-storage";

/*
 * The monthly screen's runs: start one, advance it from its checkpoint, and read the latest finished one. The work
 * itself is in screen-job.ts; this file is the database and Storage around it. No email is ever sent from here.
 */

const LOCK = "screen";
/** A call that dies mid-run leaves its lock behind; the next call may take it over after this long. */
const LOCK_STALE_MS = 8 * 60_000;
/** Consecutive failed calls before a run is marked failed (a flaky SEC or Yahoo call is retried by the next one). */
const MAX_FAILURES = 5;

const INITIAL: ScreenCheckpoint = { conceptsDone: [], pricesDone: 0, stage: "universe" };

/** The latest finished run and its hits (best first), or null before the first run finishes. */
export async function latestScreen(): Promise<{ run: ScreenRun; hits: ScreenHit[] } | null> {
  const [run] = await db.select().from(screenRuns).where(eq(screenRuns.status, "done")).orderBy(desc(screenRuns.runDate), desc(screenRuns.startedAt)).limit(1);
  if (!run) return null;
  const hits = await db.select().from(screenHits).where(eq(screenHits.runId, run.id)).orderBy(asc(screenHits.rank));
  return { run, hits };
}

/** The run in progress, if any. */
export async function currentRun(): Promise<ScreenRun | null> {
  const [run] = await db.select().from(screenRuns).where(eq(screenRuns.status, "running")).orderBy(desc(screenRuns.startedAt)).limit(1);
  return run ?? null;
}

/** Start a run (or return the one already running). The first call of continueScreenRun does the work. */
export async function startScreenRun({ reason }: { reason: string }): Promise<ScreenRun> {
  const running = await currentRun();
  if (running) return running;
  const runDate = todayNY();
  const [job] = await db.insert(jobRuns).values({ job: "screen", summary: { reason, runDate } }).returning({ id: jobRuns.id });
  const [run] = await db
    .insert(screenRuns)
    .values({ runDate, status: "running", storagePath: `runs/${runDate}-${randomUUID().slice(0, 8)}`, params: { reason }, checkpoint: INITIAL, jobRunId: job.id })
    .returning();
  return run;
}

export type ContinueResult = { status: "idle" | "busy" | "running" | "done" | "failed"; runId?: string; checkpoint?: ScreenCheckpoint; hits?: number; error?: string };

/** Advance the run in progress until `budgetMs` is spent. One call at a time across the deployment. */
export async function continueScreenRun({ budgetMs = 240_000 }: { budgetMs?: number } = {}): Promise<ContinueResult> {
  const run = await currentRun();
  if (!run) return { status: "idle" };
  if (!(await claimJobLock(LOCK, LOCK_STALE_MS))) return { status: "busy", runId: run.id };
  const progress = run.jobRunId ? createJobReporter(run.jobRunId) : null;
  let saved = false;
  try {
    const deps = screenDeps(run, progress, () => (saved = true));
    const { checkpoint, outcome } = await advanceScreen({ runDate: run.runDate, storagePath: run.storagePath, checkpoint: run.checkpoint }, deps, budgetMs);
    if (!outcome) {
      progress?.step("paused", { stage: checkpoint.stage, conceptsDone: checkpoint.conceptsDone.length, pricesDone: checkpoint.pricesDone });
      return { status: "running", runId: run.id, checkpoint };
    }
    await db.transaction(async (tx) => {
      await tx.delete(screenHits).where(eq(screenHits.runId, run.id));
      if (outcome.hits.length) {
        await tx.insert(screenHits).values(
          outcome.hits.map((h) => ({
            runId: run.id,
            ticker: h.ticker,
            cik: h.cik,
            companyName: h.name,
            track: h.track,
            sic: h.sic,
            sector: h.sector,
            teamId: h.teamId,
            metrics: h.metrics,
            periodEnd: h.periodEnd,
            rank: h.rank,
            teamRank: h.teamRank,
            price: String(h.price),
            marketCap: String(h.marketCap),
            accessions: h.accessions,
          })),
        );
      }
      await tx
        .update(screenRuns)
        .set({ status: "done", checkpoint, coverage: outcome.coverage, universeSize: outcome.universeSize, params: { ...run.params, ...outcome.params }, error: null, finishedAt: new Date() })
        .where(eq(screenRuns.id, run.id));
    });
    progress?.step("finished", { hits: outcome.hits.length, universe: outcome.universeSize });
    if (run.jobRunId) await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: { reason: run.params.reason, runDate: run.runDate, hits: outcome.hits.length, universe: outcome.universeSize } }).where(eq(jobRuns.id, run.jobRunId));
    return { status: "done", runId: run.id, checkpoint, hits: outcome.hits.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Failures count only when consecutive: a call that saved a checkpoint before failing starts the count again.
    const failures = (saved ? 0 : Number(run.params.failures ?? 0)) + 1;
    const failed = failures >= MAX_FAILURES;
    progress?.error("call failed", { error: message.slice(0, 300), failures });
    await db
      .update(screenRuns)
      .set({ error: message.slice(0, 1000), params: { ...run.params, failures }, ...(failed ? { status: "failed", finishedAt: new Date() } : {}) })
      .where(eq(screenRuns.id, run.id));
    if (failed && run.jobRunId) await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: { reason: run.params.reason, runDate: run.runDate, error: message.slice(0, 300) } }).where(eq(jobRuns.id, run.jobRunId));
    return { status: failed ? "failed" : "running", runId: run.id, error: message };
  } finally {
    await progress?.close();
    await releaseJobLock(LOCK);
  }
}

function screenDeps(run: ScreenRun, progress: ReturnType<typeof createJobReporter> | null, onSave: () => void): ScreenDeps {
  return {
    listCompanies: fetchListedCompanies,
    fetchFrame,
    profile: getCompanyProfile,
    prices: yahooBulkSource(),
    store: screenerStore(),
    teamsBySector: async () => {
      const rows = await db.select().from(teamSectors);
      return Object.fromEntries(rows.map((r) => [r.sector, r.teamId])) as Partial<Record<GicsSector, string>>;
    },
    saveCheckpoint: async (checkpoint) => {
      await db.update(screenRuns).set({ checkpoint, params: { ...run.params, failures: 0 } }).where(eq(screenRuns.id, run.id));
      onSave();
    },
    log: { step: (n, d) => progress?.step(n, d), warn: (n, d) => progress?.warn(n, d) },
    now: () => Date.now(),
  };
}

/**
 * The cron entry point: continue a run in progress; else start one on the first Saturday of the month when this
 * month has none yet; else return idle at once.
 */
export async function screenCron({ budgetMs = 240_000 }: { budgetMs?: number } = {}): Promise<ContinueResult> {
  if (await currentRun()) return continueScreenRun({ budgetMs });
  const today = todayNY();
  if (!isFirstSaturday(today)) return { status: "idle" };
  const [existing] = await db.select({ id: screenRuns.id }).from(screenRuns).where(gte(screenRuns.runDate, monthStart(today))).limit(1);
  if (existing) return { status: "idle" };
  await startScreenRun({ reason: "cron" });
  return continueScreenRun({ budgetMs });
}

/**
 * Paper tracking: each hit's price return since the run date at 3, 6 and 12 months, beside the S&P 500's (fractions),
 * computed when read from Yahoo's daily closes. A horizon that hasn't arrived is null. Keyed by ticker.
 */
export async function screenForwardReturns(runId: string): Promise<Record<string, ForwardReturns>> {
  // One Yahoo call per hit: kept a day in provider_cache (a few KB), so only the first reader of the day waits.
  return cached(`screener:forward:v1:${runId}:${todayNY()}`, 60 * 60 * 24, () => computeForwardReturns(runId));
}

async function computeForwardReturns(runId: string): Promise<Record<string, ForwardReturns>> {
  const [run] = await db.select({ runDate: screenRuns.runDate }).from(screenRuns).where(eq(screenRuns.id, runId)).limit(1);
  if (!run) return {};
  const hits = await db.select({ ticker: screenHits.ticker }).from(screenHits).where(eq(screenHits.runId, runId)).orderBy(asc(screenHits.rank));
  const today = todayNY();
  // A few days past the twelve-month mark, for the first close on or after it.
  const plus12 = DateTime.fromISO(addMonths(run.runDate, 12)).plus({ days: 10 }).toISODate()!;
  const end = plus12 < today ? plus12 : today;
  const bars = async (symbol: string) => (await getBarsRange(symbol, run.runDate, end).catch(() => ({ bars: [] }))).bars;
  const spx = await bars(SPX_SYMBOL);
  const out: Record<string, ForwardReturns> = {};
  for (const h of hits) out[h.ticker] = forwardReturns(await bars(yahooSymbol(h.ticker)), spx, run.runDate, today);
  return out;
}
