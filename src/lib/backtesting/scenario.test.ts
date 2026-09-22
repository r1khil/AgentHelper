import { describe, expect, it } from "vitest";
import {
  activePreset,
  equalWeights,
  presetStart,
  scaleTo100,
  weightChanged,
  weightTotal,
} from "./scenario";

describe("period presets", () => {
  it("counts back from the end date, clamping short months", () => {
    expect(presetStart("3M", "2026-08-31")).toBe("2026-06-01");
    expect(presetStart("1M", "2026-03-31")).toBe("2026-03-01");
    expect(presetStart("1Y", "2026-09-20")).toBe("2025-09-21");
    expect(presetStart("YTD", "2026-09-20")).toBe("2026-01-01");
  });
  it("keeps five years inside the server's range limit", () => {
    const from = presetStart("5Y", "2026-09-20");
    expect(
      (Date.parse("2026-09-20") - Date.parse(from)) / 86400000,
    ).toBeLessThanOrEqual(366 * 5);
  });
  it("recognises a preset only when both ends match", () => {
    expect(activePreset("2026-06-01", "2026-08-31", "2026-08-31")).toBe("3M");
    expect(activePreset("2026-06-01", "2026-08-30", "2026-08-31")).toBeNull();
    expect(activePreset("2026-06-02", "2026-08-31", "2026-08-31")).toBeNull();
  });
});

describe("weight tools", () => {
  it("scales proportionally to exactly 100", () => {
    const scaled = scaleTo100({ a: "60", b: "30", c: "13" })!;
    expect(Math.abs(weightTotal(scaled) - 100)).toBeLessThan(1e-6);
    expect(Number(scaled.a)).toBeCloseTo(58.25, 2);
  });
  it("refuses to scale an empty or invalid set", () => {
    expect(scaleTo100({ a: "0", b: "0" })).toBeNull();
    expect(scaleTo100({ a: "", b: "50" })).toBeNull();
    expect(scaleTo100({ a: "-5", b: "50" })).toBeNull();
  });
  it("splits equal weights with the residual on one holding", () => {
    const weights = equalWeights(["a", "b", "c"]);
    expect(Object.values(weights).sort()).toEqual(["33.33", "33.33", "33.34"]);
    expect(Math.abs(weightTotal(weights) - 100)).toBeLessThan(1e-6);
  });
  it("compares weights numerically", () => {
    expect(weightChanged(0.12, "12.00")).toBe(false);
    expect(weightChanged(0.12, "12.5")).toBe(true);
  });
});
