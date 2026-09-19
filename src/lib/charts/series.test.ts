import { describe, expect, it } from "vitest";
import {
  alignPrices,
  availableRanges,
  nearestPoint,
  normalizeObservations,
  performance,
  rangeStart,
  selectRange,
  type Observation,
} from "./series";

const point = (
  date: string,
  holding: number,
  benchmark: number | null = 100,
): Observation => ({ date, values: { holding, benchmark } });

describe("financial chart observations", () => {
  it("aligns exact sessions, sorts, deduplicates and rejects unusable prices", () => {
    const prices = [
      { date: "2026-01-05", close: 20 },
      { date: "2026-01-02", close: 10 },
      { date: "2026-01-05", close: 21 },
      { date: "2026-01-06", close: 22 },
      { date: "2026-01-07", close: 0 },
    ];
    const benchmark = [
      { date: "2026-01-02", close: 100 },
      { date: "2026-01-05", close: 101 },
      { date: "2026-01-07", close: 103 },
    ];
    expect(alignPrices(prices, benchmark)).toEqual([
      point("2026-01-02", 10),
      point("2026-01-05", 21, 101),
    ]);
    expect(prices).toHaveLength(5);
  });
  it("does not turn missing or nonfinite observations into zero or forward-filled values", () => {
    const rows = normalizeObservations([
      point("2026-01-01", 100),
      point("2026-01-02", NaN, null),
      point("2026-01-03", Infinity, -1),
      point("2026-02-30", 99),
      point("bad", 1),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[1].values).toEqual({ holding: null, benchmark: null });
    expect(rows[2].values).toEqual({ holding: null, benchmark: null });
    expect(performance(rows)[1].returns).toEqual({
      holding: null,
      benchmark: null,
    });
  });
  it("compounds rebasing from raw values rather than subtracting prior percentages", () => {
    const data = [
      point("2025-06-30", 100, 1000),
      point("2026-05-29", 150, 1100),
      point("2026-06-30", 180, 1210),
    ];
    const month = performance(selectRange(data, "1M"));
    expect(month[0].returns).toEqual({ holding: 0, benchmark: 0 });
    expect(month.at(-1)!.returns.holding).toBeCloseTo(20);
    expect(month.at(-1)!.returns.benchmark).toBeCloseTo(10);
    expect(
      performance(selectRange(data, "1Y")).at(-1)!.returns.holding,
    ).toBeCloseTo(80);
    expect(data[1].values.holding).toBe(150);
  });
  it("preserves losses, flat returns, missing benchmark bases and a complete loss", () => {
    const values = performance([
      point("2026-01-01", 100, null),
      point("2026-01-02", 100, 101),
      point("2026-01-03", 80, 102),
      point("2026-01-04", 0, 103),
    ]);
    expect(values[1].returns.holding).toBe(0);
    expect(values[2].returns.holding).toBeCloseTo(-20);
    expect(values[3].returns.holding).toBe(-100);
    expect(values.every((p) => p.returns.benchmark === null)).toBe(true);
    expect(
      performance([point("2026-01-01", 0), point("2026-01-02", 10)])[1].returns
        .holding,
    ).toBeNull();
  });
});

describe("calendar-aware ranges and scrubbing", () => {
  it("hides unsupported ranges and anchors to the latest data, not the wall clock", () => {
    expect(availableRanges([])).toEqual([]);
    expect(availableRanges([point("2026-01-01", 100)])).toEqual([]);
    expect(
      availableRanges([point("2020-06-01", 100), point("2020-06-15", 110)]),
    ).toEqual(["1W", "ALL"]);
    expect(
      availableRanges([point("2025-06-01", 100), point("2026-06-15", 110)]),
    ).toEqual(["1W", "1M", "3M", "6M", "YTD", "1Y", "ALL"]);
  });
  it("clamps calendar months and leap years, with the preceding close for weekends", () => {
    expect(
      new Date(rangeStart("2024-03-31", "1M")).toISOString().slice(0, 10),
    ).toBe("2024-02-29");
    expect(
      new Date(rangeStart("2024-02-29", "1Y")).toISOString().slice(0, 10),
    ).toBe("2023-02-28");
    const data = [
      point("2026-05-28", 90),
      point("2026-05-29", 100),
      point("2026-06-01", 110),
      point("2026-06-30", 120),
    ];
    expect(selectRange(data, "1M")[0].date).toBe("2026-05-29");
  });
  it("uses the prior year close for YTD", () => {
    const data = [
      point("2025-12-30", 99),
      point("2025-12-31", 100),
      point("2026-01-02", 101),
      point("2026-06-30", 110),
    ];
    expect(selectRange(data, "YTD")[0].date).toBe("2025-12-31");
  });
  it("snaps by timestamp rather than equally spacing sparse observations", () => {
    const rows = performance([
      point("2026-01-01", 100),
      point("2026-01-02", 101),
      point("2026-02-01", 120),
    ]);
    expect(nearestPoint(rows, Date.parse("2026-01-10"))).toBe(1);
    expect(nearestPoint(rows, Date.parse("2026-01-31"))).toBe(2);
    expect(nearestPoint(rows, -Infinity)).toBe(0);
    expect(nearestPoint(rows, Infinity)).toBe(2);
  });
  it("keeps every observation and its extrema in a dense series", () => {
    const rows = Array.from({ length: 10000 }, (_, i) =>
      point(
        new Date(Date.UTC(2000, 0, i + 1)).toISOString().slice(0, 10),
        i === 5432 ? 1000 : 100,
      ),
    );
    const output = performance(rows);
    expect(output).toHaveLength(10000);
    expect(output[5432].returns.holding).toBe(900);
  });
});
