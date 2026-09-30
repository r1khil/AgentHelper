import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { filingChanges, flags, holdings, jobRuns, watchlist, type ChangeDiff, type FilingChange } from "@/db/schema";
import { getFilingText, listFilings, tickerToCik } from "@/lib/providers/edgar";
import { NY, todayNY } from "@/lib/providers/calendar";
import { getSetting, setSetting } from "@/lib/settings";
import { claimJobLock, releaseJobLock } from "@/lib/jobs/lock";
import { createJobReporter, type JobReporter } from "@/lib/jobs/progress";
import { compareSections, needsLabels, type SectionComparison } from "./diff";
import { eightKRow, troubleItems } from "./eight-k";
import { flagTitle } from "./labels";
import { labelDiff, chunkDiff, modelGenerate, MODEL_CALL_TIMEOUT_MS, type Generate } from "./label-model";
import { ITEM_NAMES, planComparisons, periodicForm, type PeriodicFiling, type SectionRef } from "./pairing";
import { extractSection } from "./sections";
import { coveredNames, FILING_CHANGES_STATE_SETTING } from "./store";

// The filing-change detector's evening job (Module 3). pg_cron calls /api/cron/filing-changes every 10 minutes from
// 22:00 to 03:59 UTC; each call works until its time budget and saves its place, so a night's work spreads over as
// many calls as it needs, and a call with nothing to do returns after two small reads.
//
// Where the work waits:
//   1. app_settings[filing_changes_state].pending: 10-K and 10-Q filings listed but not yet compared. Once a night
//      (New York date) every covered CIK is listed since `since`; 8-K trouble codes are flagged right there.
//   2. filing_changes rows with status "queued" (label null): a section over the change threshold, holding its diff.
//      Labeling reuses that row for the first label that survives the quote check (status "labeled") and inserts one
//      more row per further label (a copy of the diff, same accession and item). With no surviving label the row
//      becomes "dropped", which keeps the diff for review but never shows. Because label is null while queued, the
//      (accession, item, label) unique index can't stop a second queued row; the job checks for one before inserting.
//   A section that disappeared or shrank by more than half gets a "section_shrunk" row from code, labeled at once.

export const FILING_CHANGES_JOB = "filing_changes";
const LOCK_STALE_MS = 6 * 60_000;
/** Model calls one filing may use in one run; its remaining Items wait in the queue for the next run. */
export const MAX_CALLS_PER_FILING = 4;
/** The first ever run lists this far back. */
const FIRST_RUN_LOOKBACK_DAYS = 7;
/** A filing that fails to compare this many times is given up on. */
const MAX_ATTEMPTS = 3;
/** Don't start fetching and comparing a filing with less budget than this left. */
const COMPARE_RESERVE_MS = 30_000;
const RECENT_KEEP = 300;

type PendingFiling = { ticker: string; cik: string; accession: string; form: string; filedAt: string; reportDate?: string; url: string; attempts?: number };

type ScanState = {
  /** Filings filed on or after this date are listed. Moves to the night's date once every name was listed. */
  since: string;
  /** The New York date of the last listing pass; one pass a night. */
  passDate: string | null;
  pending: PendingFiling[];
  /** Accessions already compared, so a filing listed again on the boundary date isn't fetched twice. */
  recent: string[];
};

