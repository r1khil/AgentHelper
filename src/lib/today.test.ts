import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fmtDay } from "@/lib/format";
import { plusDays, weekDayLabel, needsSentence, agendaDate, citationParts, daysAway, greeting, greetingWord, inDays, listNudges, listSentence, marketLine, nextReportByTicker, nextSunday, nudgeAction, nudgeWhen, reportDays, reportsLine, scoreboard, sessionHeading, sessionSentence, sessionStamp, type UpcomingReport } from "./today";

// Dates this year print without the year ("Tue, Sep 22"); pin the clock so these stay 2026's.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

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

describe("Today v2", () => {
  it("says when the market opens or closes, New York time", () => {
    // Mon, Sep 28, 2026, 8:18 NY (EDT = UTC-4).
    expect(marketLine(new Date("2026-09-28T12:18:00Z"))).toBe("Mon, Sep 28. Market opens in 1h 12m. Prices delayed 15 min");
    expect(marketLine(new Date("2026-09-28T15:00:00Z"))).toBe("Mon, Sep 28. Market open, closes in 5h 0m. Prices delayed 15 min");
    expect(marketLine(new Date("2026-09-28T19:45:00Z"))).toBe("Mon, Sep 28. Market open, closes in 15m. Prices delayed 15 min");
    expect(marketLine(new Date("2026-09-28T21:00:00Z"))).toBe("Mon, Sep 28. Market closed, opens tomorrow 9:30 AM ET");
    expect(marketLine(new Date("2026-09-26T15:00:00Z"))).toBe("Sat, Sep 26. Market closed, opens Mon, Sep 28, 9:30 AM ET");
  });

  it("formats greeting, stamps and agenda dates", () => {
    expect(greetingWord(new Date("2026-09-25T12:15:00Z"))).toBe("Morning");
    expect(greetingWord(new Date("2026-09-25T23:00:00Z"))).toBe("Evening");
    expect(sessionStamp("2026-09-25")).toBe(fmtDay("2026-09-25"));
    expect(fmtDay("2026-09-25", new Date("2026-09-28T12:00:00Z"))).toBe("Fri, Sep 25");
    expect(agendaDate("2026-10-13")).toBe("Tue, Oct 13");
    expect(daysAway("2026-09-28", "2026-10-13")).toBe("15 days");
    expect(daysAway("2026-09-28", "2026-09-29")).toBe("tomorrow");
  });

  it("writes Hoot's sentence", () => {
    expect(sessionSentence({ subject: "We", vs: "the S&P 500", diffBps: 25, ret: 0.84, weekday: "Friday" })).toBe("We beat the S&P 500 by 25 bp on Friday.");
    expect(sessionSentence({ subject: "Healthcare", vs: "its sectors", diffBps: -1, ret: -0.5, weekday: "Friday" })).toBe("Healthcare trailed its sectors by 1 bp on Friday.");
    expect(sessionSentence({ subject: "We", vs: "the S&P 500", diffBps: null, ret: -0.3, weekday: "Friday" })).toBe("The Fund lost 0.30% on Friday.");
    expect(listSentence(4, 1)).toBe("I found four things for you, one of them overdue.");
    expect(listSentence(2, 2)).toBe("I found two things for you, both overdue.");
    expect(listSentence(1, 1)).toBe("I found one thing for you, and it's overdue.");
    expect(listSentence(3, 0)).toBe("I found three things for you.");
    expect(listSentence(0, 0)).toBe("Nothing on my list for you right now.");
  });

  it("leads the scoreboard with the result against the benchmark", () => {
    const benchmark = { label: "S&P 500", value: 0.51, unit: "%" as const, tone: false };
    const third = { label: "vs sectors", value: 5, unit: " bp" as const, tone: true };
    // Sep 25: the fund made 0.49% but trailed by 2 bp, so the big figure is (2 bp), not a green 0.49%.
    expect(scoreboard({ name: "Owl Fund", vs: "the S&P 500", ret: 0.49, diffBps: -2, benchmark, third })).toEqual({
      hero: { label: "Owl Fund vs the S&P 500", value: -2, unit: " bp" },
      cells: [{ label: "Owl Fund", value: 0.49, unit: "%", tone: true }, benchmark, third],
    });
    const sectors = { label: "Sector benchmark", value: 1.2, unit: "%" as const, tone: false };
    const toFund = { label: "To the Fund", value: 12, unit: " bp" as const, tone: true };
    expect(scoreboard({ name: "FIG", vs: "its sectors", ret: 0.96, diffBps: -24, benchmark: sectors, third: toFund }).hero).toEqual({ label: "FIG vs its sectors", value: -24, unit: " bp" });
    // No benchmark that day: the return leads.
    expect(scoreboard({ name: "FIG", vs: "its sectors", ret: 0.96, diffBps: null, benchmark: sectors, third: toFund })).toEqual({
      hero: { label: "FIG", value: 0.96, unit: "%" },
      cells: [sectors, { label: "Difference", value: null, unit: " bp", tone: true }, toFund],
    });
  });

  it("orders the list and drops tips", () => {
    const n = (id: string, kind: string, priority: number) => ({ id, kind, priority });
    expect(listNudges([n("a", "weekly", 6), n("tip:x", "tip", 0), n("b", "earnings", 1)]).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("labels list items from what the nudge says", () => {
    const n = (id: string, kind: string, title = "", detail?: string) => ({ id, kind, title, detail });
    expect(nudgeWhen(n("earnings:1:today", "earnings"))).toBe("Reports today");
    expect(nudgeWhen(n("earnings:1:expectations", "earnings", "Write down expectations for JPM", "It reports Tuesday before the open."))).toBe("Reports Tue");
    expect(nudgeWhen(n("weekly:2026-09-25", "weekly"), new Date("2026-09-28T12:00:00Z"))).toBe("Week to Fri, Sep 25");
    expect(nudgeWhen(n("changelog:120", "changelog"))).toBe("PR #120");
    expect(nudgeAction(n("earnings:1:expectations", "earnings"))).toBe("Write them");
    expect(nudgeAction(n("weekly:2026-09-25", "weekly"))).toBe("Review pack");
  });

  it("splits citations out of the brief", () => {
    expect(citationParts("NVDA added 14 bps [1]. UNH cost 7 bps [2][3].")).toEqual(["NVDA added 14 bps", 1, ". UNH cost 7 bps", 2, 3, "."]);
    expect(citationParts("No citations.")).toEqual(["No citations."]);
  });
});

describe("Home's week", () => {
  it("counts days forward and labels them by weekday within the week, by date after", () => {
    expect(plusDays("2026-09-28", 6)).toBe("2026-10-04");
    expect(weekDayLabel("2026-09-28", "2026-09-29")).toBe("Tue");
    expect(weekDayLabel("2026-09-28", "2026-10-04")).toBe("Sun");
    expect(weekDayLabel("2026-09-28", "2026-10-15")).toBe("Oct 15");
  });

  it("says how many things need the reader", () => {
    expect(needsSentence(0)).toBeNull();
    expect(needsSentence(1)).toBe("1 thing needs you.");
    expect(needsSentence(3)).toBe("3 things need you.");
  });
});
