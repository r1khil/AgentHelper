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
  it("lists the current weights when it rejects an unbalanced scenario", () => {
    expect(() => weightsFromOverrides(positions, { nvda: 60 })).toThrow(/Current weights: AAPL 50.00%, NVDA 30.00%, XOM 20.00%/);
  });
  describe("filling the difference", () => {
    const withCash = [
      { id: "a", ticker: "META", name: "Meta", weight: 0.0404 },
      { id: "b", ticker: "GOOG", name: "Alphabet", weight: 0.0498 },
      { id: "c", ticker: "XOM", name: "Exxon", weight: 0.8898 },
      { id: "cash", ticker: "CASH", name: "Cash", weight: 0.02, kind: "cash" as const },
    ];
    it("puts it in cash: META to 5% and GOOG to 3% frees 1.02 pp", () => {
      const w = weightsFromOverrides(withCash, { META: 5, GOOG: 3 }, "cash");
      expect(w.a).toBeCloseTo(0.05);
      expect(w.b).toBeCloseTo(0.03);
      expect(w.c).toBeCloseTo(0.8898);
      expect(w.cash).toBeCloseTo(0.0302);
      expect(Math.abs(total(w) - 1)).toBeLessThan(1e-12);
    });
    it("refuses to overdraw cash, or to move a CASH weight that was named", () => {
      expect(() => weightsFromOverrides(withCash, { META: 10 }, "cash")).toThrow(/only 2.00% cash/);
      expect(() => weightsFromOverrides(withCash, { META: 5, CASH: 1 }, "cash")).toThrow(/CASH was set explicitly/);
    });
    it("spreads it across the unnamed holdings pro rata, leaving cash alone", () => {
      const w = weightsFromOverrides(positions, { NVDA: 40 }, "pro_rata");
      expect(w.b).toBeCloseTo(0.4);
      expect(w.a).toBeCloseTo(0.5 - 0.1 * (0.5 / 0.7));
      expect(w.c).toBeCloseTo(0.2 - 0.1 * (0.2 / 0.7));
      expect(Math.abs(total(w) - 1)).toBeLessThan(1e-12);
      const c = weightsFromOverrides(withCash, { META: 10 }, "pro_rata");
      expect(c.cash).toBeCloseTo(0.02);
      expect(Math.abs(total(c) - 1)).toBeLessThan(1e-12);
    });
    it("says so when nothing is left to fund from", () => {
      expect(() => weightsFromOverrides(positions, { AAPL: 50, NVDA: 20, XOM: 20 }, "pro_rata")).toThrow(/no other holdings/);
      expect(() => weightsFromOverrides(positions, { NVDA: 30.5 }, "cash")).toThrow(/no cash line/);
    });
  });
  it("requires a full portfolio when every holding is overridden", () => {
    expect(() => weightsFromOverrides(positions, { AAPL: 50, NVDA: 20, XOM: 20 })).toThrow(/total 90.00%/);
    expect(weightsFromOverrides(positions, { AAPL: 50, NVDA: 25, XOM: 25 })).toEqual({ a: 0.5, b: 0.25, c: 0.25 });
  });
});
