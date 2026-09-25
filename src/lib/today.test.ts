import { describe, expect, it } from "vitest";
import { greeting, inDays, nextReportByTicker, nextSunday, reportDays, reportsLine, sessionHeading, type UpcomingReport } from "./today";

const r = (ticker: string, reportDate: string, reportHour: string | null, dateStatus: "confirmed" | "estimated" = "confirmed"): UpcomingReport => ({ ticker, reportDate, reportHour, dateStatus });

describe("reportsLine", () => {
  it("groups by time with untimed reports last", () => {
    expect(reportsLine([r("MSFT", "2026-10-28", null), r("META", "2026-10-28", "amc"), r("GOOG", "2026-10-28", "amc"), r("EVR", "2026-10-28", "bmo")])).toBe("META and GOOG after close, EVR before the open, MSFT");
  });

  it("marks the whole line when no date is confirmed", () => {
    expect(reportsLine([r("NEE", "2026-10-27", "bmo", "estimated"), r("THC", "2026-10-27", "bmo", "estimated")])).toBe("NEE and THC before the open (est.)");
  });

  it("marks single tickers when only some are estimated", () => {
    expect(reportsLine([r("PLD", "2026-10-15", null), r("TSM", "2026-10-15", "amc", "estimated")])).toBe("TSM (est.) after close, PLD");
  });
});

describe("reportDays", () => {
  it("keeps the first dates and counts the rest", () => {
    const out = reportDays([r("AXP", "2026-10-23", "bmo"), r("PLD", "2026-10-15", null), r("TSM", "2026-10-15", "amc"), r("AVGO", "2026-12-09", "amc"), r("CI", "2026-11-05", "bmo")], 2);
    expect(out.shown.map((d) => [d.date, d.reports.map((x) => x.ticker)])).toEqual([["2026-10-15", ["PLD", "TSM"]], ["2026-10-23", ["AXP"]]]);
    expect(out.moreCount).toBe(2);
    expect(out.lastDate).toBe("2026-12-09");
  });
});

describe("nextReportByTicker", () => {
  it("keeps each ticker's earliest report", () => {
    expect(nextReportByTicker([r("META", "2027-01-28", "amc"), r("META", "2026-10-28", "amc")]).get("META")?.reportDate).toBe("2026-10-28");
  });
});

describe("dates", () => {
  it("counts calendar days", () => {
    expect(inDays("2026-09-25", "2026-09-25")).toBe("today");
    expect(inDays("2026-09-25", "2026-09-26")).toBe("tomorrow");
    expect(inDays("2026-09-25", "2026-10-15")).toBe("in 20 days");
  });

  it("names the session", () => {
    expect(sessionHeading("2026-09-25", "2026-09-25")).toBe("Today");
    expect(sessionHeading("2026-09-25", "2026-09-24")).toBe("Yesterday");
    expect(sessionHeading("2026-09-28", "2026-09-25")).toBe("Last session");
  });

  it("finds the next Sunday", () => {
    expect(nextSunday("2026-09-25")).toBe("2026-09-27");
    expect(nextSunday("2026-09-27")).toBe("2026-09-27");
  });

  it("greets by New York time", () => {
    expect(greeting(new Date("2026-09-25T12:15:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-09-25T18:00:00Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-09-25T23:00:00Z"))).toBe("Good evening");
  });
});
