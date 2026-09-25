import { describe, expect, it } from "vitest";
import type { Position } from "./engine";
import { applyTrade, fundingIds, parseTradeParam, toPercentStrings, tradeParam } from "./trade";

const positions: Position[] = [
  { id: "a", ticker: "AAA", name: "A", weight: 0.4 },
  { id: "b", ticker: "BBB", name: "B", weight: 0.3 },
  { id: "c", ticker: "CCC", name: "C", weight: 0.2 },
  { id: "cash", ticker: "CASH", name: "Cash", weight: 0.1, kind: "cash" },
];
const saved = Object.fromEntries(positions.map((p) => [p.id, p.weight]));
const total = (w: Record<string, number>) => Object.values(w).reduce((s, x) => s + x, 0);

describe("applyTrade", () => {
  it("trims into cash", () => {
    const w = applyTrade(positions, saved, { ticker: "aaa", changePp: -5, funding: { kind: "cash" } });
    expect(w.a).toBeCloseTo(0.35, 12);
    expect(w.cash).toBeCloseTo(0.15, 12);
    expect(total(w)).toBeCloseTo(1, 12);
  });

  it("adds pro rata from the other holdings, not cash", () => {
    const w = applyTrade(positions, saved, { ticker: "CCC", changePp: 5, funding: { kind: "pro_rata" } });
    expect(w.c).toBeCloseTo(0.25, 12);
    // 5pp taken from AAA and BBB in a 40:30 ratio.
    expect(w.a).toBeCloseTo(0.4 - 0.05 * (4 / 7), 12);
    expect(w.b).toBeCloseTo(0.3 - 0.05 * (3 / 7), 12);
    expect(w.cash).toBeCloseTo(0.1, 12);
    expect(total(w)).toBeCloseTo(1, 12);
  });

  it("swaps between two holdings", () => {
    const w = applyTrade(positions, saved, { ticker: "BBB", changePp: -10, funding: { kind: "ticker", ticker: "CCC" } });
    expect(w.b).toBeCloseTo(0.2, 12);
    expect(w.c).toBeCloseTo(0.3, 12);
  });

  it("stops at zero and refuses to overdraw", () => {
    expect(applyTrade(positions, saved, { ticker: "CCC", changePp: -50, funding: { kind: "cash" } }).c).toBe(0);
    expect(() => applyTrade(positions, saved, { ticker: "AAA", changePp: 20, funding: { kind: "cash" } })).toThrow(/Only 10.00% cash/);
    expect(() => applyTrade(positions, saved, { ticker: "CASH", changePp: 1, funding: { kind: "pro_rata" } })).toThrow(/not a holding/);
  });
});

describe("trade links", () => {
  it("round-trips", () => {
    const t = parseTradeParam("avgo:-2:cash")!;
    expect(t).toEqual({ ticker: "AVGO", changePp: -2, funding: { kind: "cash" } });
    expect(parseTradeParam(tradeParam({ ticker: "MSFT", changePp: 1.5, funding: { kind: "ticker", ticker: "GOOG" } }))).toEqual({ ticker: "MSFT", changePp: 1.5, funding: { kind: "ticker", ticker: "GOOG" } });
    expect(parseTradeParam("nope")).toBeNull();
    expect(parseTradeParam("AAA:0:cash")).toBeNull();
  });
});

describe("toPercentStrings", () => {
  it("keeps the total exact after rounding pro-rata changes", () => {
    const many: Position[] = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, ticker: `T${i}`, name: "", weight: 1 / 7 }));
    const w = applyTrade(many, Object.fromEntries(many.map((p) => [p.id, p.weight])), { ticker: "T0", changePp: 1, funding: { kind: "pro_rata" } });
    const s = toPercentStrings(w, fundingIds(many, { ticker: "T0", changePp: 1, funding: { kind: "pro_rata" } }));
    expect(Object.values(s).reduce((a, x) => a + Math.round(Number(x) * 100), 0)).toBe(10_000);
    expect(s.p0).toBe("15.29");
  });
});
