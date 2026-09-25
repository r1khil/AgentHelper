import { ETF_BY_SECTOR, GICS_SECTORS, type GicsSector } from "@/lib/attribution/sectors";
import type { DateSeries } from "@/lib/attribution/types";
import { MARKET, type RiskReport } from "./model";

/**
 * Historical stress tests: today's positions, bought at a past window's starting close and held
 * without rebalancing to its ending close, on stored closes and dividends. A holding that did not
 * trade yet stands in with its sector ETF (the S&P 500 when it has no sector), and is flagged.
 */

/** Historical stress windows, close to close. The first starts after STRESS_HISTORY_FROM. */
export const STRESS_WINDOWS = [
  { key: "covid", label: "COVID crash", from: "2020-02-19", to: "2020-03-23", note: "S&P 500 peak to the March 23 low." },
  { key: "rates-2022", label: "2022 rate shock", from: "2022-01-03", to: "2022-10-12", note: "S&P 500 high to low as the Fed raised rates from zero." },
  { key: "svb", label: "SVB run", from: "2023-03-08", to: "2023-03-24", note: "A bank-specific shock with the S&P 500 about flat, so it tests sector bets rather than beta." },
  { key: "carry-unwind", label: "Carry unwind", from: "2024-07-31", to: "2024-08-05", note: "Bank of Japan hike to the August 5 low." },
] as const;
export type StressWindow = { key: string; label: string; from: string; to: string; note: string };

/** Stored price history reaches back to here so every stress window has a starting close. */
export const STRESS_HISTORY_FROM = "2020-02-01";
/** A window's first and last closes may be up to this many calendar days before its dates (holidays, a missing row). */
export const STRESS_DATE_SLACK_DAYS = 7;

export type StressPosition = { ticker: string; name: string; sector: GicsSector | null; value: number; weight: number };

export type StressInput = {
  /** Value of the scope: Fund NAV, or the team's holdings. */
  nav: number;
  cash: { value: number; weight: number };
  holdings: StressPosition[];
  /** Benchmark sector weights summing to 1 (the Risk page's), or null when none are saved. */
  benchmarkWeights: Partial<Record<GicsSector, number>> | null;
  prices: DateSeries;
  dividends: DateSeries;
  /** First stored close per holding, when `prices` holds only the windows' dates; used to say why one was stood in for. */
  firstClose?: Map<string, string>;
};

export type StressHolding = StressPosition & {
  /** Symbol whose closes were used: the holding's own, or its stand-in. */
  series: string;
  proxied: boolean;
  /** Why it was stood in for, e.g. "first stored close 2021-06-29". */
  proxyReason: string | null;
  /** Total return of `series` over the window, dividends reinvested. */
  ret: number;
  /** weight × ret: points of the scope's return. The column adds up to the scope's return. */
  contribution: number;
  dollars: number;
  /** Weight at the end of the window after drifting with its return (no rebalancing). */
  endWeight: number;
};

/** One sector of the benchmark: its ETF (`series` is SPY if the ETF has no closes for the window). */
export type StressLeg = { sector: GicsSector; etf: string; series: string; weight: number; ret: number; contribution: number };

export type StressPoint = { date: string; fund: number; market: number; benchmark: number | null };

export type StressOk = StressWindow & {
  status: "ok";
  /** Close the positions are bought at, and the close they are valued at. */
  start: string;
  end: string;
  sessions: number;
  fund: number;
  market: number;
  benchmark: number | null;
  active: number | null;
  /** The same starting weights rebalanced back every day, as Backtesting replays: for comparison only. */
  rebalanced: number;
  dollars: number;
  cashWeight: number;
  /** Every holding, worst contribution first. */
  holdings: StressHolding[];
  worst: StressHolding[];
  proxied: number;
  benchmarkLegs: StressLeg[];
  path: StressPoint[];
  /** Growth of $1 on each path date for every series used (holdings or their stand-ins, benchmark ETFs, SPY), for the downloadable working. */
  growth: Record<string, number[]>;
  /** Backtesting's start date for the same window: its start date includes that session's return from the prior close. */
  backtestFrom: string;
};
export type StressResult = StressOk | (StressWindow & { status: "no-data"; reason: string });

