import { describe, expect, it } from "vitest";
import { allocationChange, CASH_WEIGHT, HOLDINGS } from "./data";

describe("mock allocation funding", () => {
  it("preserves 100% of NAV when funded from cash or a holding", () => {
    for (const source of ["cash", "MSFT"]) {
      const result = allocationChange("NVDA", 12, source);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(
        result.weights.reduce((s, h) => s + h.nextWeight, result.cash),
      ).toBe(100);
      expect(result.weights.find((h) => h.ticker === "NVDA")?.nextWeight).toBe(
        12,
      );
    }
  });
  it("credits the funding source when reducing a position", () => {
    const result = allocationChange("NVDA", 6, "cash");
    expect(result.ok && result.cash).toBe(CASH_WEIGHT + 4);
  });
  it("rejects unfunded, invalid, and self-funded changes", () => {
    for (const [target, source] of [
      [18, "cash"],
      [15, "COST"],
      [-1, "cash"],
      [NaN, "cash"],
      [12, "NVDA"],
      [12, "unknown"],
    ] as const) {
      expect(allocationChange("NVDA", target, source).ok).toBe(false);
    }
    expect(allocationChange("unknown", 1, "cash").ok).toBe(false);
    expect(HOLDINGS.reduce((s, h) => s + h.weight, CASH_WEIGHT)).toBe(100);
  });
});
