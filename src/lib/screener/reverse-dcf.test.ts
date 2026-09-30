import { describe, expect, it } from "vitest";
import { buildInputs, enterpriseValueAt, growthAt, notMeaningful, revenueCagr, reverseDcf, roicAt, solveImpliedGrowth, type ReverseDcfInputs } from "./reverse-dcf";
import { healthyYear } from "./test-fixtures";

/*
 * Hand-computed cases. Revenue 1,000, margin 20%, tax 25%: NOPAT today is 150. The expected enterprise values below
 * were worked independently of this code (a separate script following the spec line by line), and the price is set
 * so that price × 100 shares + net debt equals them; the solver has to find the growth back to 0.1 point.
 */
const base: ReverseDcfInputs = { price: 0, shares: 100, revenue: 1000, margin: 0.2, taxRate: 0.25, roic: 0.2, netDebt: 0, rate: 0.1, terminal: 0.025, periodEnd: "2025-12-31" };
const at = (ev: number, over: Partial<ReverseDcfInputs> = {}) => ({ ...base, ...over, price: (ev - (over.netDebt ?? 0)) / 100 });

describe("schedules", () => {
  it("holds growth for five years then fades it to terminal", () => {
    expect([1, 5, 6, 8, 10].map((t) => +growthAt(t, 0.1, 0.025).toFixed(4))).toEqual([0.1, 0.1, 0.085, 0.055, 0.025]);
  });
  it("fades ROIC to max(r + 2 points, ROIC / 2)", () => {
    expect(roicAt(10, 0.3, 0.1, true)).toBeCloseTo(0.15);
    expect(roicAt(10, 0.2, 0.1, true)).toBeCloseTo(0.12);
    expect(roicAt(5, 0.2, 0.1, true)).toBeCloseTo(0.16);
    expect(roicAt(7, 0.2, 0.1, false)).toBe(0.2);
  });
});

