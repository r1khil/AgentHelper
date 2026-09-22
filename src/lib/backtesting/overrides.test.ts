import { describe, expect, it } from "vitest";
import { weightsFromOverrides } from "./overrides";

const positions = [
  { id: "a", ticker: "AAPL", name: "Apple", weight: 0.5 },
  { id: "b", ticker: "NVDA", name: "Nvidia", weight: 0.3 },
  { id: "c", ticker: "XOM", name: "Exxon", weight: 0.2 },
];
const total = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

describe("weightsFromOverrides", () => {
  it("keeps saved weights with no overrides", () => {
    expect(weightsFromOverrides(positions, {})).toEqual({ a: 0.5, b: 0.3, c: 0.2 });
  });
  it("fixes the named ticker and scales the rest into what is left", () => {
    const w = weightsFromOverrides(positions, { nvda: 60 });
    expect(w.b).toBeCloseTo(0.6);
    expect(w.a).toBeCloseTo((0.5 / 0.7) * 0.4);
    expect(w.c).toBeCloseTo((0.2 / 0.7) * 0.4);
    expect(Math.abs(total(w) - 1)).toBeLessThan(1e-12);
  });
  it("can zero a holding out", () => {
    const w = weightsFromOverrides(positions, { XOM: 0 });
    expect(w.c).toBe(0);
    expect(w.a).toBeCloseTo(0.625);
  });
  it("rejects tickers outside the portfolio and totals over 100%", () => {
    expect(() => weightsFromOverrides(positions, { MSFT: 5 })).toThrow(/not in the portfolio/);
    expect(() => weightsFromOverrides(positions, { AAPL: 70, NVDA: 40 })).toThrow(/more than 100%/);
  });
  it("requires a full portfolio when every holding is overridden", () => {
    expect(() => weightsFromOverrides(positions, { AAPL: 50, NVDA: 20, XOM: 20 })).toThrow(/must total 100%/);
    expect(weightsFromOverrides(positions, { AAPL: 50, NVDA: 25, XOM: 25 })).toEqual({ a: 0.5, b: 0.25, c: 0.25 });
  });
});
