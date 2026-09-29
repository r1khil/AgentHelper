import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns, type Team } from "@/db/schema";
import { computeAttribution, computeTeamAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { resolvePeriod } from "@/lib/attribution/periods";
import { indexReturn } from "@/lib/attribution/view";
import { fixed } from "@/lib/format";
import type { Source } from "@/lib/providers/types";
import { scoreboard, sessionSentence, weekdayName, type ScoreCell, type ScoreHero } from "@/lib/today";

// The Portfolio rail's "Last session" card: the book's last closed session against its benchmark, who helped and hurt,
// and Hoot's evening brief. Moved here from Home (which no longer shows it); the same figures Home's card showed.

export type BriefSource = { id: string; title: string; url?: string; publisher: string };

export type Brief = {
  paragraphs: string[];
  sources: BriefSource[];
  /** The fund's return has been revised since Hoot wrote it (a late close or a ledger fix). */
  stale: boolean;
  /** When the evening job finished, ISO. */
  writtenAt: string | null;
};

export type Effects = { allocation: number; selection: number; interaction: number };

/** The last session for the book this reader may see: the whole fund, or a team (its leads, execs and admins). */
export type Book =
  | {
      kind: "fund" | "team";
      sessionDate: string;
      /** The big figure: the difference to the benchmark in bp, or the return without one. */
      hero: ScoreHero;
      /** The return, the benchmark and a difference in bp. */
      cells: ScoreCell[];
      /** Allocation, selection and interaction against the sector benchmark, in decimals. */
      effects: Effects | null;
      /** Per holding, in decimals. */
      holdings: { ticker: string; contribution: number }[];
      /** Performance for that session. */
      href: string;
      brief: Brief | null;
      /** Hoot's one sentence on the session, e.g. "We beat the S&P 500 by 25 bp on Friday." */
      sentence: string | null;
    }
  | { kind: "none"; message: string };

const bps = (x: number) => Math.round(x * 10_000);

const noData = (hasInception: boolean): Book => ({ kind: "none", message: hasInception ? "Closing prices have not loaded yet." : "No trades are recorded in the ledger yet." });

/** The whole fund's last session: execs and admins. */
export async function loadFundBook(): Promise<Book> {
  try {
    const loaded = await loadAttributionSeries();
    if (!loaded.inception || !loaded.latest) return noData(!!loaded.inception);
    const period = resolvePeriod("1d", { inception: loaded.inception, latest: loaded.latest });
    const r = computeAttribution(loaded.series, period);
    const spx = indexReturn(loaded, period);
    const diff = spx === null ? null : bps(r.portfolioReturn - spx);
    return {
      kind: "fund",
      sessionDate: period.end,
      ...scoreboard({
        name: "Owl Fund",
        vs: "the S&P 500",
        ret: r.portfolioReturn * 100,
        diffBps: diff,
        benchmark: { label: "S&P 500", value: spx === null ? null : spx * 100, unit: "%", tone: false },
        third: { label: "vs sectors", value: r.activeReturn === null ? null : bps(r.activeReturn), unit: " bp", tone: true },
      }),
      effects: r.effects,
      holdings: r.holdings.map((h) => ({ ticker: h.ticker, contribution: h.contribution })),
      href: "/t/fund/performance?period=1d",
      brief: await loadBrief(period.end, r.portfolioReturn),
      sentence: sessionSentence({ subject: "We", vs: "the S&P 500", diffBps: diff, ret: r.portfolioReturn * 100, weekday: weekdayName(period.end) }),
    };
  } catch (e) {
    console.error("[portfolio] fund last session failed", e);
    return { kind: "none", message: "Attribution could not be calculated just now." };
  }
}

/** A team's sleeve against its sector benchmark, and what it added to the fund. */
export async function loadTeamBook(team: Team): Promise<Book> {
  try {
    const [loaded, sectorMap] = await Promise.all([loadAttributionSeries(), loadTeamSectors()]);
    if (!loaded.inception || !loaded.latest) return noData(!!loaded.inception);
    const period = resolvePeriod("1d", { inception: loaded.inception, latest: loaded.latest });
    const r = computeTeamAttribution(loaded.series, period, team.id, sectorMap.get(team.id) ?? []);
    const active = r.activeReturn === null ? null : bps(r.activeReturn);
    return {
      kind: "team",
      sessionDate: period.end,
      ...scoreboard({
        name: team.name,
        vs: "its sectors",
        ret: r.portfolioReturn * 100,
        diffBps: active,
        benchmark: { label: "Sector benchmark", value: r.benchmarkReturn === null ? null : r.benchmarkReturn * 100, unit: "%", tone: false },
        third: { label: "To the Fund", value: bps(r.fundContribution), unit: " bp", tone: true },
      }),
      effects: r.effects,
      holdings: r.holdings.map((h) => ({ ticker: h.ticker, contribution: h.contribution })),
      href: `/t/${team.slug}/performance?period=1d`,
      brief: null,
      sentence: sessionSentence({ subject: team.name, vs: "its sectors", diffBps: active, ret: r.portfolioReturn * 100, weekday: weekdayName(period.end) }),
    };
  } catch (e) {
    console.error("[portfolio] team last session failed", e);
    return { kind: "none", message: "Attribution could not be calculated just now." };
  }
}

/** Hoot's evening brief for the session, when it was written. */
async function loadBrief(sessionDate: string, fundReturn: number): Promise<Brief | null> {
  const [row] = await db
    .select({ summary: jobRuns.summary, finishedAt: jobRuns.finishedAt })
    .from(jobRuns)
    .where(and(eq(jobRuns.job, "daily_brief"), eq(jobRuns.ok, true), sql`${jobRuns.summary}->>'sessionDate' = ${sessionDate}`, sql`${jobRuns.summary}->>'analysis' is not null`))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  const s = row?.summary as { analysis?: string; sources?: Source[]; facts?: string } | undefined;
  const paragraphs = (s?.analysis ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // The figures block Hoot read opens "Fund return: (0.29%)" (or "-0.29%", as blocks before accounting style did).
  const m = /Fund return:\s*(\()?(-?[\d.,]+)%/.exec(s?.facts ?? "");
  const written = m ? (m[1] ? -1 : 1) * Number(m[2].replaceAll(",", "")) : undefined;
  const stale = written !== undefined && fixed(written, 2) !== fixed(fundReturn * 100, 2);
  if (!paragraphs.length) return null;
  const sources = (Array.isArray(s?.sources) ? s.sources : []).map((x) => ({ id: x.id, title: x.title, url: x.url, publisher: x.publisher }));
  return { paragraphs, sources, stale, writtenAt: row?.finishedAt ? row.finishedAt.toISOString() : null };
}
