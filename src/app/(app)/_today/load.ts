import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns, type Team } from "@/db/schema";
import { computeAttribution, computeTeamAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { resolvePeriod } from "@/lib/attribution/periods";
import { indexReturn } from "@/lib/attribution/view";
import type { Source } from "@/lib/providers/types";
import { sessionSentence, weekdayName } from "@/lib/today";
import type { Book, Brief } from "./types";

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
      label: "Owl Fund",
      ret: r.portfolioReturn * 100,
      cells: [
        { label: "S&P 500", value: spx === null ? null : spx * 100, unit: "%", tone: false },
        { label: "Difference", value: diff, unit: " bp", tone: true },
        { label: "vs sectors", value: r.activeReturn === null ? null : bps(r.activeReturn), unit: " bp", tone: true },
      ],
      effects: r.effects,
      holdings: r.holdings.map((h) => ({ ticker: h.ticker, teamId: h.teamId, ret: h.ret, contribution: h.contribution })),
      teams: Object.fromEntries(r.teams.filter((t) => t.teamId).map((t) => [t.teamId!, { ret: t.ret, contribution: t.contribution }])),
      href: "/attribution",
      brief: await loadBrief(period.end, r.portfolioReturn),
      sentence: sessionSentence({ subject: "We", vs: "the S&P 500", diffBps: diff, ret: r.portfolioReturn * 100, weekday: weekdayName(period.end) }),
    };
  } catch (e) {
    console.error("[today] fund attribution failed", e);
    return { kind: "none", message: "Attribution could not be calculated just now." };
  }
}

/** A lead's own team sleeve against its sector benchmark, and what it added to the fund. */
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
      label: team.name,
      ret: r.portfolioReturn * 100,
      cells: [
        { label: "Sector benchmark", value: r.benchmarkReturn === null ? null : r.benchmarkReturn * 100, unit: "%", tone: false },
        { label: "Difference", value: active, unit: " bp", tone: true },
        { label: "To the Fund", value: bps(r.fundContribution), unit: " bp", tone: true },
      ],
      effects: r.effects,
      holdings: r.holdings.map((h) => ({ ticker: h.ticker, teamId: h.teamId ?? team.id, ret: h.ret, contribution: h.contribution })),
      teams: { [team.id]: { ret: r.portfolioReturn, contribution: r.fundContribution } },
      href: `/t/${team.slug}/attribution`,
      brief: null,
      sentence: sessionSentence({ subject: team.name, vs: "its sectors", diffBps: active, ret: r.portfolioReturn * 100, weekday: weekdayName(period.end) }),
    };
  } catch (e) {
    console.error("[today] team attribution failed", e);
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
  // The figures block Hoot read opens "Fund return: -0.29%".
  const written = /Fund return:\s*(-?[\d.]+)%/.exec(s?.facts ?? "")?.[1];
  const stale = written !== undefined && Number(written).toFixed(2) !== (fundReturn * 100).toFixed(2);
  if (!paragraphs.length) return null;
  const sources = (Array.isArray(s?.sources) ? s.sources : []).map((x) => ({ id: x.id, title: x.title, url: x.url, publisher: x.publisher }));
  return { paragraphs, sources, stale, writtenAt: row?.finishedAt ? row.finishedAt.toISOString() : null };
}
