import { describe, expect, it } from "vitest";
import type { EconomicEvent } from "./types";
import {
  daySummary,
  isAhead,
  nextRelease,
  rangeLabel,
  shownActual,
  surprise,
  untilText,
} from "./view";

const event = (over: Partial<EconomicEvent>): EconomicEvent => ({
  id: over.name ?? "e",
  timestamp: null,
  date: "2026-09-23",
  time: "TBA",
  tentative: false,
  name: "Event",
  category: null,
  period: null,
  actual: null,
  estimate: null,
  previous: null,
  previousBeforeRevision: null,
  importance: 2,
  source: null,
  updatedAt: null,
  ...over,
});
// 9:52 AM ET on Wednesday, Sep 23, 2026.
const now = Date.parse("2026-09-23T13:52:00Z");

describe("surprise", () => {
  it("reads direction and size in the actual's own unit", () => {
    expect(surprise("52.4", "52.0")).toEqual({
      dir: "above",
      text: "0.4 above",
    });
    expect(surprise("53.9", "54.0")).toEqual({
      dir: "below",
      text: "0.1 below",
    });
    expect(surprise("-$251.3B", "-$259.0B")).toEqual({
      dir: "above",
      text: "$7.7B above",
    });
    expect(surprise("0.3%", "0.2%")).toEqual({
      dir: "above",
      text: "0.1 pp above",
    });
    expect(surprise("218K", "232K")).toEqual({
      dir: "below",
      text: "14K below",
    });
    expect(surprise("−9", "-5")).toEqual({ dir: "below", text: "4 below" });
  });
  it("calls equal values in line, including after rounding", () => {
    expect(surprise("2.50%", "2.5%")).toEqual({
      dir: "inline",
      text: "In line",
    });
  });
  it("says when there is no consensus and refuses to compare different units", () => {
    expect(surprise("3.8%", null)).toEqual({ dir: "none" });
    expect(surprise("3.8%", "3.8M")).toBeNull();
    expect(surprise("n/a", "1")).toBeNull();
    expect(surprise(null, "1")).toBeNull();
  });
});

describe("timing", () => {
  const released = event({
    name: "MBA",
    timestamp: "2026-09-23T11:00:00Z",
    actual: "3.8%",
  });
  const homes = event({
    name: "New Home Sales",
    timestamp: "2026-09-23T14:00:00Z",
  });
  const oil = event({ name: "EIA", timestamp: "2026-09-23T14:30:00Z" });
  const undated = event({ name: "Speech", date: "2026-09-24" });

  it("finds the next timed release and skips ones without a time", () => {
    expect(nextRelease([released, undated, oil, homes], now)?.name).toBe(
      "New Home Sales",
    );
    expect(nextRelease([released], now)).toBeNull();
  });
  it("hides an actual stamped for a time still ahead", () => {
    expect(shownActual({ ...homes, actual: "650K" }, now)).toBeNull();
    expect(shownActual(released, now)).toBe("3.8%");
  });
  it("counts undated events as ahead until their day is over", () => {
    expect(isAhead(undated, now, "2026-09-23")).toBe(true);
    expect(isAhead({ ...undated, date: "2026-09-22" }, now, "2026-09-23")).toBe(
      false,
    );
    expect(isAhead(released, now, "2026-09-23")).toBe(false);
  });
  it("words the countdown", () => {
    expect(untilText(8 * 60_000)).toBe("in 8 min");
    expect(untilText(7.5 * 60_000)).toBe("in 8 min");
    expect(untilText(188 * 60_000)).toBe("in 3 h 8 min");
    expect(untilText(120 * 60_000)).toBe("in 2 h");
    expect(untilText(50 * 3_600_000)).toBe("in 2 days");
  });
});

describe("labels", () => {
  it("summarizes a day by its most important prints", () => {
    const day = [
      event({
        name: "Current Account",
        timestamp: "2026-09-22T12:30:00Z",
        actual: "-$251.3B",
        estimate: "-$259.0B",
      }),
      event({
        name: "Manufacturing PMI",
        importance: 3,
        timestamp: "2026-09-22T13:45:00Z",
        actual: "52.4",
        estimate: "52.0",
      }),
      event({
        name: "Services PMI",
        importance: 3,
        timestamp: "2026-09-22T13:45:00Z",
        actual: "53.9",
        estimate: "53.9",
      }),
    ];
    expect(daySummary(day, now)).toBe(
      "Manufacturing PMI 52.4 (0.4 above) · Services PMI 53.9 (in line)",
    );
    expect(
      daySummary(
        [event({ name: "Fed Speech" }), event({ name: "Fed Speech" })],
        now,
      ),
    ).toBe("Fed Speech");
  });
  it("formats the week across months and years", () => {
    expect(rangeLabel({ from: "2026-09-21", to: "2026-09-27" })).toBe(
      "Sep 21 – 27, 2026",
    );
    expect(rangeLabel({ from: "2026-09-28", to: "2026-10-04" })).toBe(
      "Sep 28 – Oct 4, 2026",
    );
    expect(rangeLabel({ from: "2026-12-28", to: "2027-01-03" })).toBe(
      "Dec 28, 2026 – Jan 3, 2027",
    );
  });
});
