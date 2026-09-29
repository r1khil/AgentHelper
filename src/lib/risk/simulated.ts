import { TRADING_DAYS, mean, stdev, sum } from "./math";
import type { RiskReport } from "./model";

/**
 * Today's positions held through the report's window: the same simulated days as the VaR (today's weights times each
 * day's returns), read as a path. Gives the modeled drawdown and Sharpe ratio the Risk page leads with; the Fund's own
 * (realized) figures stay in the realized section.
 */
export type ModeledPath = {
  dates: string[];
  returns: number[];
  /** Drawdown from the previous high after each day, as a fraction (0 or negative). */
  drawdown: number[];
  max: number;
  /** The high the worst drawdown fell from, and the day it bottomed. */
  peakDate: string;
  troughDate: string;
  sharpe: number | null;
  /** The S&P 500 (SPY) over the same days, for comparison. */
  marketSharpe: number | null;
};

const annualSharpe = (returns: number[], rf: number | null) => {
  if (rf === null || returns.length < 2) return null;
  const sd = stdev(returns) * Math.sqrt(TRADING_DAYS);
  return sd > 0 ? (mean(returns) * TRADING_DAYS - rf) / sd : null;
};

export function modeledPath(r: RiskReport): ModeledPath | null {
  const { dates, columns, weights } = r.matrix;
  const T = dates.length;
  if (T < 2 || !columns.length) return null;
  const returns = dates.map((_, t) => sum(columns.map((col, i) => (weights[i] ? weights[i] * (col[t] ?? 0) : 0))));

  let nav = 1;
  let peak = 1;
  let peakAt = -1;
  let worst = 0;
  let worstAt = -1;
  let worstPeakAt = -1;
  const drawdown = returns.map((x, t) => {
    nav *= 1 + x;
    if (nav >= peak) {
      peak = nav;
      peakAt = t;
    }
    const dd = nav / peak - 1;
    if (dd < worst) {
      worst = dd;
      worstAt = t;
      worstPeakAt = peakAt;
    }
    return dd;
  });

  const rf = r.riskFree ? r.riskFree.annual : null;
  const market = columns.at(-1)!;
  return {
    dates,
    returns,
    drawdown,
    max: worst,
    // A peak before the first day is the start of the window.
    peakDate: worstAt < 0 ? dates[0] : (dates[Math.max(0, worstPeakAt)] ?? dates[0]),
    troughDate: worstAt < 0 ? dates[0] : dates[worstAt],
    sharpe: annualSharpe(returns, rf),
    marketSharpe: annualSharpe(market.map((x) => (Number.isFinite(x) ? x : 0)), rf),
  };
}
