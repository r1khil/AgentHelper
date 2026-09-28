import { describe, expect, it } from "vitest";
import { agendaDate, analystSentence, citationParts, daysAway, greeting, greetingWord, inDays, listNudges, listSentence, marketLine, nextReportByTicker, nextSunday, nudgeAction, nudgeWhen, owedSentence, reportDays, reportsLine, scoreboard, sessionHeading, sessionSentence, sessionStamp, signed, type UpcomingReport } from "./today";

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
    // Mon 28 Sep 2026, 8:18 NY (EDT = UTC-4).
    expect(marketLine(new Date("2026-09-28T12:18:00Z"))).toBe("MON 28 SEP · MARKET OPENS IN 1H 12M");
    expect(marketLine(new Date("2026-09-28T15:00:00Z"))).toBe("MON 28 SEP · MARKET CLOSES IN 5H 0M");
    expect(marketLine(new Date("2026-09-28T19:45:00Z"))).toBe("MON 28 SEP · MARKET CLOSES IN 15M");
    expect(marketLine(new Date("2026-09-28T21:00:00Z"))).toBe("MON 28 SEP · MARKET CLOSED · OPENS TOMORROW 9:30");
    expect(marketLine(new Date("2026-09-26T15:00:00Z"))).toBe("SAT 26 SEP · MARKET CLOSED · OPENS MON 9:30");
  });

  it("formats greeting, stamps and agenda dates", () => {
    expect(greetingWord(new Date("2026-09-25T12:15:00Z"))).toBe("Morning");
    expect(greetingWord(new Date("2026-09-25T23:00:00Z"))).toBe("Evening");
    expect(sessionStamp("2026-09-25")).toBe("FRI 25 SEP");
    expect(agendaDate("2026-10-13")).toBe("Tue 13 Oct");
    expect(daysAway("2026-09-28", "2026-10-13")).toBe("15 days");
    expect(daysAway("2026-09-28", "2026-09-29")).toBe("tomorrow");
  });

  it("signs figures with a true minus", () => {
    expect(signed(0.84, 2, "%")).toBe("+0.84%");
    expect(signed(-2, 0, " bp")).toBe("\u22122 bp");
    expect(signed(-0.001, 2, "%")).toBe("0.00%");
    expect(signed(null)).toBe("—");
  });

  it("writes Hoot's sentence", () => {
    expect(sessionSentence({ subject: "We", vs: "the S&P 500", diffBps: 25, ret: 0.84, weekday: "Friday" })).toBe("We beat the S&P 500 by 25 bps on Friday.");
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
    // Sep 25: the fund made 0.49% but trailed by 2 bps, so the big figure is (2) bp, not a green 0.49%.
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
    expect(listNudges([n("a", "weekly", 6), n("tip:x", "tip", 0), n("b", "movement", 1)]).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("labels list items from what the nudge says", () => {
    const n = (id: string, kind: string, title = "", detail?: string) => ({ id, kind, title, detail });
    expect(nudgeWhen(n("movement:1:overdue", "movement"))).toBe("Overdue");
    expect(nudgeWhen(n("movement:1:due", "movement", "Your team's UNH write-up is due in 5h"))).toBe("Due in 5h");
    expect(nudgeWhen(n("earnings:1:expectations", "earnings", "Write down expectations for JPM", "It reports Tuesday before the open."))).toBe("Reports Tue");
    expect(nudgeWhen(n("weekly:2026-09-25", "weekly"))).toBe("Week to Sep 25");
    expect(nudgeWhen(n("changelog:120", "changelog"))).toBe("PR #120");
    expect(nudgeAction(n("movement:1:overdue", "movement"))).toBe("Open write-up");
    expect(nudgeAction(n("weekly:2026-09-25", "weekly"))).toBe("Review pack");
  });

  it("dates write-ups in New York time, and says how late they are", () => {
    // Fri 25 Sep 2026, 18:00 NY.
    const now = new Date("2026-09-25T22:00:00Z");
    const m = (id: string, at?: string) => ({ id, kind: "movement", title: "", at });
    expect(nudgeWhen(m("movement:1:due", "2026-09-28T16:00:00Z"), now)).toBe("Due Mon 12:00 ET");
    expect(nudgeWhen(m("movement:1:overdue", "2026-09-23T16:00:00Z"), now)).toBe("2 days overdue");
    expect(nudgeWhen(m("movement:1:team:overdue", "2026-09-25T16:00:00Z"), now)).toBe("6 hours overdue");
    expect(nudgeAction(m("movement:1:team:overdue", "2026-09-25T16:00:00Z"))).toBe("Open write-up");
  });

  it("tells an analyst plainly what their team owes", () => {
    const now = new Date("2026-09-25T22:00:00Z");
    const m = (id: string, at: string) => ({ id: `movement:${id}`, kind: "movement", title: "", at });
    const monday = m("a:due", "2026-09-28T16:00:00Z");
    const late = m("b:overdue", "2026-09-23T16:00:00Z");
    const tomorrow = m("c:due", "2026-09-26T16:00:00Z");
    const earnings = { id: "earnings:e:expectations", kind: "earnings", title: "Write down expectations for JPM" };

    expect(owedSentence([monday], now)).toBe("Your team owes 1 write-up, due 12:00 ET Monday.");
    expect(owedSentence([tomorrow], now)).toBe("Your team owes 1 write-up, due 12:00 ET tomorrow.");
    expect(owedSentence([late], now)).toBe("Your team owes 1 write-up, 2 days overdue.");
    expect(owedSentence([monday, tomorrow], now)).toBe("Your team owes 2 write-ups; the next is due 12:00 ET tomorrow.");
    expect(owedSentence([monday, late], now)).toBe("Your team owes 2 write-ups; one is overdue.");
    expect(owedSentence([late, m("d:overdue", "2026-09-24T16:00:00Z")], now)).toBe("Your team owes 2 write-ups; both are overdue.");
    expect(owedSentence([monday, tomorrow, late], now)).toBe("Your team owes 3 write-ups; one is overdue.");
    // Another team's overdue write-up, which a lead or exec is shown, is not their team's to owe.
    expect(owedSentence([m("x:team:overdue", "2026-09-23T16:00:00Z")], now)).toBeNull();
    expect(analystSentence([monday, m("x:team:overdue", "2026-09-23T16:00:00Z")], now)).toBe("Your team owes 1 write-up, due 12:00 ET Monday. I found one more thing for you.");

    expect(analystSentence([monday], now)).toBe("Your team owes 1 write-up, due 12:00 ET Monday.");
    expect(analystSentence([monday, earnings], now)).toBe("Your team owes 1 write-up, due 12:00 ET Monday. I found one more thing for you.");
    expect(analystSentence([earnings], now)).toBe("I found one thing for you.");
    expect(analystSentence([], now)).toBe("Nothing on my list for you right now.");
  });

  it("splits citations out of the brief", () => {
    expect(citationParts("NVDA added 14 bps [1]. UNH cost 7 bps [2][3].")).toEqual(["NVDA added 14 bps", 1, ". UNH cost 7 bps", 2, 3, "."]);
    expect(citationParts("No citations.")).toEqual(["No citations."]);
  });
});
