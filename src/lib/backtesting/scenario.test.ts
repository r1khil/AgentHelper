import { describe, expect, it } from "vitest";
import {
  activePreset,
  equalWeights,
  presetStart,
  requestWeights,
  roundedWeights,
  scaleTo100,
  tidyWeight,
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
});

describe("saved weights", () => {
  // Saved weights are normalized by a non-round total, so they rarely have two decimals.
  const positions = [
    { id: "a", weight: 0.4 / 0.97 },
    { id: "b", weight: 0.33 / 0.97 },
    { id: "c", weight: 0.24 / 0.97 },
  ];
  it("start as two-decimal inputs totalling 100", () => {
    const baseline = roundedWeights(positions);
    expect(Object.values(baseline).every((w) => /^\d+\.\d{2}$/.test(w))).toBe(true);
    expect(Math.abs(weightTotal(baseline) - 100)).toBeLessThan(1e-6);
  });
  it("send the exact saved weights when nothing was edited", () => {
    const baseline = roundedWeights(positions);
    const sent = requestWeights(positions, { ...baseline, a: "45.00" }, baseline);
    expect(requestWeights(positions, baseline, baseline)).toEqual(
      Object.fromEntries(positions.map((p) => [p.id, p.weight])),
    );
    expect(sent.a).toBe(0.45);
    expect(sent.b / sent.c).toBeCloseTo(0.33 / 0.24, 12);
    expect(Math.abs(Object.values(sent).reduce((s, w) => s + w, 0) - 1)).toBeLessThan(1e-8);
  });
  it("trim typed weights past two decimals", () => {
    expect(tidyWeight("12.3456")).toBe("12.35");
    expect(tidyWeight("12.3")).toBe("12.3");
    expect(tidyWeight("abc")).toBe("abc");
  });
});
