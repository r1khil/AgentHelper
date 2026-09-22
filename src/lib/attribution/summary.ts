import type { AttributionResult, HoldingRow } from "./attribution";
import { PERIOD_LABELS, type ResolvedPeriod } from "./periods";
import { bucketLabel, SECTOR_LABELS } from "./sectors";

// The agent reads attribution in the page's own units: returns and weights in percent, effects in basis points.
const pct = (x: number | null | undefined) => (x === null || x === undefined ? null : +(x * 100).toFixed(2));
const bps = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 10_000));

/** Daily rows are listed up to about a month; longer periods rely on the totals. */
export const DAILY_ROWS_MAX = 23;

export type AttributionSummaryInput = {
  scope: "fund" | "team";
  /** Team display name for a team sleeve. */
  teamName?: string;
  /** Sectors the team is benchmarked against. */
  teamSectors?: (keyof typeof SECTOR_LABELS)[];
  period: ResolvedPeriod;
  result: AttributionResult & { fundContribution?: number; avgFundWeight?: number };
  /** S&P 500 index closes by date, for the fund's headline comparison. */
  index?: Map<string, number>;
  teamNames: Map<string, string>;
  holdingsLimit: number;
  notices: string[];
};

function holdingRow(h: HoldingRow, teamNames: Map<string, string>) {
  return {
    ticker: h.ticker,
    name: h.name,
    sector: h.sector ? SECTOR_LABELS[h.sector] : null,
    team: h.teamId ? (teamNames.get(h.teamId) ?? null) : null,
    avgWeightPct: pct(h.avgWeight),
    returnPct: pct(h.ret),
    contributionBps: bps(h.contribution),
  };
}

function indexChange(index: Map<string, number> | undefined, from: string, to: string) {
  const a = index?.get(from);
  const b = index?.get(to);
  return a && b ? b / a - 1 : null;
}

/** A compact, unit-labelled view of one attribution result, for the research agent. */
export function summarizeAttribution(i: AttributionSummaryInput) {
  const { result: r, period } = i;
  const spx = i.scope === "fund" ? indexChange(i.index, period.start, period.end) : null;
  const cash = r.sectors.find((s) => s.key === "cash");
  const byContribution = [...r.holdings].sort((a, b) => b.contribution - a.contribution);
  const n = Math.max(1, i.holdingsLimit);
  const top = byContribution.slice(0, n);
  const bottom = byContribution
    .slice(-n)
    .reverse()
    .filter((h) => !top.includes(h));

  // Daily rows come from the cumulative series, so fund and team sleeves read the same way.
  const cum = r.cumulative;
  const step = (a: number | null, b: number | null) => (a === null || b === null ? null : (1 + b) / (1 + a) - 1);
  const daily =
    cum.length - 1 <= DAILY_ROWS_MAX
      ? cum.slice(1).map((c, k) => {
          const prev = cum[k];
          const ret = step(prev.portfolio, c.portfolio)!;
          const bench = step(prev.benchmark, c.benchmark);
          const s = i.scope === "fund" ? indexChange(i.index, prev.date, c.date) : null;
          return {
            date: c.date,
            returnPct: pct(ret),
            sectorBenchmarkReturnPct: pct(bench),
            ...(i.scope === "fund" ? { spxReturnPct: pct(s), activeVsSpxBps: s === null ? null : bps(ret - s) } : {}),
          };
        })
      : undefined;

  return {
    scope: i.scope === "fund" ? "Whole fund" : `${i.teamName ?? "Team"} sleeve (its holdings scaled to 100%)`,
    period: {
      key: period.key,
      label: PERIOD_LABELS[period.key],
      // Returns run from the close of `baseClose` through the close of `end`.
      baseClose: period.start,
      end: period.end,
      tradingDays: r.days,
      startsAtLedgerInception: period.clamped,
    },
    headline: {
      returnPct: pct(r.portfolioReturn),
      ...(i.scope === "fund" ? { spxPriceReturnPct: pct(spx), activeVsSpxBps: spx === null ? null : bps(r.portfolioReturn - spx) } : {}),
      sectorBenchmark: i.scope === "fund" ? "S&P 500 sector weights on Select Sector SPDR total returns" : `S&P 500 weights of ${(i.teamSectors ?? []).map((s) => SECTOR_LABELS[s]).join(", ") || "no sectors assigned"}`,
      sectorBenchmarkReturnPct: pct(r.benchmarkReturn),
      activeVsSectorBenchmarkBps: bps(r.activeReturn),
      allocationBps: bps(r.effects?.allocation),
      selectionBps: bps(r.effects?.selection),
      interactionBps: bps(r.effects?.interaction),
      ...(cash ? { cashDragBps: bps(cash.allocation), avgCashWeightPct: pct(cash.avgPortfolioWeight) } : {}),
      ...(i.scope === "team" ? { contributionToFundBps: bps(r.fundContribution), avgShareOfFundPct: pct(r.avgFundWeight) } : {}),
    },
    sectors: r.sectors.map((s) => ({
      sector: bucketLabel(s.key),
      avgWeightPct: pct(s.avgPortfolioWeight),
      benchmarkWeightPct: pct(s.avgBenchmarkWeight),
      returnPct: pct(s.portfolioReturn),
      benchmarkReturnPct: pct(s.benchmarkReturn),
      allocationBps: bps(s.allocation),
      selectionBps: bps(s.selection),
      interactionBps: bps(s.interaction),
      totalEffectBps: bps(s.total),
      contributionBps: bps(s.contribution),
    })),
    topContributors: top.map((h) => holdingRow(h, i.teamNames)),
    bottomContributors: bottom.map((h) => holdingRow(h, i.teamNames)),
    holdingsCount: r.holdings.length,
    ...(i.scope === "fund"
      ? {
          teams: r.teams.map((t) => ({ team: t.teamId ? (i.teamNames.get(t.teamId) ?? "Unknown team") : "No team", avgWeightPct: pct(t.avgWeight), returnPct: pct(t.ret), contributionBps: bps(t.contribution) })),
          cashContributionBps: bps(r.cashContribution),
        }
      : {}),
    daily,
    dataNotices: i.notices,
  };
}

export type AttributionSummary = ReturnType<typeof summarizeAttribution>;

/** One line for the source card and the answer's headline. */
export function attributionHeadline(s: AttributionSummary): string {
  const h = s.headline as AttributionSummary["headline"] & { spxPriceReturnPct?: number | null; activeVsSpxBps?: number | null };
  const parts = [`${s.scope}, ${s.period.label} (${s.period.baseClose} close to ${s.period.end} close): return ${h.returnPct}%`];
  if (h.spxPriceReturnPct !== undefined && h.spxPriceReturnPct !== null) parts.push(`S&P 500 ${h.spxPriceReturnPct}%, active ${h.activeVsSpxBps} bps`);
  if (h.activeVsSectorBenchmarkBps !== null) parts.push(`vs sector benchmark ${h.activeVsSectorBenchmarkBps} bps (allocation ${h.allocationBps}, selection ${h.selectionBps}, interaction ${h.interactionBps})`);
  return parts.join("; ");
}
