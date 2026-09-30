import { describe, expect, it } from "vitest";
import { intervalChange, nearestCoordinate } from "./interval";

describe("chart interval math", () => {
  it("uses price endpoints and compounds cumulative returns rather than subtracting them", () => {
    expect(intervalChange(100, 120, "price").change).toBe(20);
    expect(intervalChange(100, 120, "price").returnPct).toBeCloseTo(20);
    expect(intervalChange(10, 21, "return").returnPct).toBeCloseTo(10);
    expect(intervalChange(-20, -12, "return").returnPct).toBeCloseTo(10);
  });
  it("labels level differences separately from investment returns", () => {
    expect(intervalChange(-10, -5, "level")).toEqual({
      change: 5,
      returnPct: null,
    });
  });
  it("keeps unavailable observations and invalid/zero baselines unavailable", () => {
    for (const missing of [null, undefined, NaN, Infinity, "12"])
      expect(intervalChange(10, missing, "return")).toEqual({
        change: null,
        returnPct: null,
      });
    expect(intervalChange(0, 20, "price")).toEqual({
      change: 20,
      returnPct: null,
    });
    expect(intervalChange(-100, -90, "return")).toEqual({
      change: 10,
      returnPct: null,
    });
  });
});

describe("observation hit testing", () => {
  it("snaps to real plot coordinates on uneven time axes and categorical dates", () => {
    expect(nearestCoordinate([60, 100, 350], 230)).toBe(2);
    expect(nearestCoordinate([60, 200, 340], 205)).toBe(1);
  });
  it("clamps captured drags outside the plot and does not invent future intraday points", () => {
    expect(nearestCoordinate([60, 100, 350], -200)).toBe(0);
    expect(nearestCoordinate([60, 100, 350], 900)).toBe(2);
  });
  it("ignores missing coordinates and handles empty/one-point histories", () => {
    expect(nearestCoordinate([], 50)).toBeNull();
    expect(nearestCoordinate([undefined, NaN, 60], 50)).toBe(2);
    expect(nearestCoordinate([60], 900)).toBe(0);
  });
});
