import { describe, expect, it } from "vitest";
import { joinHistory, rangeReach, replayLevels, sliceRange, type ChartPoint } from "./chart";

describe("replayLevels", () => {
  it("compounds the weighted mix, and a missing return takes the sector ETF's, else nothing", () => {
    const levels = replayLevels([0.5, 0.5], [[0.02, -0.01], [Number.NaN, 0.01]], [undefined, [0.03, 0]], 2);
    expect(levels[0]).toBeCloseTo(1.025, 6);
    // Day two: 0.5 × (−1%) + 0.5 × (+1%) = 0.
    expect(levels[1]).toBeCloseTo(1.025, 6);
  });

  it("leaves cash (weight not in the list) flat", () => {
    expect(replayLevels([0.4], [[0.1]], [undefined], 1)[0]).toBeCloseTo(1.04, 6);
  });
});

describe("joinHistory", () => {
  const replay = { dates: ["2026-09-15", "2026-09-16", "2026-09-17"], levels: [1, 1.1, 1.21] };

  it("scales the replay to meet the ledger's opening value, and drops replay days the ledger covers", () => {
    const points = joinHistory(replay, [
      { date: "2026-09-17", value: 1000 },
      { date: "2026-09-18", value: 1010 },
    ]);
    expect(points.map((p) => [p.date, p.replay])).toEqual([
      ["2026-09-15", true],
      ["2026-09-16", true],
      ["2026-09-17", false],
      ["2026-09-18", false],
    ]);
    expect(points[0].value).toBeCloseTo(1000 / 1.21, 6);
    expect(points[1].value).toBeCloseTo(1000 / 1.1, 6);
    expect(points[2].value).toBe(1000);
  });

  it("meets the ledger at the last replay day before it when the opening day has no replay price", () => {
    const points = joinHistory({ dates: ["2026-09-15", "2026-09-16"], levels: [1, 1.1] }, [{ date: "2026-09-17", value: 1100 }]);
    expect(points.map((p) => p.replay)).toEqual([true, true, false]);
    expect(points[1].value).toBeCloseTo(1100, 6);
  });

  it("is the ledger alone when there is no replay, and empty for an empty ledger", () => {
    expect(joinHistory({ dates: [], levels: [] }, [{ date: "2026-09-17", value: 5 }]).map((p) => p.replay)).toEqual([false]);
    expect(joinHistory(replay, [])).toEqual([]);
  });
});

describe("ranges", () => {
  const day = (i: number): ChartPoint => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), value: i, replay: i < 10 });
  const points = Array.from({ length: 120 }, (_, i) => day(i));

  it("counts back from the last point and keeps everything for All", () => {
    const week = sliceRange(points, "1W");
    expect(week[0].date >= "2026-04-22").toBe(true);
    expect(week.at(-1)).toEqual(points.at(-1));
    expect(sliceRange(points, "All")).toHaveLength(120);
  });

  it("offers only the ranges the history reaches", () => {
    const reach = rangeReach(points);
    expect(reach).toEqual({ "1W": true, "1M": true, "3M": true, "1Y": false, All: true });
  });
});
