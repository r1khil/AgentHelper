/** All returns and weights are decimals, never percentages. No prices are filled or interpolated. */
export type Price = { date: string; close: number };
export type Position = {
  id: string;
  ticker: string;
  name: string;
  weight: number;
};
export type Snapshot = {
  positions: Position[];
  version: string;
  scope: string;
  capturedAt: string;
  savedWeightTotal: number;
};
export type DailyResult = {
  date: string;
  original: number;
  modified: number;
  benchmark: number;
  originalActive: number;
  modifiedActive: number;
  delta: number;
  originalCumulative: number;
  modifiedCumulative: number;
  benchmarkCumulative: number;
  contributions: {
    id: string;
    ticker: string;
    return: number;
    original: number;
    modified: number;
    delta: number;
  }[];
};
export type Metrics = {
  totalReturn: number;
  volatility: number | null;
  maxDrawdown: number;
  upCapture: number | null;
  downCapture: number | null;
  outDays: number;
  underDays: number;
  equalDays: number;
};
export type BacktestResult = {
  baseline: string;
  from: string;
  to: string;
  benchmark: string;
  days: DailyResult[];
  original: Metrics;
  modified: Metrics;
  benchmarkMetrics: Metrics;
  contributions: {
    id: string;
    ticker: string;
    original: number;
    modified: number;
    delta: number;
  }[];
};
export const BENCHMARKS = {
  SPY: "S&P 500 · SPY",
  QQQ: "Nasdaq-100 · QQQ",
  IWM: "Russell 2000 · IWM",
} as const;
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateRange(from: string, to: string) {
  if (!validDate(from) || !validDate(to) || from > to)
    throw new Error(
      "Choose valid start and end dates, with start on or before end.",
    );
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 366 * 5)
    throw new Error("Choose a range of five years or less.");
}
export function normalizePrices(prices: Price[]): Price[] {
  const dates = new Map<string, number>();
  for (const p of prices) {
    if (!validDate(p.date) || !Number.isFinite(p.close) || p.close <= 0)
      throw new Error("History contains an invalid date or adjusted close.");
    if (dates.has(p.date) && dates.get(p.date) !== p.close)
      throw new Error(`Conflicting prices for ${p.date}.`);
    dates.set(p.date, p.close);
  }
  return [...dates]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, close]) => ({ date, close }));
}
export function validateWeights(
  positions: Position[],
  weights: Record<string, number>,
) {
  if (
    !positions.length ||
    new Set(positions.map((p) => p.id)).size !== positions.length
  )
    throw new Error("No valid portfolio positions.");
  if (
    Object.keys(weights).length !== positions.length ||
    positions.some((p) => !Object.hasOwn(weights, p.id))
  )
    throw new Error("Weights must match the current portfolio holdings.");
  const values = positions.map((p) => weights[p.id]);
  if (values.some((w) => !Number.isFinite(w) || w < 0 || w > 1))
    throw new Error("Weights must be between 0% and 100%.");
  if (Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-8)
    throw new Error("Modified weights must total 100%.");
}
const compound = (returns: number[]) =>
  returns.reduce((nav, r) => nav * (1 + r), 1) - 1;
