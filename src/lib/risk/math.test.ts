import { describe, expect, it } from "vitest";
import { beta, concentration, correlationMatrix, covariance, covarianceMatrix, drawdowns, historicalVaR, marginalVol, percentileInc, riskDecomposition, stdev, volAfterBump } from "./math";

describe("risk math", () => {
  it("matches COVARIANCE.S and STDEV.S", () => {
    const a = [0.01, -0.02, 0.03, 0.0];
    const b = [0.02, -0.01, 0.01, 0.01];
    // Hand-computed: means 0.005 and 0.0075.
    expect(covariance(a, b)).toBeCloseTo(0.000183333333, 10);
    expect(stdev(a)).toBeCloseTo(0.0208166600, 9);
  });

  it("recovers a known beta", () => {
    const m = [0.01, -0.02, 0.015, 0.003, -0.007, 0.012];
    const asset = m.map((r) => 1.5 * r + 0.001);
    expect(beta(asset, m)).toBeCloseTo(1.5, 12);
    expect(beta(m, m)).toBeCloseTo(1, 12);
  });

  it("splits volatility into contributions that add up", () => {
    const cols = [
      [0.01, -0.02, 0.015, 0.003, -0.007],
      [0.002, -0.01, 0.02, -0.004, 0.001],
      [-0.005, 0.004, 0.001, 0.006, -0.002],
    ];
    const cov = covarianceMatrix(cols);
    const w = [0.5, 0.3, 0.2];
    const d = riskDecomposition(w, cov);
    const direct = stdev(cols[0].map((_, t) => w[0] * cols[0][t] + w[1] * cols[1][t] + w[2] * cols[2][t]));
    expect(d.sigma).toBeCloseTo(direct, 12);
    expect(d.contribution.reduce((a, b) => a + b, 0)).toBeCloseTo(d.sigma, 12);
    expect(d.share.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const corr = correlationMatrix(cov);
    expect(corr[0][0]).toBeCloseTo(1, 12);
    expect(corr[0][1]).toBeCloseTo(corr[1][0], 12);
  });

  it("interpolates percentiles like PERCENTILE.INC", () => {
    expect(percentileInc([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
    expect(percentileInc([1, 2, 3, 4, 5], 0.05)).toBeCloseTo(1.2, 12);
  });

  it("reports historical VaR and expected shortfall as losses", () => {
    const r = Array.from({ length: 21 }, (_, i) => (i - 10) / 1000); // −1.0% … +1.0%
    const v = historicalVaR(r, 0.95);
    // rank 0.05 × 20 = 1 → the second-lowest return, −0.9%.
    expect(v.var).toBeCloseTo(0.009, 12);
    expect(v.es).toBeCloseTo(0.0095, 12);
    expect(v.tailCount).toBe(2);
  });

  it("tracks the deepest and current drawdown", () => {
    const d = drawdowns([0.1, -0.2, 0.05, 0.3]);
    expect(d.max).toBeCloseTo(-0.2, 12);
    expect(d.maxAt).toBe(1);
    expect(d.current).toBe(0);
  });

  it("measures concentration", () => {
    expect(concentration([0.25, 0.25, 0.25, 0.25]).effectiveN).toBeCloseTo(4, 12);
    expect(concentration([0.9, 0.1]).hhi).toBeCloseTo(0.82, 12);
  });
  it("gives marginal volatility (Σw)ᵢ ÷ σ that matches a numerical bump of each weight", () => {
    const cov = [
      [0.0004, 0.00012, -0.00005],
      [0.00012, 0.0009, 0.0001],
      [-0.00005, 0.0001, 0.0002],
    ];
    // Long, long and short, like active weights against a benchmark.
    const w = [0.5, 0.3, -0.6];
    const sigma = Math.sqrt(riskDecomposition(w, cov).variance);
    const analytic = marginalVol(w, cov);
    const h = 1e-6;
    for (let i = 0; i < w.length; i++) {
      // Central difference: (σ(w + h·eᵢ) − σ(w − h·eᵢ)) ÷ 2h.
      const numeric = (volAfterBump(w, cov, i, h) - volAfterBump(w, cov, i, -h)) / (2 * h);
      expect(analytic[i]).toBeCloseTo(numeric, 8);
    }
    // Euler: weights times marginals add back up to σ.
    expect(w.reduce((s, wi, i) => s + wi * analytic[i], 0)).toBeCloseTo(sigma, 12);
    expect(marginalVol([0, 0, 0], cov)).toEqual([0, 0, 0]);
  });
});