export type FilingChangesResult = {
  status: "ok" | "idle" | "skipped" | "failed";
  reason?: string;
  names: number;
  listed: number;
  compared: number;
  queued: number;
  labeled: number;
  dropped: number;
  flagged: number;
  calls: number;
  /** Still waiting when the run ended: filings to compare plus queued diffs. */
  remaining: number;
  failed: { ref: string; error: string }[];
  elapsedMs: number;
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function readState(): Promise<ScanState> {
  const raw = await getSetting(FILING_CHANGES_STATE_SETTING, { fresh: true });
  const since = DateTime.fromISO(todayNY(), { zone: NY }).minus({ days: FIRST_RUN_LOOKBACK_DAYS }).toISODate()!;
  try {
    const s = raw ? (JSON.parse(raw) as Partial<ScanState>) : {};
    return { since: s.since ?? since, passDate: s.passDate ?? null, pending: Array.isArray(s.pending) ? s.pending : [], recent: Array.isArray(s.recent) ? s.recent : [] };
  } catch {
    return { since, passDate: null, pending: [], recent: [] };
  }
}

const saveState = (s: ScanState) => setSetting(FILING_CHANGES_STATE_SETTING, JSON.stringify({ ...s, recent: s.recent.slice(-RECENT_KEEP) }), null);

async function queuedCount() {
  const rows = await db.select({ id: filingChanges.id }).from(filingChanges).where(eq(filingChanges.status, "queued")).limit(1);
  return rows.length;
}

async function addFlag(row: Pick<FilingChange, "id" | "ticker" | "form" | "label" | "kind">) {
  const inserted = await db
    .insert(flags)
    .values({ ticker: row.ticker, kind: row.kind === "8k" ? "filing_8k" : "filing_change", sourceId: row.id, title: flagTitle(row.ticker, row.form, row.label), href: `/screener/${encodeURIComponent(row.ticker)}` })
    .onConflictDoNothing()
    .returning({ id: flags.id });
  return inserted.length;
}

/** One CIK per covered company (holdings and watchlist names share it), resolving and saving missing CIKs. */
async function coveredCiks(progress: JobReporter) {
  const byCik = new Map<string, string>();
  for (const n of await coveredNames()) {
    let cik = n.cik;
    if (!cik) {
      const r = await tickerToCik(n.ticker).catch(() => null);
      if (!r) continue; // ETFs and funds: no SEC registrant, nothing to watch.
      cik = r.cik;
      const t = n.source === "holding" ? holdings : watchlist;
      await db
        .update(t)
        .set({ cik })
        .where(and(eq(t.teamId, n.teamId), eq(t.ticker, n.ticker)))
        .catch(() => progress.warn("could not save a CIK", { ticker: n.ticker }));
    }
    if (!byCik.has(cik)) byCik.set(cik, n.ticker.toUpperCase());
  }
  return byCik;
}

/** List each covered company's filings since the saved date: 8-K trouble codes are flagged, 10-K/10-Q wait to be compared. */
async function scan(state: ScanState, today: string, result: FilingChangesResult, progress: JobReporter, deadline: number) {
  const ciks = await coveredCiks(progress);
  result.names = ciks.size;
  progress.step("list filings", { names: ciks.size, since: state.since });
  const known = new Set([...state.recent, ...state.pending.map((p) => p.accession)]);
  let complete = true;
  let i = 0;
  for (const [cik, ticker] of ciks) {
    i++;
    if (Date.now() > deadline) {
      complete = false;
      progress.warn("budget spent before every name was listed", { at: i });
      break;
    }
    try {
      const filings = await listFilings(cik, { forms: ["10-K", "10-Q", "8-K"], since: state.since });
      result.listed += filings.length;
      for (const f of filings) {
        if (f.form.toUpperCase() === "8-K") {
          for (const code of troubleItems(f.items)) {
            const r = eightKRow(code);
            const [row] = await db
              .insert(filingChanges)
              .values({ ticker, cik, form: "8-K", accession: f.accession, filedAt: f.filedAt, item: r.item, kind: "8k", label: r.label, summary: r.summary, filingUrl: f.url, status: "labeled", priority: 1 })
              .onConflictDoNothing()
              .returning();
            if (row) result.flagged += await addFlag(row);
          }
        } else if (!known.has(f.accession)) {
          known.add(f.accession);
          state.pending.push({ ticker, cik, accession: f.accession, form: f.form, filedAt: f.filedAt, reportDate: f.reportDate, url: f.url });
        }
      }
      progress.item("name", i, ciks.size, { ticker, filings: filings.length });
    } catch (e) {
      complete = false;
      result.failed.push({ ref: ticker, error: msg(e).slice(0, 200) });
      progress.item("name", i, ciks.size, { ticker, error: msg(e).slice(0, 200) });
    }
  }
  // A pass that missed some names still counts for tonight; `since` stays put so tomorrow lists them from the same date.
  state.passDate = today;
  if (complete) state.since = today;
  await saveState(state);
}

const sectionCache = new Map<string, string>();
async function filingText(url: string) {
  let t = sectionCache.get(url);
  if (t === undefined) {
    t = await getFilingText(url);
    sectionCache.set(url, t);
  }
  return t;
}

async function sectionOf(ref: SectionRef): Promise<string | null> {
  const form = periodicForm(ref.filing.form);
  if (!form) return null;
  return extractSection(await filingText(ref.filing.url), form, ref.item);
}

/** Compare every planned section of one new filing; queue what needs labels and flag what shrank. */
async function compareFiling(p: PendingFiling, result: FilingChangesResult, progress: JobReporter) {
  const form = periodicForm(p.form);
  if (!form) return;
  const history: PeriodicFiling[] = (await listFilings(p.cik, { forms: ["10-K", "10-Q"] })).map((f) => ({ accession: f.accession, form: f.form, filedAt: f.filedAt, reportDate: f.reportDate, url: f.url }));
  const current: PeriodicFiling = { accession: p.accession, form: p.form, filedAt: p.filedAt, reportDate: p.reportDate, url: p.url };
  const plans = planComparisons(current, history);
  if (!plans.length) {
    progress.item("filing", 1, 1, { ticker: p.ticker, accession: p.accession, skipped: "no earlier filing to compare with" });
    return;
  }
  const text = await filingText(p.url);
  const existing = await db.select({ item: filingChanges.item, label: filingChanges.label }).from(filingChanges).where(eq(filingChanges.accession, p.accession));
  for (const plan of plans) {
    const cur = extractSection(text, form, plan.item);
    let prior: SectionRef | null = null;
    let priorText: string | null = null;
    let cmp: SectionComparison | null = null;
    for (const ref of plan.priors) {
      const t = await sectionOf(ref);
      const suppressWith = plan.suppress ? await sectionOf(plan.suppress) : null;
      const c = compareSections(cur, t, { suppressWith, addedOnly: plan.addedOnly });
      prior = ref;
      priorText = t;
      cmp = c;
      // Walk back past a prior that says nothing (missing, boilerplate or empty) when there is another candidate.
      if (t !== null && c.prior.kind === "text") break;
    }
    if (!cmp || !prior || priorText === null) continue;
    const base = {
      ticker: p.ticker,
      cik: p.cik,
      form,
      accession: p.accession,
      priorAccession: prior.filing.accession,
      filedAt: p.filedAt,
      item: plan.item,
      kind: "text",
      filingUrl: p.url,
      changeScore: cmp.score.toFixed(4),
      diff: cmp.diff,
      priority: plan.priority,
    } as const;
    const had = existing.filter((e) => e.item === plan.item);
    if (cmp.shrink && !had.some((e) => e.label === "section_shrunk")) {
      const summary = cmp.shrink === "removed" ? `Item ${plan.item} is missing from this ${form}; the earlier ${prior.filing.form} had it.` : `Item ${plan.item} is less than half as long as in the earlier ${prior.filing.form}.`;
      const [row] = await db
        .insert(filingChanges)
        .values({ ...base, label: "section_shrunk", summary, status: "labeled" })
        .onConflictDoNothing()
        .returning();
      if (row) {
        result.labeled++;
        result.flagged += await addFlag(row);
      }
    }
    if (needsLabels(cmp) && !had.some((e) => e.label !== "section_shrunk")) {
      await db.insert(filingChanges).values({ ...base, label: null, status: "queued" });
      result.queued++;
    }
    progress.item("section", plans.indexOf(plan) + 1, plans.length, { ticker: p.ticker, form, item: plan.item, score: Number(cmp.score.toFixed(3)), shrink: cmp.shrink, queued: needsLabels(cmp) });
  }
}

/** Label one queued diff; reuse its row for the first label, insert the rest, flag each. Returns the calls made. */
async function labelRow(row: FilingChange, generate: Generate, maxCalls: number, canCall: () => boolean, result: FilingChangesResult, progress: JobReporter): Promise<number> {
  const diff: ChangeDiff = row.diff ?? { added: [], removed: [], numbersChanged: [] };
  const form = periodicForm(row.form) ?? "10-K";
  // The quote check reads the new filing's text; a quote from a removed sentence is checked against the earlier words.
  const texts = [await filingText(row.filingUrl), ...diff.removed, ...diff.numbersChanged.map((n) => n.before)];
  const priorForm = row.priorAccession ? (await listFilings(row.cik, { forms: ["10-K", "10-Q"] }).catch(() => [])).find((f) => f.accession === row.priorAccession)?.form : undefined;
  const r = await labelDiff({ ticker: row.ticker, form: row.form, item: row.item, itemName: ITEM_NAMES[form][row.item], priorForm, diff }, { generate, texts, maxCalls, canCall });
  result.calls += r.calls;
  // Out of time before the first call: the row stays queued, untouched, for the next run.
  if (r.stopped && r.calls === 0) return 0;
  const note = [r.calls < r.chunks ? `labeled ${r.calls} of ${r.chunks} parts of the diff (call cap)` : null, r.dropped.length ? `dropped: ${r.dropped.map((d) => `${d.label} (${d.reason})`).join(", ")}` : null].filter(Boolean).join("; ") || null;
  const taken = new Set((await db.select({ label: filingChanges.label }).from(filingChanges).where(and(eq(filingChanges.accession, row.accession), eq(filingChanges.item, row.item)))).map((x) => x.label));
  const labels = r.labels.filter((l) => !taken.has(l.label));
  if (!labels.length) {
    await db.update(filingChanges).set({ status: "dropped", error: note ?? "no labeled change" }).where(eq(filingChanges.id, row.id));
    result.dropped++;
    progress.item("label", 1, 1, { ticker: row.ticker, item: row.item, labels: 0, calls: r.calls });
    return r.calls;
  }
  const [first, ...rest] = labels;
  const [updated] = await db
    .update(filingChanges)
    .set({ label: first.label, summary: first.summary, quote: first.quote, status: "labeled", error: note })
    .where(eq(filingChanges.id, row.id))
    .returning();
  const rows = [updated];
  for (const l of rest) {
    const [ins] = await db
      .insert(filingChanges)
      .values({ ticker: row.ticker, cik: row.cik, form: row.form, accession: row.accession, priorAccession: row.priorAccession, filedAt: row.filedAt, item: row.item, kind: "text", label: l.label, summary: l.summary, quote: l.quote, filingUrl: row.filingUrl, changeScore: row.changeScore, diff: row.diff, status: "labeled", priority: row.priority })
      .onConflictDoNothing()
      .returning();
    if (ins) rows.push(ins);
  }
  for (const x of rows) if (x) result.flagged += await addFlag(x);
  result.labeled += rows.length;
  progress.item("label", 1, 1, { ticker: row.ticker, item: row.item, labels: rows.map((x) => x?.label), calls: r.calls });
  return r.calls;
}

/**
 * One invocation of the evening detector: list new filings once a night, compare the ones waiting, then label queued
 * diffs in priority order until the budget is spent. Never emails anyone. Safe to call as often as pg_cron likes.
 */
export async function runFilingChangesJob(opts: { budgetMs?: number; reason?: string } = {}): Promise<FilingChangesResult> {
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 240_000;
  const deadline = started + budgetMs;
  const result: FilingChangesResult = { status: "ok", names: 0, listed: 0, compared: 0, queued: 0, labeled: 0, dropped: 0, flagged: 0, calls: 0, remaining: 0, failed: [], elapsedMs: 0 };
  const done = (r: FilingChangesResult) => ({ ...r, elapsedMs: Date.now() - started });

  // Nothing to do (tonight's listing done, nothing waiting): two small reads and out, no job_runs row.
  const today = todayNY();
  const [state, queued] = await Promise.all([readState(), queuedCount()]);
  if (state.passDate === today && !state.pending.length && !queued) return done({ ...result, status: "idle" });
  if (!(await claimJobLock(FILING_CHANGES_JOB, LOCK_STALE_MS))) return done({ ...result, status: "skipped", reason: "another run holds the lock" });

  const [jobRow] = await db.insert(jobRuns).values({ job: FILING_CHANGES_JOB, summary: { reason: opts.reason ?? "cron" } }).returning({ id: jobRuns.id });
  const progress = createJobReporter(jobRow.id);
  sectionCache.clear();
  try {
    if (state.passDate !== today) await scan(state, today, result, progress, started + budgetMs * 0.4);

    if (state.pending.length) progress.step("compare filings", { waiting: state.pending.length });
    const tried = new Set<string>();
    while (state.pending.length && deadline - Date.now() > COMPARE_RESERVE_MS) {
      const p = state.pending[0];
      // A filing that failed earlier in this run waits for the next one.
      if (tried.has(p.accession)) break;
      tried.add(p.accession);
      try {
        await compareFiling(p, result, progress);
        result.compared++;
        state.pending.shift();
        state.recent.push(p.accession);
      } catch (e) {
        state.pending.shift();
        const attempts = (p.attempts ?? 0) + 1;
        result.failed.push({ ref: `${p.ticker} ${p.form} ${p.accession}`, error: msg(e).slice(0, 200) });
        progress.warn("compare failed", { ticker: p.ticker, accession: p.accession, attempts, error: msg(e).slice(0, 200) });
        if (attempts < MAX_ATTEMPTS) state.pending.push({ ...p, attempts });
        else state.recent.push(p.accession);
      }
      await saveState(state);
    }

    const queue = await db.select().from(filingChanges).where(eq(filingChanges.status, "queued")).orderBy(asc(filingChanges.priority), asc(filingChanges.createdAt)).limit(100);
    if (queue.length) progress.step("label changes", { queued: queue.length });
    const used = new Map<string, number>();
    let generate: Generate | null = null;
    const canCall = () => deadline - Date.now() > MODEL_CALL_TIMEOUT_MS + 10_000;
    for (const row of queue) {
      if (!canCall()) break;
      const spent = used.get(row.accession) ?? 0;
      const left = MAX_CALLS_PER_FILING - spent;
      const needed = chunkDiff(row.diff ?? { added: [], removed: [], numbersChanged: [] }).length;
      // An Item that won't fit what this filing has left waits for the next run, unless it could never fit one.
      if (left <= 0 || (needed > left && spent > 0)) continue;
      try {
        generate ??= await modelGenerate();
        used.set(row.accession, spent + (await labelRow(row, generate, left, canCall, result, progress)));
      } catch (e) {
        used.set(row.accession, MAX_CALLS_PER_FILING);
        const error = msg(e).slice(0, 300);
        result.failed.push({ ref: `${row.ticker} ${row.form} Item ${row.item}`, error });
        // A second failure gives up on the row (kept as dropped with the error); the first leaves it queued.
        await db
          .update(filingChanges)
          .set(row.error ? { status: "dropped", error: `model failed twice: ${error}` } : { error })
          .where(eq(filingChanges.id, row.id));
        progress.warn("label failed", { ticker: row.ticker, item: row.item, error });
      }
    }

    result.remaining = state.pending.length + (await db.select({ id: filingChanges.id }).from(filingChanges).where(eq(filingChanges.status, "queued"))).length;
    progress.step("finished", { compared: result.compared, queued: result.queued, labeled: result.labeled, flagged: result.flagged, remaining: result.remaining });
    await progress.close();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: { ...done(result), reason: opts.reason ?? "cron" } }).where(eq(jobRuns.id, jobRow.id));
    return done(result);
  } catch (e) {
    const message = msg(e);
    progress.error("failed", { error: message });
    await progress.close();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: { ...done(result), error: message } }).where(eq(jobRuns.id, jobRow.id));
    return done({ ...result, status: "failed", reason: message });
  } finally {
    sectionCache.clear();
    await releaseJobLock(FILING_CHANGES_JOB);
  }
}
