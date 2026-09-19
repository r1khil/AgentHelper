import { describe, expect, it } from "vitest";
import {
  emptySelection,
  intervalPerformance,
  selectionBounds,
  selectionReducer as reduce,
} from "./selection";
import { performance } from "./series";

describe("chart interval gestures", () => {
  it("anchors the press, extends while held and keeps the interval after release", () => {
    const down = reduce(emptySelection, { type: "start", index: 2 });
    const drag = reduce(down, { type: "move", index: 8 });
    expect(selectionBounds(drag)).toEqual([2, 8]);
    expect(reduce(drag, { type: "leave" })).toEqual(drag);
    const up = reduce(drag, { type: "end", index: 9 });
    expect(selectionBounds(up)).toEqual([2, 9]);
    expect(up.dragging).toBe(false);
    expect(reduce(up, { type: "lost" })).toEqual(up);
    expect(reduce(up, { type: "hover", index: 12 })).toEqual(up);
    expect(reduce(up, { type: "clear" })).toEqual(emptySelection);
  });
  it("supports reverse dragging and crossing the anchor", () => {
    const down = reduce(emptySelection, { type: "start", index: 8 });
    expect(selectionBounds(reduce(down, { type: "move", index: 2 }))).toEqual([
      2, 8,
    ]);
    expect(selectionBounds(reduce(down, { type: "move", index: 10 }))).toEqual([
      8, 10,
    ]);
    expect(
      selectionBounds(reduce(down, { type: "move", index: 8 })),
    ).toBeNull();
  });
  it("leaves ordinary click/hover as single-point inspection", () => {
    const clicked = reduce(
      reduce(emptySelection, { type: "start", index: 3 }),
      { type: "end", index: 3 },
    );
    expect(clicked).toEqual({ active: 3, anchor: null, dragging: false });
    expect(reduce(clicked, { type: "hover", index: 4 }).active).toBe(4);
    expect(reduce(clicked, { type: "leave" })).toEqual(emptySelection);
  });
  it("cancels interrupted capture and ignores a late release", () => {
    const down = reduce(emptySelection, { type: "start", index: 3 });
    const cancelled = reduce(down, { type: "lost" });
    expect(cancelled).toEqual(emptySelection);
    expect(reduce(cancelled, { type: "end", index: 8 })).toEqual(
      emptySelection,
    );
    expect(reduce(down, { type: "clear" })).toEqual(emptySelection);
  });
  it("extends keyboard selections from the current point including index zero", () => {
    const focused = reduce(emptySelection, { type: "hover", index: 0 });
    const selected = reduce(focused, {
      type: "key",
      index: 1,
      extend: true,
      fallback: 0,
    });
    expect(
      selectionBounds(
        reduce(selected, { type: "key", index: 5, extend: true, fallback: 1 }),
      ),
    ).toEqual([0, 5]);
    expect(
      selectionBounds(
        reduce(selected, { type: "key", index: 2, extend: false, fallback: 1 }),
      ),
    ).toBeNull();
  });
});

describe("selected interval financial math", () => {
  const points = performance([
    { date: "2026-01-01", values: { holding: 100, benchmark: 200 } },
    { date: "2026-01-02", values: { holding: 150, benchmark: 220 } },
    { date: "2026-01-03", values: { holding: 180, benchmark: 242 } },
    { date: "2026-01-04", values: { holding: 0, benchmark: null } },
  ]);
  it("measures both series from the selected starting values, not the chart origin", () => {
    const holding = intervalPerformance(points[1], points[2], "holding");
    const benchmark = intervalPerformance(points[1], points[2], "benchmark");
    expect(holding.change).toBe(30);
    expect(holding.returnPct).toBeCloseTo(20);
    expect(benchmark.returnPct).toBeCloseTo(10);
    expect((holding.returnPct! - benchmark.returnPct!) * 100).toBeCloseTo(1000);
  });
  it("preserves losses, flat intervals and unavailable endpoints", () => {
    expect(intervalPerformance(points[1], points[3], "holding")).toEqual({
      change: -150,
      returnPct: -100,
    });
    expect(intervalPerformance(points[1], points[1], "holding")).toEqual({
      change: 0,
      returnPct: 0,
    });
    expect(intervalPerformance(points[3], points[3], "holding")).toEqual({
      change: 0,
      returnPct: null,
    });
    expect(intervalPerformance(points[1], points[3], "benchmark")).toEqual({
      change: null,
      returnPct: null,
    });
    expect(intervalPerformance(points[1], points[2], "absent")).toEqual({
      change: null,
      returnPct: null,
    });
  });
  it("compounds cumulative return indices for attribution rather than subtracting returns", () => {
    const [start, end] = performance([
      { date: "2026-01-01", values: { fund: 120 } },
      { date: "2026-01-02", values: { fund: 132 } },
    ]);
    expect(intervalPerformance(start, end, "fund").returnPct).toBeCloseTo(10);
  });
});
