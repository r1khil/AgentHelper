import "server-only";
import { cache } from "react";
import { computeTeamAttribution } from "@/lib/attribution/attribution";
import { loadTeamSectors } from "@/lib/attribution/load";
import { resolvePeriod } from "@/lib/attribution/periods";
import { ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { indexReturn } from "@/lib/attribution/view";
import { joinHistory, replayLevels, type ChartPoint } from "@/lib/portfolio/chart";
import { loadFundOverview, loadLiveLedger, type LiveLedger, type Overview, type OverviewPosition } from "@/lib/portfolio/overview";
import { buildReturnWindow } from "@/lib/risk/inputs";
import { loadStoredPrices, windowStart } from "@/lib/risk/load";
import { MARKET } from "@/lib/risk/model";

// The Portfolio's book for the scope in view: the whole fund (the Overview's own loader) or one team's sleeve of it,
// read off the same live ledger, so the team's value, today's change and its rows add up to the fund's.

/** What the Portfolio's hero, stat strip, positions and rail read, for the fund or one team. */
export type ScopeBook = {
  kind: "fund" | "team";
  /** "Owl Fund", or the team's name. */
  label: string;
  status: LiveLedger["status"];
  session: string;
  inception: string;
  quotesAsOf: string | null;
  value: number;
  dayPnl: number;
  /** Percent. */
  dayPct: number;
  /** What today's return is measured on, for the chart's 1D line. */
  dayBase: number;
  /** The S&P 500's move today, in percent, for each row's move against it; null until it can be measured. */
  spxDayPct: number | null;
  /** Today against the benchmark in bp: the fund's sector benchmark (or the S&P 500), a team's own sectors (or the S&P 500). */
  vsBenchmark: { bp: number; label: string } | null;
  since: Overview["since"];
  /** The fund's cash; a team holds none. */
  cash: { value: number; weightPct: number } | null;
  /** A team's share of the fund's value, in percent. */
  fundWeightPct: number | null;
  positions: OverviewPosition[];
  /** What today's moves added to the book, per holding, in decimals of the book (the fund's NAV or the team's sleeve). */
  contributions: Map<string, number>;
  chart: ChartPoint[];
  chartNote: string | null;
  /** Quotes that are missing or old. */
  notes: string[];
};

const bp = (x: number) => x * 10_000;

/** The S&P 500's move over the session the live ledger shows, in percent. */
function spxDay(live: LiveLedger) {
  if (!live.base) return null;
  const r = indexReturn(live.loaded, { start: live.base, end: live.session });
  return r === null ? null : r * 100;
}
const HISTORY = "2y" as const;

/** The whole fund, from the Overview's loader. Null when nothing has been recorded or no closes are stored. */
export const loadFundBookView = cache(async (): Promise<ScopeBook | null> => {
  const o = await loadFundOverview();
  if (!o) return null;
  return {
    spxDayPct: spxDay(o),
    kind: "fund",
    label: "Owl Fund",
    status: o.status,
    session: o.session,
    inception: o.inception,
    quotesAsOf: o.quotesAsOf,
    value: o.value,
    dayPnl: o.dayPnl,
    dayPct: o.dayPct,
    dayBase: o.dayBase,
    vsBenchmark: o.vsBenchmark,
    since: o.since,
    cash: o.cash,
    fundWeightPct: null,
    positions: o.positions,
    contributions: new Map(o.positions.map((p) => [p.ticker, o.dayBase > 0 ? p.dayPnl / o.dayBase : 0])),
    chart: o.chart,
    chartNote: o.chartNote,
    notes: o.notes,
  };
});

/**
 * One team's sleeve: its positions in the live ledger, today against its own sectors (the S&P 500 when it has none),
 * its return since the ledger opened, and its value over time (today's team weights replayed before the ledger
 * opened, the positions' real value after). Null when the ledger is empty or holds nothing for the team.
 */
export const loadTeamBookView = cache(async (teamId: string, name: string): Promise<ScopeBook | null> => {
  const live = await loadLiveLedger();
  if (!live) return null;
  const positions = live.positions.filter((p) => p.teamId === teamId);
  if (!positions.length) return null;
  const sectors = (await loadTeamSectors()).get(teamId) ?? [];
  const { loaded, base, session } = live;
  const days = loaded.series.portfolio;
  const value = positions.reduce((s, p) => s + p.value, 0);
  const dayPnl = positions.reduce((s, p) => s + p.dayPnl, 0);
  const dayBase = value - dayPnl;

  // Today: the sleeve's own return (weights at the open), against its sectors when it has them.
  let dayPct = dayBase > 0 ? (dayPnl / dayBase) * 100 : 0;
  let vsBenchmark: ScopeBook["vsBenchmark"] = null;
  if (base) {
    const today = computeTeamAttribution(loaded.series, { start: base, end: session }, teamId, sectors);
    if (today.days > 0) dayPct = today.portfolioReturn * 100;
    if (today.activeReturn !== null) vsBenchmark = { bp: bp(today.activeReturn), label: "its sectors" };
    else {
      const spx = indexReturn(loaded, { start: base, end: session });
      if (spx !== null) vsBenchmark = { bp: dayPct * 100 - bp(spx), label: "the S&P 500" };
    }
  }

  let since: ScopeBook["since"] = null;
  if (days.length > 1 && loaded.latest) {
    const period = resolvePeriod("itd", { inception: live.inception, latest: loaded.latest });
    const r = computeTeamAttribution(loaded.series, period, teamId, sectors);
    if (r.days > 0)
      since = {
        from: period.start,
        pct: r.portfolioReturn * 100,
        benchmarkPct: r.benchmarkReturn === null ? null : r.benchmarkReturn * 100,
        activeBp: r.activeReturn === null ? null : bp(r.activeReturn),
        allocationBp: r.effects ? bp(r.effects.allocation) : null,
        selectionBp: r.effects ? bp(r.effects.selection) : null,
      };
  }

  // The sleeve's value each day from the ledger, from the first day it held anything.
  const mine = (ticker: string) => loaded.series.meta.get(ticker)?.teamId === teamId;
  const ledger = days.map((d) => ({ date: d.date, value: d.positions.reduce((s, p) => s + (mine(p.ticker) ? p.valueEnd : 0), 0) }));
  const first = ledger.findIndex((p) => p.value > 0);
  let chart: ChartPoint[] = first < 0 ? [] : ledger.slice(first).map((p) => ({ ...p, replay: false }));
  let chartNote: string | null = null;
  // Before the ledger opened: today's team weights over those days' prices, as the fund's chart does.
  if (first === 0) {
    try {
      const tickers = positions.map((p) => p.ticker);
      const from = [windowStart(live.inception, HISTORY), live.inception].sort()[0];
      const { prices, dividends } = await loadStoredPrices([...tickers, ...Object.values(ETF_BY_SECTOR), MARKET], from);
      const window = buildReturnWindow(prices, dividends, tickers, live.inception, HISTORY);
      const sectorOf = (t: string) => loaded.series.meta.get(t)?.sector ?? null;
      const levels = replayLevels(
        positions.map((p) => (value > 0 ? p.value / value : 0)),
        positions.map((p) => window.returns.get(p.ticker) ?? []),
        positions.map((p) => {
          const s = sectorOf(p.ticker);
          return s ? window.returns.get(ETF_BY_SECTOR[s]) : undefined;
        }),
        window.dates.length,
      );
      chart = joinHistory({ dates: window.dates, levels }, ledger);
    } catch (e) {
      console.error("[portfolio] team replay failed", e);
      chartNote = "Price history from before the ledger opened could not be loaded.";
    }
  }

  return {
    spxDayPct: spxDay(live),
    kind: "team",
    label: name,
    status: live.status,
    session,
    inception: live.inception,
    quotesAsOf: live.quotesAsOf,
    value,
    dayPnl,
    dayPct,
    dayBase,
    vsBenchmark,
    since,
    cash: null,
    fundWeightPct: live.value > 0 ? (value / live.value) * 100 : null,
    positions: positions.map((p) => ({ ...p })),
    contributions: new Map(positions.map((p) => [p.ticker, dayBase > 0 ? p.dayPnl / dayBase : 0])),
    chart,
    chartNote,
    notes: live.notes,
  };
});