describe("solveImpliedGrowth", () => {
  it("closed form: growth at the terminal rate with constant ROIC is a Gordon perpetuity", () => {
    // EV = 150 × 1.025 × (1 − 0.025 / 0.20) / (0.10 − 0.025) = 1,793.75
    expect(enterpriseValueAt(0.025, base, false)).toBeCloseTo(1793.75, 6);
    const r = solveImpliedGrowth(at(1793.75), { fade: false });
    expect(r.status).toBe("ok");
    expect(Math.abs(r.impliedGrowth! - 0.025)).toBeLessThan(0.001);
  });
  it("with the ROIC fade: 8% growth", () => {
    const r = solveImpliedGrowth(at(1938.2736), { fade: true });
    expect(Math.abs(r.impliedGrowth! - 0.08)).toBeLessThan(0.001);
  });
  it("with net debt: the equity value plus net debt is matched", () => {
    const r = solveImpliedGrowth(at(1938.2736, { netDebt: 200 }), { fade: true });
    expect(Math.abs(r.impliedGrowth! - 0.08)).toBeLessThan(0.001);
  });
  it("negative early cash flows: 22% growth outruns a fading 25% ROIC in years 3–5", () => {
    const i = at(3187.2054, { roic: 0.25 });
    const r = solveImpliedGrowth(i, { fade: true });
    expect(Math.abs(r.impliedGrowth! - 0.22)).toBeLessThan(0.001);
  });
  it("shrinking revenue: −5% without the fade", () => {
    const r = solveImpliedGrowth(at(1409.2978), { fade: false });
    expect(Math.abs(r.impliedGrowth! - -0.05)).toBeLessThan(0.001);
  });
  it("value rises with growth across the search range (the bisection's premise)", () => {
    for (const fade of [true, false]) {
      for (const roic of [0.12, 0.2, 0.4]) {
        let prev = -Infinity;
        for (let g = -0.2; g <= roic; g += 0.01) {
          const v = enterpriseValueAt(g, { ...base, roic }, fade);
          expect(v).toBeGreaterThanOrEqual(prev);
          prev = v;
        }
      }
    }
  });
  it("is not meaningful when ROIC is at or below the discount rate", () => {
    expect(solveImpliedGrowth(at(1500, { roic: 0.09 }), { fade: true })).toMatchObject({ status: "not_meaningful", impliedGrowth: null, reason: "ROIC is at or below the discount rate" });
  });
  it("is not meaningful when after-tax operating income isn't positive", () => {
    expect(solveImpliedGrowth(at(1500, { margin: -0.05 }), { fade: true }).status).toBe("not_meaningful");
    expect(notMeaningful(at(1500, { margin: 0 }))).toMatch(/zero or negative/);
  });
  it("is not meaningful outside the search range", () => {
    expect(solveImpliedGrowth(at(10), { fade: true }).reason).toMatch(/shrinking faster than 20%/);
    expect(solveImpliedGrowth(at(1e7), { fade: true }).reason).toMatch(/above the company's ROIC/);
  });
});

describe("inputs and history", () => {
  const years = Array.from({ length: 11 }, (_, i) =>
    healthyYear(`${2025 - i}-12-31`, { revenue: 1000 / 1.1 ** i, ebit: i < 5 ? [200, 180, 220, 160, 240][i] : 100, pretaxIncome: 100, incomeTax: i === 0 ? 40 : 10 }),
  );
  it("averages margin and tax over five years and clamps tax", () => {
    const { inputs } = buildInputs(years, 50, 100, 0.1);
    expect(inputs!.revenue).toBeCloseTo(1000);
    // Margins: 0.2, 0.198, 0.2662, 0.21296, 0.35138 → mean.
    const margins = [200, 180, 220, 160, 240].map((e, i) => e / (1000 / 1.1 ** i));
    expect(inputs!.margin).toBeCloseTo(margins.reduce((a, b) => a + b) / 5, 5);
    // Tax rates 40%, 10%, 10%, 10%, 10% → 16%, inside the 15–30% clamp.
    expect(inputs!.taxRate).toBeCloseTo(0.16);
    expect(inputs!.netDebt).toBe(200);
    expect(inputs!.roic).toBeCloseTo((200 * 0.84) / 1000, 5);
    const lowTax = buildInputs(years.map((y) => ({ ...y, incomeTax: 1 })), 50, 100, 0.1).inputs!;
    expect(lowTax.taxRate).toBe(0.15);
  });
  it("revenue CAGR over 5 and 10 years", () => {
    expect(revenueCagr(years, 5)).toBeCloseTo(0.1, 5);
    expect(revenueCagr(years, 10)).toBeCloseTo(0.1, 5);
    expect(revenueCagr(years.slice(0, 6), 10)).toBeNull();
  });
  it("reports no_data with a reason when an input is missing", () => {
    expect(buildInputs(years, null, 100, 0.1).reason).toBe("No current price");
    expect(buildInputs(years.slice(0, 2), 50, 100, 0.1).reason).toMatch(/three years/);
    const r = reverseDcf({ series: [], price: 50, shares: 100, rate: 0.1, consensusNextYear: 0.05, asOf: "2026-09-29" });
    expect(r).toMatchObject({ status: "no_data", impliedGrowth: null, consensusNextYear: 0.05, inputs: null });
  });
  it("assembles the full result with a five-rate sensitivity table", () => {
    const r = reverseDcf({ series: years, price: 20, shares: 100, rate: 0.1, consensusNextYear: 0.06, asOf: "2026-09-29" });
    expect(r.status).toBe("ok");
    expect(r.sensitivity.map((s) => s.rate)).toEqual([0.08, 0.09, 0.1, 0.11, 0.12]);
    // A higher discount rate needs more growth to justify the same price.
    const g = r.sensitivity.map((s) => s.withFade!);
    expect([...g].sort((a, b) => a - b)).toEqual(g);
    expect(r.sensitivity[2].withFade).toBeCloseTo(r.impliedGrowth!, 6);
    expect(r.hist5).toBeCloseTo(0.1, 4);
  });
});
