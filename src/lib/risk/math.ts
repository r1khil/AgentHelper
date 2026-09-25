/**
 * Portfolio risk statistics. Pure functions on decimal daily returns (0.01 = 1%), so every number
 * on the Risk page can be reproduced in a spreadsheet from the downloadable inputs: sample
 * covariance is Excel's COVARIANCE.S, percentiles are PERCENTILE.INC.
 */

export const TRADING_DAYS = 252;
/** One-tailed 95% standard normal quantile, for parametric VaR. */
export const Z95 = 1.6448536269514722;

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : NaN);

export function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function matVec(m: number[][], v: number[]) {
  return m.map((row) => dot(row, v));
}

/** Sample covariance (n − 1), like COVARIANCE.S. */
export function covariance(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

export const variance = (a: number[]) => covariance(a, a);
export const stdev = (a: number[]) => Math.sqrt(variance(a));

/** Covariance matrix of complete, equal-length return columns. */
export function covarianceMatrix(columns: number[][]): number[][] {
  const n = columns.length;
  const means = columns.map(mean);
  const T = columns[0]?.length ?? 0;
  const out = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) s += (columns[i][t] - means[i]) * (columns[j][t] - means[j]);
      out[i][j] = out[j][i] = T > 1 ? s / (T - 1) : NaN;
    }
  }
  return out;
}

export function correlationMatrix(cov: number[][]): number[][] {
  return cov.map((row, i) => row.map((c, j) => {
    const d = Math.sqrt(cov[i][i] * cov[j][j]);
    return d > 0 ? c / d : i === j ? 1 : 0;
  }));
}

/** OLS slope of `asset` on `market`: cov(asset, market) / var(market). */
export function beta(asset: number[], market: number[]) {
  const v = variance(market);
  return v > 0 ? covariance(asset, market) / v : NaN;
}

/**
 * Euler decomposition of portfolio volatility. `marginal[i]` is (Σw)ᵢ, the covariance of asset i with
 * the portfolio; `contribution[i]` = wᵢ(Σw)ᵢ / σ, so contributions add up to σ exactly, and `share`
 * (contribution / σ) adds up to 100%. All in daily units.
 */
export function riskDecomposition(weights: number[], cov: number[][]) {
  const marginal = matVec(cov, weights);
  const varianceP = Math.max(0, dot(weights, marginal));
  const sigma = Math.sqrt(varianceP);
  const contribution = weights.map((w, i) => (sigma > 0 ? (w * marginal[i]) / sigma : 0));
  const share = weights.map((w, i) => (varianceP > 0 ? (w * marginal[i]) / varianceP : 0));
  return { variance: varianceP, sigma, marginal, contribution, share };
}

/** Excel PERCENTILE.INC on an ascending-sorted array: rank p·(n − 1), linearly interpolated. */
export function percentileInc(sortedAsc: number[], p: number) {
  const n = sortedAsc.length;
  if (!n) return NaN;
  const rank = p * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.min(n - 1, lo + 1);
  return sortedAsc[lo] + (rank - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

/**
 * Historical-simulation value at risk. VaR is the loss at the (1 − level) percentile of the daily
 * returns; expected shortfall is the average of the returns at or below that percentile. Both are
 * reported as positive loss fractions.
 */
export function historicalVaR(returns: number[], level = 0.95) {
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = percentileInc(sorted, 1 - level);
  const tail = sorted.filter((r) => r <= cutoff);
  return { var: -cutoff, es: tail.length ? -mean(tail) : NaN, cutoff, tailCount: tail.length, observations: sorted.length };
}

/** Drawdown from the running peak after each return, starting from a peak of 1. */
export function drawdowns(returns: number[]) {
  let nav = 1;
  let peak = 1;
  let max = 0;
  let maxAt = -1;
  const series = returns.map((r, i) => {
    nav *= 1 + r;
    peak = Math.max(peak, nav);
    const dd = nav / peak - 1;
    if (dd < max) { max = dd; maxAt = i; }
    return dd;
  });
  return { series, max, maxAt, current: series.at(-1) ?? 0 };
}

/** Herfindahl-Hirschman index of weights rescaled to 100%, and its reciprocal, the effective number of positions. */
export function concentration(weights: number[]) {
  const total = sum(weights.filter((w) => w > 0));
  if (total <= 0) return { hhi: NaN, effectiveN: NaN };
  const hhi = sum(weights.filter((w) => w > 0).map((w) => (w / total) ** 2));
  return { hhi, effectiveN: 1 / hhi };
}

export const annualizeVol = (dailySigma: number) => dailySigma * Math.sqrt(TRADING_DAYS);
