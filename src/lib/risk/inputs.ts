import type { AttributionSeries } from "@/lib/attribution/attribution";
import { latestPositions } from "@/lib/attribution/ledger";
import { ETF_BY_SECTOR, GICS_SECTORS, type GicsSector } from "@/lib/attribution/sectors";
import type { DateSeries } from "@/lib/attribution/types";
import { LOOKBACKS, MARKET, RISK_FREE, type LookbackKey, type RealizedInput, type RiskInput } from "./model";

export type RiskScope = { kind: "fund" } | { kind: "team"; teamId: string; sectors: GicsSector[] };

const sortedDates = (m: Map<string, number> | undefined) => (m ? [...m.keys()].sort() : []);

/** Latest value on or before `date` in an ascending date list. */
function asOfLookup(series: Map<string, number> | undefined) {
  const dates = sortedDates(series);
  return (date: string) => {
    let lo = 0, hi = dates.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= date) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best < 0 ? null : { date: dates[best], value: series!.get(dates[best])! };
  };
}

/** Total daily return between two closes: (close + dividend on the later date) / earlier close − 1. */
function totalReturn(prices: DateSeries, dividends: DateSeries, ticker: string, prev: string, date: string) {
  const p0 = prices.get(ticker)?.get(prev);
  const p1 = prices.get(ticker)?.get(date);
  if (p0 === undefined || p1 === undefined || p0 <= 0) return NaN;
  return (p1 + (dividends.get(ticker)?.get(date) ?? 0)) / p0 - 1;
}

/**
 * Turns the replayed ledger plus stored closes into the risk model's input: today's positions and
 * weights for the scope, the benchmark's current sector weights, a window of daily total returns on
 * the S&P 500's trading days, and the scope's realized daily returns since inception.
 */
export function assembleRiskInput(args: {
  series: AttributionSeries;
  prices: DateSeries;
  dividends: DateSeries;
  lookback: LookbackKey;
  scope: RiskScope;
}): RiskInput | null {
  const { series, prices, dividends, lookback, scope } = args;
  const last = series.portfolio.at(-1);
  if (!last) return null;
  const asOf = last.date;

  const positions = latestPositions(series.portfolio).filter((p) => scope.kind === "fund" || series.meta.get(p.ticker)?.teamId === scope.teamId);
  const scopeValue = positions.reduce((s, p) => s + p.value, 0);
  const nav = scope.kind === "fund" ? last.navEnd : scopeValue;
  const holdings = positions.map((p) => {
    const m = series.meta.get(p.ticker);
    return { ticker: p.ticker, name: m?.name ?? p.ticker, teamId: m?.teamId ?? null, sector: m?.sector ?? null, value: p.value, weight: nav > 0 ? p.value / nav : 0 };
  });
  const cash = scope.kind === "fund" ? { value: last.cashEnd, weight: last.navEnd > 0 ? last.cashEnd / last.navEnd : 0 } : { value: 0, weight: 0 };

  // The benchmark's weights at today's close: the last day's start-of-day weights drifted by that day's returns.
  const b = series.benchmark.at(-1);
  let benchmarkWeights: Partial<Record<GicsSector, number>> | null = null;
  if (b) {
    const drifted = Object.fromEntries(GICS_SECTORS.map((s) => [s, (b.weights[s] * (1 + b.returns[s])) / (1 + b.ret)])) as Record<GicsSector, number>;
    const keep: readonly GicsSector[] = scope.kind === "fund" ? GICS_SECTORS : scope.sectors;
    const total = keep.reduce((s, k) => s + drifted[k], 0);
    if (total > 0) benchmarkWeights = Object.fromEntries(keep.map((k) => [k, drifted[k] / total]));
  }

  // Window: the last N + 1 market closes on or before the as-of date give N daily returns.
  const marketDates = sortedDates(prices.get(MARKET)).filter((d) => d <= asOf);
  const closeDates = marketDates.slice(-(LOOKBACKS[lookback].days + 1));
  const dates = closeDates.slice(1);
  const symbols = [...new Set([...holdings.map((h) => h.ticker), ...GICS_SECTORS.map((s) => ETF_BY_SECTOR[s]), MARKET])];
  const returns = new Map(symbols.map((sym) => [sym, dates.map((d, t) => totalReturn(prices, dividends, sym, closeDates[t], d))]));

  const rfAt = asOfLookup(prices.get(RISK_FREE));
  const rfLatest = rfAt(asOf);
  const riskFree = rfLatest ? { annual: rfLatest.value / 100, asOf: rfLatest.date } : null;

  // Realized: the scope's own daily returns since inception, with the market and benchmark on the same days.
  const benchByDate = new Map(series.benchmark.map((x) => [x.date, x]));
  const marketIndex = new Map(marketDates.map((d, i) => [d, i]));
  const realized: RealizedInput = { dates: [], portfolio: [], benchmark: [], market: [], riskFree: [] };
  for (const day of series.portfolio) {
    let r: number;
    if (scope.kind === "fund") r = day.ret;
    else {
      const mine = day.positions.filter((p) => series.meta.get(p.ticker)?.teamId === scope.teamId);
      const W = mine.reduce((s, p) => s + p.weight, 0);
      if (W <= 0) continue;
      r = mine.reduce((s, p) => s + p.contribution, 0) / W;
    }
    const bd = benchByDate.get(day.date);
    let bench: number | null = null;
    if (bd) {
      if (scope.kind === "fund") bench = bd.ret;
      else {
        const WB = scope.sectors.reduce((s, k) => s + bd.weights[k], 0);
        bench = WB > 0 ? scope.sectors.reduce((s, k) => s + bd.weights[k] * bd.returns[k], 0) / WB : null;
      }
    }
    const mi = marketIndex.get(day.date);
    const m = mi ? totalReturn(prices, dividends, MARKET, marketDates[mi - 1], day.date) : NaN;
    const rf = rfAt(day.date);
    realized.dates.push(day.date);
    realized.portfolio.push(r);
    realized.benchmark.push(bench);
    realized.market.push(Number.isFinite(m) ? m : null);
    realized.riskFree.push(rf ? rf.value / 100 / 252 : null);
  }

  return {
    scope: scope.kind,
    asOf,
    lookback,
    nav,
    cash,
    holdings,
    benchmarkWeights,
    window: { dates, returns },
    riskFree,
    realized: realized.dates.length ? realized : null,
  };
}
