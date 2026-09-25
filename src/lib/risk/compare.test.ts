import { describe, expect, it } from "vitest";
import type { Position } from "@/lib/backtesting/engine";
import { previewWindow } from "./preview";
import { compareScenario } from "./compare";

const positions: Position[] = [
  { id: "a", ticker: "ALPHA", name: "A", weight: 0.6 },
  { id: "b", ticker: "BETA", name: "B", weight: 0.3 },
  { id: "cash", ticker: "CASH", name: "Cash", weight: 0.1, kind: "cash" },
];
const { window, sectorOf } = previewWindow(["ALPHA", "BETA"], 252);
const base = { positions, sectorOf, window, benchmarkWeights: { information_technology: 0.5, health_care: 0.5 }, riskFree: null, scope: "fund" as const, asOf: window.dates.at(-1)!, lookback: "1y" as const, benchmarkLabel: "S&P 500 sectors" };

describe("compareScenario", () => {
  it("matches before and after when nothing changed", () => {
    const r = compareScenario({ ...base, weights: { a: 0.6, b: 0.3, cash: 0.1 } });
    expect(r.after).toEqual(r.before);
    expect(r.sectors).toEqual([]);
  });

  it("lowers volatility and beta when the high-beta holding is trimmed into cash", () => {
    const r = compareScenario({ ...base, weights: { a: 0.5, b: 0.3, cash: 0.2 } });
    expect(r.after.vol).toBeLessThan(r.before.vol);
    expect(r.after.beta).toBeLessThan(r.before.beta);
    const alpha = r.holdings.find((h) => h.ticker === "ALPHA")!;
    expect(alpha.weightBefore).toBeCloseTo(0.6, 12);
    expect(alpha.weightAfter).toBeCloseTo(0.5, 12);
    expect(r.sectors.map((s) => s.label)).toContain("Cash");
  });

  it("combines one ticker held by two teams into a single row", () => {
    const twice: Position[] = [...positions.slice(0, 2), { id: "a2", ticker: "ALPHA", name: "A", weight: 0.05 }, { ...positions[2], weight: 0.05 }];
    const r = compareScenario({ ...base, positions: twice, weights: { a: 0.6, b: 0.3, a2: 0.1, cash: 0 } });
    const alpha = r.holdings.filter((h) => h.ticker === "ALPHA");
    expect(alpha).toHaveLength(1);
    expect(alpha[0].weightBefore).toBeCloseTo(0.65, 12);
    expect(alpha[0].weightAfter).toBeCloseTo(0.7, 12);
  });
});