export function metrics(returns: number[], benchmark: number[]): Metrics {
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const volatility =
    returns.length < 2
      ? null
      : Math.sqrt(
          returns.reduce((a, r) => a + (r - mean) ** 2, 0) /
            (returns.length - 1),
        ) * Math.sqrt(252);
  let nav = 1,
    peak = 1,
    maxDrawdown = 0;
  for (const r of returns) {
    nav *= 1 + r;
    peak = Math.max(peak, nav);
    maxDrawdown = Math.min(maxDrawdown, nav / peak - 1);
  }
  function capture(up: boolean) {
    const indices = benchmark
      .map((r, i) => ((up ? r > 0 : r < 0) ? i : -1))
      .filter((i) => i >= 0);
    if (!indices.length) return null;
    // Ratio of geometric mean daily returns in the same benchmark-up/down sessions.
    const p = Math.expm1(
      indices.reduce((s, i) => s + Math.log1p(returns[i]), 0) / indices.length,
    );
    const b = Math.expm1(
      indices.reduce((s, i) => s + Math.log1p(benchmark[i]), 0) /
        indices.length,
    );
    return Math.abs(b) < 1e-12 ? null : p / b;
  }
  const active = returns.map((r, i) => r - benchmark[i]);
  return {
    totalReturn: compound(returns),
    volatility,
    maxDrawdown,
    upCapture: capture(true),
    downCapture: capture(false),
    outDays: active.filter((r) => r > 1e-12).length,
    underDays: active.filter((r) => r < -1e-12).length,
    equalDays: active.filter((r) => Math.abs(r) <= 1e-12).length,
  };
}
export function replay(
  positions: Position[],
  weights: Record<string, number>,
  prices: Record<string, Price[]>,
  benchmark: string,
  from: string,
  to: string,
): BacktestResult {
  validateRange(from, to);
  validateWeights(positions, weights);
  validateWeights(
    positions,
    Object.fromEntries(positions.map((p) => [p.id, p.weight])),
  );
  const bench = normalizePrices(prices[benchmark] ?? []).filter(
    (p) => p.date <= to,
  );
  const baseline = bench.filter((p) => p.date < from).at(-1);
  const sessions = bench.filter((p) => p.date >= from);
  if (!baseline || !sessions.length)
    throw new Error(
      "No completed benchmark sessions or prior closing price in this range.",
    );
  if (Date.parse(sessions[0].date) - Date.parse(baseline.date) > 7 * 86400000)
    throw new Error("Benchmark history has a gap at the start of this range.");
  const bySymbol = new Map<string, Map<string, number>>();
  for (const p of positions)
    if (p.weight > 0 || weights[p.id] > 0)
      bySymbol.set(
        p.ticker,
        new Map(
          normalizePrices(prices[p.ticker] ?? []).map((bar) => [
            bar.date,
            bar.close,
          ]),
        ),
      );
  const benchmarkDates = new Set(bench.map((p) => p.date));
  for (const [ticker, values] of bySymbol) {
    for (const date of values.keys()) {
      if (date >= from && date <= to && !benchmarkDates.has(date))
        throw new Error(
          `${benchmark}: missing benchmark close for ${date}, observed in ${ticker} history. Choose a fully covered range.`,
        );
    }
  }
  let originalNav = 1,
    modifiedNav = 1,
    benchmarkNav = 1,
    prior = baseline;
  const contributions = positions.map((p) => ({
    id: p.id,
    ticker: p.ticker,
    original: 0,
    modified: 0,
    delta: 0,
  }));
  const days: DailyResult[] = [];
  for (const session of sessions) {
    const daily = positions.map((p, i) => {
      let r = 0;
      if (p.weight > 0 || weights[p.id] > 0) {
        const values = bySymbol.get(p.ticker)!;
        const a = values.get(prior.date),
          b = values.get(session.date);
        if (a === undefined || b === undefined)
          throw new Error(
            `${p.ticker}: missing adjusted close for ${a === undefined ? prior.date : session.date}. Choose a fully covered range; no days were filled or skipped.`,
          );
        r = b / a - 1;
      }
      const original = p.weight * r,
        modified = weights[p.id] * r;
      contributions[i].original += originalNav * original;
      contributions[i].modified += modifiedNav * modified;
      contributions[i].delta =
        contributions[i].modified - contributions[i].original;
      return {
        id: p.id,
        ticker: p.ticker,
        return: r,
        original,
        modified,
        delta: modified - original,
      };
    });
    const original = daily.reduce((s, c) => s + c.original, 0),
      modified = daily.reduce((s, c) => s + c.modified, 0);
    const b = session.close / prior.close - 1;
    originalNav *= 1 + original;
    modifiedNav *= 1 + modified;
    benchmarkNav *= 1 + b;
    days.push({
      date: session.date,
      original,
      modified,
      benchmark: b,
      originalActive: original - b,
      modifiedActive: modified - b,
      delta: modified - original,
      originalCumulative: originalNav - 1,
      modifiedCumulative: modifiedNav - 1,
      benchmarkCumulative: benchmarkNav - 1,
      contributions: daily,
    });
    prior = session;
  }
  const b = days.map((d) => d.benchmark);
  return {
    baseline: baseline.date,
    from,
    to,
    benchmark,
    days,
    original: metrics(
      days.map((d) => d.original),
      b,
    ),
    modified: metrics(
      days.map((d) => d.modified),
      b,
    ),
    benchmarkMetrics: metrics(b, b),
    contributions,
  };
}
