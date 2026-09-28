import { describe, expect, it } from "vitest";
import { activeRiskBreakdown, bumpCheck } from "./active";
import { previewReport } from "./preview";

describe("activeRiskBreakdown", () => {
  const r = previewReport("1y");
  const a = activeRiskBreakdown(r)!;

  it("adds holdings and the benchmark side up to 100% of active risk and to tracking error", () => {
    expect(a.total).toBeCloseTo(1, 12);
    expect(a.holdingsShare + a.benchmark.share).toBeCloseTo(1, 12);
    const points = a.holdings.reduce((s, h) => s + h.teContribution, 0) + a.benchmark.teContribution;
    expect(points).toBeCloseTo(r.portfolio.trackingError!, 12);
    expect(a.benchmark.weight).toBeCloseTo(-1, 12);
  });

  it("ranks holdings by share of active risk and keeps negative shares negative", () => {
    const shares = a.holdings.map((h) => h.share);
    expect(shares).toEqual([...shares].sort((x, y) => y - x));
    expect(a.holdings).toHaveLength(r.holdings.length);
  });

  it("writes a sentence for the biggest gap and the sizing number", () => {
    expect(a.sentences.length).toBeGreaterThan(0);
    expect(a.sentences.some((s) => /of active risk\.$/.test(s))).toBe(true);
    expect(a.sentences.some((s) => s.startsWith("Adding 100 bp of"))).toBe(true);
  });

  it("returns nothing without a benchmark", () => {
    expect(activeRiskBreakdown({ ...r, portfolio: { ...r.portfolio, trackingError: null, dailyTe: null } })).toBeNull();
  });
});

describe("bumpCheck", () => {
  it("recomputes tracking error after adding 1 pp and lands close to the marginal estimate", () => {
    const r = previewReport("1y");
    for (const h of r.holdings) {
      const c = bumpCheck(r, h.ticker, 0.01)!;
      expect(c.before).toBe(r.portfolio.trackingError);
      // First-order estimate vs exact: the gap is second-order in the 1 pp step.
      expect(Math.abs(c.change - c.linear!)).toBeLessThan(0.0005);
      // TE is convex in the weights, so the exact change sits at or above the tangent line.
      expect(c.change).toBeGreaterThanOrEqual(c.linear! - 1e-12);
    }
    expect(bumpCheck(r, "NOPE")).toBeNull();
  });
});
