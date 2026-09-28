import type { TeamAttributionResult } from "./attribution";
import type { LiveHolding, LiveSnapshot } from "./live";
import { bucketLabel, SECTOR_LABELS } from "./sectors";
import { fmtBp, fmtDay, fmtPct, fmtTime } from "@/lib/format";

// The agent reads the Daily page in the page's own units: returns and weights in percent, contributions and effects
// in basis points, P&L in dollars.
const pct = (x: number | null | undefined) => (x === null || x === undefined ? null : +(x * 100).toFixed(2));
const bps = (x: number | null | undefined) => (x === null || x === undefined ? null : +(x * 10_000).toFixed(1));
const usd = (x: number) => Math.round(x);

const STATUS = {
  live: "Live: priced from Yahoo quotes during the session; not final until the 5:00 pm price run stores the closes",
  provisional: "Market closed; priced from closing quotes until the 5:00 pm price run stores the official closes",
  final: "Final: stored closing prices, the same numbers as Attribution's 1D",
} as const;

function holdingRow(h: LiveHolding, teamNames: Map<string, string>) {
  return {
    ticker: h.ticker,
    name: h.name,
    type: h.etf ? "ETF" : "Stock",
    sector: h.sector ? SECTOR_LABELS[h.sector] : null,
    team: h.teamId ? (teamNames.get(h.teamId) ?? null) : null,
    weightAtOpenPct: pct(h.weightOpen),
    weightNowPct: pct(h.weightNow),
    price: h.price,
    returnTodayPct: pct(h.ret),
    contributionBps: bps(h.contribution),
    pnlUsd: usd(h.pnl),
    priced: h.source === "quote" ? `live quote${h.quoteAt ? ` at ${fmtTime(h.quoteAt)}` : ""}` : h.source === "carried" ? "no quote yet today, held at the last close" : h.source === "trade" ? "today's trade price" : "stored close",
  };
}

function group(rows: LiveHolding[]) {
  return {
    count: rows.length,
    weightAtOpenPct: pct(rows.reduce((s, h) => s + h.weightOpen, 0)),
    contributionBps: bps(rows.reduce((s, h) => s + h.contribution, 0)),
    pnlUsd: usd(rows.reduce((s, h) => s + h.pnl, 0)),
  };
}

/** A compact, unit-labelled view of the Daily page, for the research agent. */
export function summarizeLive(s: LiveSnapshot, opts: { scope: "fund" | "team"; teamName?: string; teamSectors?: (keyof typeof SECTOR_LABELS)[]; teamNames: Map<string, string>; holdingsLimit: number }) {
  const r = s.result;
  const fund = opts.scope === "fund";
  const n = Math.max(1, opts.holdingsLimit);
  const byContribution = [...s.holdings].sort((a, b) => b.contribution - a.contribution);
  const top = byContribution.slice(0, n).filter((h) => h.contribution > 0);
  const bottom = byContribution.slice(-n).reverse().filter((h) => h.contribution < 0 && !top.includes(h));
  const cash = r.sectors.find((x) => x.key === "cash");
  const team = r as TeamAttributionResult;

  return {
    scope: fund ? "Whole fund" : `${opts.teamName ?? "Team"} sleeve (its holdings scaled to 100%)`,
    status: STATUS[s.status],
    session: s.session,
    // Returns run from the close of `baseClose` to the prices at `pricesAsOf`.
    baseClose: s.base,
    pricesAsOf: s.asOf ? fmtTime(s.asOf) : s.status === "final" ? `${s.session} close` : null,
    marketOpensAt: s.phase === "open" ? null : s.opensAt,
    headline: {
      returnTodayPct: pct(s.ret),
      pnlUsd: usd(s.pnl),
      [fund ? "navUsd" : "heldUsd"]: usd(s.value),
      ...(fund
        ? {
            spxPriceReturnPct: pct(s.spx),
            dowPriceReturnPct: pct(s.dow),
            activeVsSpxBps: s.spx === null ? null : bps(s.ret - s.spx),
          }
        : { contributionToFundBps: bps(team.fundContribution), shareOfFundAtOpenPct: pct(team.avgFundWeight) }),
      sectorBenchmark: fund ? "S&P 500 sector weights on Select Sector SPDR returns" : `S&P 500 weights of ${(opts.teamSectors ?? []).map((x) => SECTOR_LABELS[x]).join(", ") || "no sectors assigned"}`,
      sectorBenchmarkReturnPct: pct(r.benchmarkReturn),
      activeVsSectorBenchmarkBps: bps(r.activeReturn),
      allocationBps: bps(r.effects?.allocation),
      selectionBps: bps(r.effects?.selection),
      interactionBps: bps(r.effects?.interaction),
      ...(cash ? { cashDragBps: bps(cash.allocation), cashWeightPct: pct(cash.avgPortfolioWeight) } : {}),
    },
    byType: { stocks: group(s.holdings.filter((h) => !h.etf)), etfs: group(s.holdings.filter((h) => h.etf)) },
    sectors: r.sectors.map((x) => ({
      sector: bucketLabel(x.key),
      weightPct: pct(x.avgPortfolioWeight),
      benchmarkWeightPct: pct(x.avgBenchmarkWeight),
      returnTodayPct: pct(x.portfolioReturn),
      benchmarkReturnTodayPct: pct(x.benchmarkReturn),
      allocationBps: bps(x.allocation),
      selectionBps: bps(x.selection),
      interactionBps: bps(x.interaction),
      contributionBps: bps(x.contribution),
    })),
    topContributors: top.map((h) => holdingRow(h, opts.teamNames)),
    bottomContributors: bottom.map((h) => holdingRow(h, opts.teamNames)),
    holdingsCount: s.holdings.length,
    method:
      "Contribution = weight at the open x return today, so contributions add up to the return. Weight now is the opening weight drifted by today's moves and trades. The PT sheet weights by end-of-day holdings, so a day with a trade can differ by a few bp.",
    dataNotices: s.notes,
  };
}

export type LiveSummary = ReturnType<typeof summarizeLive>;

/** One line for the source card. */
export function liveHeadline(s: LiveSummary): string {
  const h = s.headline as LiveSummary["headline"] & { spxPriceReturnPct?: number | null; activeVsSpxBps?: number | null };
  const when = s.pricesAsOf ? `prices as of ${s.pricesAsOf}` : "";
  const parts = [`${s.scope}, ${fmtDay(s.session)} (${s.status.split(":")[0].toLowerCase()}${when ? `, ${when}` : ""}): return ${fmtPct(h.returnTodayPct)}`];
  if (h.spxPriceReturnPct !== undefined && h.spxPriceReturnPct !== null) parts.push(`S&P 500 ${fmtPct(h.spxPriceReturnPct)}, active ${fmtBp(h.activeVsSpxBps, 1)}`);
  if (h.activeVsSectorBenchmarkBps !== null) parts.push(`vs sector benchmark ${fmtBp(h.activeVsSectorBenchmarkBps, 1)}`);
  const movers = (rows: { ticker: string; contributionBps: number | null }[]) => rows.slice(0, 3).map((x) => `${x.ticker} ${fmtBp(x.contributionBps, 1)}`).join(", ");
  if (s.bottomContributors.length) parts.push(`biggest detractors ${movers(s.bottomContributors)}`);
  if (s.topContributors.length) parts.push(`top contributors ${movers(s.topContributors)}`);
  return parts.join("; ");
}
