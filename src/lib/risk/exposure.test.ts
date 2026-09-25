import { describe, expect, it } from "vitest";
import { buildExposure } from "./exposure";
import { previewReport } from "./preview";

describe("buildExposure", () => {
  const r = previewReport("1y");
  const x = buildExposure(r);

  it("reads the same numbers the Risk page shows", () => {
    expect(x.top.weight).toBeCloseTo(r.portfolio.top10, 12);
    expect(x.top.holdings).toHaveLength(10);
    expect(x.effectiveN).toBe(r.portfolio.effectiveN);
    expect(x.cash).toEqual(r.cash);
    expect(x.sectors).toHaveLength(r.sectors.length);
  });

  it("sorts sectors from the largest overweight to the largest underweight, cash last", () => {
    const actives = x.sectors.filter((s) => s.key !== "cash").map((s) => s.active!);
    expect(actives).toEqual([...actives].sort((a, b) => b - a));
    expect(x.sectors.at(-1)!.key).toBe("cash");
  });

  it("picks the largest absolute sector bet and balances overweights against underweights", () => {
    const nonCash = x.sectors.filter((s) => s.key !== "cash");
    expect(Math.abs(x.largestBet!.active!)).toBe(Math.max(...nonCash.map((s) => Math.abs(s.active!))));
    expect(x.largestBet!.etf).toMatch(/^XL/);
    // Both sides of the book add to 100%, so what is over must equal what is under.
    expect(x.overweight! + x.underweight!).toBeCloseTo(0, 12);
  });

  it("falls back to weights when no benchmark is saved", () => {
    const noBench = buildExposure({ ...r, sectors: r.sectors.map((s) => ({ ...s, benchWeight: null, active: null })) });
    expect(noBench.largestBet).toBeNull();
    expect(noBench.overweight).toBeNull();
    const weights = noBench.sectors.filter((s) => s.key !== "cash").map((s) => s.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });
});