const sortedKeys = (m: Map<string, number> | undefined) => (m ? [...m.keys()].sort() : []);
const minusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/** Latest date in an ascending list on or before `date`, no more than `slack` days earlier. */
function onOrBefore(dates: string[], date: string, slack = STRESS_DATE_SLACK_DAYS): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (d > date) break;
    best = d;
  }
  return best && best >= minusDays(date, slack) ? best : null;
}

/**
 * Growth of $1 in `symbol` on each of `dates` (dates[0] is the purchase close), with dividends
 * reinvested: each step is (close + dividends since the last close) ÷ last close. A missing close
 * carries the last one (a zero return) and its dividends wait for the next close. Null when there
 * is no close on the start date or no close near the last date.
 */
export function growthPath(prices: DateSeries, dividends: DateSeries, symbol: string, dates: string[]): number[] | null {
  const closes = prices.get(symbol);
  const closeDates = sortedKeys(closes);
  // The purchase close must be on the start date itself: an older one would count the move since then as stress.
  const base = closes?.has(dates[0]) ? dates[0] : null;
  if (!closes || !base || !onOrBefore(closeDates, dates.at(-1)!)) return null;
  const divs = [...(dividends.get(symbol) ?? new Map<string, number>())].filter(([, a]) => a > 0).sort(([a], [b]) => a.localeCompare(b));
  let last = closes.get(base)!;
  let lastDate = base;
  let g = 1;
  const out = [1];
  for (const date of dates.slice(1)) {
    const close = closes.get(date);
    if (close !== undefined && close > 0) {
      const paid = divs.filter(([d]) => d > lastDate && d <= date).reduce((s, [, a]) => s + a, 0);
      g *= (close + paid) / last;
      last = close;
      lastDate = date;
    }
    out.push(g);
  }
  return out;
}

/** Compounded return of fixed weights rebalanced every day. */
export function rebalancedReturn(weights: number[], paths: number[][]): number {
  let nav = 1;
  const T = paths[0]?.length ?? 0;
  for (let t = 1; t < T; t++) nav *= 1 + weights.reduce((s, w, i) => s + w * (paths[i][t] / paths[i][t - 1] - 1), 0);
  return nav - 1;
}

