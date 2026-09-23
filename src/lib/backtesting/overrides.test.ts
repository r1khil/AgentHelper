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
  it("keeps unspecified holdings fixed and requires an explicit offset", () => {
    expect(() => weightsFromOverrides(positions, { nvda: 60 })).toThrow(/offset/);
    const w = weightsFromOverrides(positions, { nvda: 60, AAPL: 20 });
    expect(w.b).toBeCloseTo(0.6);
    expect(w.a).toBeCloseTo(0.2);
    expect(w.c).toBeCloseTo(0.2);
    expect(Math.abs(total(w) - 1)).toBeLessThan(1e-12);
  });
  it("can offset a holding against cash", () => {
    const withCash = [...positions.slice(0, 2), { ...positions[2], weight: 0.1 }, { id: "cash", ticker: "CASH", name: "Cash", weight: 0.1, kind: "cash" as const }];
    const w = weightsFromOverrides(withCash, { XOM: 0, CASH: 20 });
    expect(w.c).toBe(0);
    expect(w.a).toBeCloseTo(0.5);
    expect(w.cash).toBeCloseTo(0.2);
  });
  it("rejects tickers outside the portfolio and totals over 100%", () => {
    expect(() => weightsFromOverrides(positions, { MSFT: 5 })).toThrow(/not in the portfolio/);
    expect(() => weightsFromOverrides(positions, { AAPL: 70, NVDA: 40 })).toThrow(/total 130.00%/);
  });
  it("requires a full portfolio when every holding is overridden", () => {
    expect(() => weightsFromOverrides(positions, { AAPL: 50, NVDA: 20, XOM: 20 })).toThrow(/total 90.00%/);
    expect(weightsFromOverrides(positions, { AAPL: 50, NVDA: 25, XOM: 25 })).toEqual({ a: 0.5, b: 0.25, c: 0.25 });
  });
});
