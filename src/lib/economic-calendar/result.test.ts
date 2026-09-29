import { describe, expect, it } from "vitest";
import type { EconomicEvent } from "./types";
import { releaseClock, releaseResult } from "./result";

const base: EconomicEvent = {
  id: "x",
  timestamp: "2026-09-25T12:30:00.000Z",
  date: "2026-09-25",
  time: "8:30",
  tentative: false,
  name: "PCE price index, m/m",
  category: null,
  period: null,
  actual: null,
  estimate: "0.3%",
  previous: "0.2%",
  previousBeforeRevision: null,
  importance: 3,
  source: null,
  updatedAt: null,
};
const at = (iso: string) => Date.parse(iso);

describe("releaseResult", () => {
  it("states a released figure against consensus as fact, in words", () => {
    expect(releaseResult({ ...base, actual: "0.3%" }, at("2026-09-25T13:00:00Z"), "2026-09-25", false)).toEqual({ text: "Released 0.3% · in line", tone: "ink" });
    expect(releaseResult({ ...base, actual: "0.4%" }, at("2026-09-25T13:00:00Z"), "2026-09-25", false).text).toBe("Released 0.4% · 0.1 pp above consensus");
    expect(releaseResult({ ...base, actual: "0.2%" }, at("2026-09-25T13:00:00Z"), "2026-09-25", false).text).toBe("Released 0.2% · 0.1 pp below consensus");
  });
  it("is amber when the time has passed with no figure, and grey while awaiting", () => {
    expect(releaseResult(base, at("2026-09-25T15:00:00Z"), "2026-09-25", false)).toEqual({ text: "Time passed, no figure yet", tone: "caution" });
    expect(releaseResult(base, at("2026-09-24T15:00:00Z"), "2026-09-24", false)).toEqual({ text: "Awaiting", tone: "grey" });
  });
  it("never shows an actual stamped for a time that has not arrived", () => {
    expect(releaseResult({ ...base, actual: "0.3%" }, at("2026-09-25T10:00:00Z"), "2026-09-25", false).text).toBe("Awaiting");
  });
  it("counts down to the next release", () => {
    expect(releaseResult(base, at("2026-09-25T11:00:00Z"), "2026-09-25", true)).toEqual({ text: "Next · in 1 h 30 min", tone: "ink" });
  });
  it("reads a time in 12 hours", () => {
    expect(releaseClock(base)).toBe("8:30 AM ET");
    expect(releaseClock({ ...base, timestamp: null, time: "All day" })).toBe("All day");
  });
});