export function runStressTest(input: StressInput, window: StressWindow): StressResult {
  const marketDates = sortedKeys(input.prices.get(MARKET));
  const start = onOrBefore(marketDates, window.from);
  const end = onOrBefore(marketDates, window.to);
  if (!start || !end || end <= start) {
    return { ...window, status: "no-data", reason: `Stored ${MARKET} closes do not cover ${window.from} to ${window.to} yet; the nightly price run backfills them.` };
  }
  const dates = marketDates.filter((d) => d >= start && d <= end);
  const path = (sym: string) => growthPath(input.prices, input.dividends, sym, dates);
  const marketPath = path(MARKET)!;
  const etfPaths = new Map<string, number[] | null>();
  const etfPath = (etf: string) => {
    if (!etfPaths.has(etf)) etfPaths.set(etf, path(etf));
    return etfPaths.get(etf)!;
  };

  const used = input.holdings.map((h) => {
    const own = path(h.ticker);
    if (own) return { h, series: h.ticker, g: own, reason: null as string | null };
    const first = input.firstClose?.get(h.ticker) ?? sortedKeys(input.prices.get(h.ticker))[0];
    const reason = first && first > start ? `first stored close ${first}` : `no stored close on ${start}`;
    const etf = h.sector ? ETF_BY_SECTOR[h.sector] : null;
    const g = etf ? etfPath(etf) : null;
    return g ? { h, series: etf!, g, reason } : { h, series: MARKET, g: marketPath, reason: h.sector ? `${reason}; ${etf} missing too` : `${reason}; no sector set` };
  });

  const T = dates.length;
  const fundPath = dates.map((_, t) => used.reduce((s, u) => s + u.h.weight * (u.g[t] - 1), 0));
  const endValue = input.cash.weight + used.reduce((s, u) => s + u.h.weight * u.g[T - 1], 0);
  const holdings: StressHolding[] = used
    .map(({ h, series, g, reason }) => {
      const ret = g[T - 1] - 1;
      const contribution = h.weight * ret;
      return { ...h, series, proxied: series !== h.ticker, proxyReason: reason, ret, contribution, dollars: contribution * input.nav, endWeight: endValue > 0 ? (h.weight * g[T - 1]) / endValue : 0 };
    })
    .sort((a, b) => a.contribution - b.contribution);

  const bench = input.benchmarkWeights;
  const legs = bench
    ? GICS_SECTORS.filter((s) => (bench[s] ?? 0) > 0).map((s) => {
        const etf = ETF_BY_SECTOR[s];
        const own = etfPath(etf);
        return { sector: s, etf, series: own ? etf : MARKET, weight: bench[s]!, g: own ?? marketPath };
      })
    : null;
  const benchPath = legs ? dates.map((_, t) => legs.reduce((s, l) => s + l.weight * (l.g[t] - 1), 0)) : null;

  const fund = fundPath[T - 1];
  const benchmark = benchPath ? benchPath[T - 1] : null;
  return {
    ...window,
    status: "ok",
    start,
    end,
    sessions: T - 1,
    fund,
    market: marketPath[T - 1] - 1,
    benchmark,
    active: benchmark === null ? null : fund - benchmark,
    rebalanced: rebalancedReturn(used.map((u) => u.h.weight), used.map((u) => u.g)),
    dollars: fund * input.nav,
    cashWeight: input.cash.weight,
    holdings,
    worst: holdings.slice(0, 3),
    proxied: holdings.filter((h) => h.proxied).length,
    benchmarkLegs: (legs ?? []).map((l) => ({ sector: l.sector, etf: l.etf, series: l.series, weight: l.weight, ret: l.g[T - 1] - 1, contribution: l.weight * (l.g[T - 1] - 1) })),
    path: dates.map((date, t) => ({ date, fund: fundPath[t], market: marketPath[t] - 1, benchmark: benchPath ? benchPath[t] : null })),
    growth: Object.fromEntries([...used.map((u) => [u.series, u.g] as const), ...(legs ?? []).map((l) => [l.series, l.g] as const), [MARKET, marketPath] as const]),
    backtestFrom: dates[1] ?? end,
  };
}

export function runStressTests(input: StressInput, windows: readonly StressWindow[] = STRESS_WINDOWS): StressResult[] {
  return windows.map((w) => runStressTest(input, w));
}

/** The benchmark sector weights a Risk report used (its short legs), or null when none are saved. */
export function reportBenchmarkWeights(report: RiskReport): Partial<Record<GicsSector, number>> | null {
  if (report.portfolio.trackingError === null) return null;
  return Object.fromEntries(report.benchmarkLegs.map((l) => [l.sector, -l.weight]));
}

/** The stress tests' input from a Risk report's positions (Fund or team) and the stored prices. */
export function stressInputFromReport(report: RiskReport, data: Pick<StressInput, "prices" | "dividends" | "firstClose">): StressInput {
  return {
    nav: report.nav,
    cash: report.cash,
    holdings: report.holdings.map((h) => ({ ticker: h.ticker, name: h.name, sector: h.sector, value: h.value, weight: h.weight })),
    benchmarkWeights: reportBenchmarkWeights(report),
    ...data,
  };
}

/** Date ranges of stored rows the windows read: a margin before each start for the purchase close. */
export function stressDateRanges(windows: readonly StressWindow[] = STRESS_WINDOWS) {
  return windows.map((w) => ({ from: minusDays(w.from, STRESS_DATE_SLACK_DAYS), to: w.to }));
}
