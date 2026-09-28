import { describe, expect, it } from "vitest";
import type { Bellwether } from "@/db/schema";
import {
  buildMiniMonth,
  buildMonthGrid,
  calendarHref,
  defaultSelectedDay,
  expectationsState,
  filterCalendarEvents,
  groupByDate,
  industryOptions,
  marketDayNote,
  parseCalendarQuery,
  toCalendarEvents,
  toggleKind,
  weekDays,
  weekStart,
  type CalendarEvent,
  type HoldingEventRow,
} from "./earnings-calendar";

const TEAM = "team-tech";
const OTHER = "team-fig";

function holding(over: Partial<CalendarEvent> & { ticker: string; date: string }): CalendarEvent {
  return { name: over.ticker, kind: "holding", sector: null, industry: null, reportHour: null, dateStatus: "estimated", epsEstimate: null, epsCurrency: null, earningsId: `e-${over.ticker}`, teamId: TEAM, teamSlug: "tech", teamName: "Tech", ...over };
}
function bell(over: Partial<CalendarEvent> & { ticker: string; date: string }): CalendarEvent {
  return { name: over.ticker, kind: "bellwether", sector: "information_technology", industry: null, reportHour: null, dateStatus: "estimated", epsEstimate: null, epsCurrency: null, etf: "XLK", weightPct: "5.0000", ...over };
}

describe("buildMonthGrid", () => {
  it("frames October 2026 in five Monday-to-Friday rows", () => {
    const g = buildMonthGrid("2026-10");
    expect(g.start).toBe("2026-09-28");
    expect(g.end).toBe("2026-10-30");
    expect(g.weeks).toHaveLength(5);
    expect(g.weeks.every((w) => w.length === 5)).toBe(true);
    expect(g.weeks[0][0]).toEqual({ date: "2026-09-28", inMonth: false, trading: true });
    expect(g.weeks[0][3].inMonth).toBe(true);
    expect(g.label).toBe("October 2026");
  });

  it("skips a leading weekend and flags holidays", () => {
    const g = buildMonthGrid("2026-11"); // Nov 1 is a Sunday
    expect(g.start).toBe("2026-11-02");
    expect(g.end).toBe("2026-12-04");
    const thanksgiving = g.weeks.flat().find((d) => d.date === "2026-11-26");
    expect(thanksgiving?.trading).toBe(false);
    expect(g.weeks.flat().find((d) => d.date === "2026-11-25")?.trading).toBe(true);
  });

  it("navigates across the year boundary", () => {
    expect(buildMonthGrid("2026-12").nextMonth).toBe("2027-01");
    expect(buildMonthGrid("2027-01").prevMonth).toBe("2026-12");
  });
});

describe("parseCalendarQuery", () => {
  const today = "2026-09-17";
  const ALL = ["holdings", "bellwethers", "economic"];
  it("uses defaults for missing or invalid values", () => {
    expect(parseCalendarQuery({}, today)).toEqual({ scope: "sector", layout: "week", month: "2026-09", day: undefined, industry: undefined, show: ALL });
    expect(parseCalendarQuery({ view: "bogus", month: "2026-13", day: "nope" }, today)).toEqual({ scope: "sector", layout: "week", month: "2026-09", day: undefined, industry: undefined, show: ALL });
    expect(parseCalendarQuery({ day: "2026-02-30" }, today).day).toBeUndefined();
  });
  it("accepts valid values, arrays and trims the industry", () => {
    expect(parseCalendarQuery({ scope: ["fund", "sector"], view: "month", month: "2026-10", day: "2026-10-22", industry: "  Semiconductors " }, today)).toEqual({
      scope: "fund",
      layout: "month",
      month: "2026-10",
      day: "2026-10-22",
      industry: "Semiconductors",
      show: ALL,
    });
  });
  it("still reads a scope from ?view= in links made before the merge", () => {
    expect(parseCalendarQuery({ view: "industry" }, today)).toMatchObject({ scope: "industry", layout: "week" });
    expect(parseCalendarQuery({ view: "list", scope: "fund" }, today)).toMatchObject({ scope: "fund", layout: "list" });
  });
  it("takes the month from the day when no month is given", () => {
    expect(parseCalendarQuery({ day: "2026-11-03" }, today).month).toBe("2026-11");
  });
  it("reads the Show filters, with the route's default when absent", () => {
    expect(parseCalendarQuery({ show: "economic,holdings,bogus" }, today).show).toEqual(["holdings", "economic"]);
    expect(parseCalendarQuery({ show: "none" }, today).show).toEqual([]);
    expect(parseCalendarQuery({}, today, ["economic"]).show).toEqual(["economic"]);
  });
});

describe("calendarHref", () => {
  const q = { scope: "sector", layout: "week", month: "2026-10", show: ["holdings", "bellwethers", "economic"] } as const;
  it("always writes scope and month and only the optional parts that are set", () => {
    expect(calendarHref("/t/tech/earnings", { ...q, show: [...q.show] })).toBe("/t/tech/earnings?scope=sector&month=2026-10");
    expect(calendarHref("/t/tech/earnings", { ...q, show: [...q.show], scope: "industry", layout: "list", day: "2026-10-22", industry: "Software—Infrastructure" })).toBe(
      "/t/tech/earnings?scope=industry&view=list&month=2026-10&day=2026-10-22&industry=Software%E2%80%94Infrastructure",
    );
  });
  it("writes the Show filters only when they differ from the route's default", () => {
    expect(calendarHref("/t/tech/earnings", { ...q, show: ["economic", "holdings"] })).toBe("/t/tech/earnings?scope=sector&month=2026-10&show=holdings%2Ceconomic");
    expect(calendarHref("/t/tech/earnings", { ...q, show: [] })).toBe("/t/tech/earnings?scope=sector&month=2026-10&show=none");
    expect(calendarHref("/t/tech/economic-calendar", { ...q, show: ["economic"] }, ["economic"])).toBe("/t/tech/economic-calendar?scope=sector&month=2026-10");
    const back = calendarHref("/t/tech/economic-calendar", { ...q, show: [...q.show] }, ["economic"]);
    expect(parseCalendarQuery(Object.fromEntries(new URL(back, "http://x").searchParams), "2026-10-01", ["economic"]).show).toEqual([...q.show]);
  });
});

describe("toggleKind", () => {
  it("adds in canonical order and removes", () => {
    expect(toggleKind(["economic"], "holdings")).toEqual(["holdings", "economic"]);
    expect(toggleKind(["holdings", "economic"], "economic")).toEqual(["holdings"]);
  });
});

describe("expectationsState", () => {
  it("locked beats a draft; blank text is not a draft", () => {
    expect(expectationsState({ preLockedAt: new Date(), expectations: "x" })).toBe("locked");
    expect(expectationsState({ preLockedAt: null, expectations: "Margins up" })).toBe("draft");
    expect(expectationsState({ preLockedAt: null, expectations: "  " })).toBe("not_started");
    expect(expectationsState({ preLockedAt: null, expectations: null })).toBe("not_started");
  });
});

describe("weeks and the month picker", () => {
  it("finds the Monday-to-Sunday week of a day", () => {
    expect(weekStart("2026-10-15")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekDays("2026-10-12")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });
  it("lays October 2026 out Monday first with blanks outside the month", () => {
    const m = buildMiniMonth("2026-10");
    expect(m.label).toBe("October 2026");
    expect(m.weeks).toHaveLength(5);
    expect(m.weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(m.weeks[4]).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
    expect(m.first).toBe("2026-10-01");
    expect(m.last).toBe("2026-10-31");
  });
});

describe("marketDayNote", () => {
  it("names bond-market-only closures and exchange holidays", () => {
    expect(marketDayNote("2026-10-12")).toBe("Columbus Day · bond market closed");
    expect(marketDayNote("2026-11-11")).toBe("Veterans Day · bond market closed");
    expect(marketDayNote("2026-11-26")).toBe("Thanksgiving · markets closed");
    expect(marketDayNote("2026-04-03")).toBe("Good Friday · markets closed");
    expect(marketDayNote("2026-07-03")).toBe("Independence Day · markets closed");
    expect(marketDayNote("2025-01-09")).toBe("Markets closed");
  });
  it("says nothing on ordinary days and weekends", () => {
    expect(marketDayNote("2026-10-13")).toBeNull();
    expect(marketDayNote("2026-10-17")).toBeNull();
  });
});

describe("toCalendarEvents", () => {
  it("borrows a bellwether's classification for an unclassified holding and skips undated bellwethers", () => {
    const rows = [
      { e: { id: "e1", reportDate: "2026-10-22", reportHour: "amc", dateStatus: "confirmed", epsEstimate: "1.2" }, h: { ticker: "NVDA", companyName: null, teamId: TEAM }, teamSlug: "tech", teamName: "Tech", sector: null, industry: null },
    ] as unknown as HoldingEventRow[];
    const bells = [
      { ticker: "NVDA", sector: "information_technology", industry: "Semiconductors", name: "NVIDIA", reportDate: "2026-10-22", etf: "XLK" },
      { ticker: "AAPL", sector: "information_technology", industry: "Consumer Electronics", name: "Apple", reportDate: null, etf: "XLK" },
    ] as unknown as Bellwether[];
    const ev = toCalendarEvents(rows, bells);
    expect(ev.map((e) => `${e.kind}:${e.ticker}`)).toEqual(["holding:NVDA", "bellwether:NVDA"]);
    expect(ev[0].industry).toBe("Semiconductors");
    expect(ev[0].name).toBe("NVIDIA");
  });
});

describe("filterCalendarEvents", () => {
  const events: CalendarEvent[] = [
    holding({ ticker: "OWN", date: "2026-10-05" }), // own team, unclassified
    holding({ ticker: "MSFT", date: "2026-10-06", sector: "information_technology", industry: "Software—Infrastructure", teamId: OTHER, teamSlug: "fig" }),
    holding({ ticker: "JPM", date: "2026-10-06", sector: "financials", industry: "Banks—Diversified", teamId: OTHER, teamSlug: "fig" }),
    bell({ ticker: "NVDA", date: "2026-10-07", industry: "Semiconductors" }),
    bell({ ticker: "MSFT", date: "2026-10-30", industry: "Software—Infrastructure" }),
    bell({ ticker: "XOM", date: "2026-10-08", sector: "energy", etf: "XLE", industry: "Oil & Gas Integrated" }),
  ];
  const base = { teamId: TEAM, teamSectors: ["information_technology"] as const };

  it("fund shows everything except bellwethers the Fund already holds", () => {
    const out = filterCalendarEvents(events, { ...base, view: "fund", teamSectors: [...base.teamSectors] });
    expect(out.map((e) => e.ticker)).toEqual(["OWN", "JPM", "MSFT", "NVDA", "XOM"]);
    expect(out.find((e) => e.ticker === "MSFT")?.kind).toBe("holding");
  });

  it("sector keeps own-team holdings and anything in the team's sectors", () => {
    const out = filterCalendarEvents(events, { ...base, view: "sector", teamSectors: [...base.teamSectors] });
    expect(out.map((e) => e.ticker)).toEqual(["OWN", "MSFT", "NVDA"]);
  });

  it("industry narrows the sector set to one exact industry", () => {
    const out = filterCalendarEvents(events, { ...base, view: "industry", teamSectors: [...base.teamSectors], industry: "Semiconductors" });
    expect(out.map((e) => e.ticker)).toEqual(["NVDA"]);
    expect(filterCalendarEvents(events, { ...base, view: "industry", teamSectors: [...base.teamSectors] })).toEqual([]);
  });

  it("sorts by date, holdings before bellwethers, then ticker", () => {
    const out = filterCalendarEvents([bell({ ticker: "B", date: "2026-10-06" }), holding({ ticker: "Z", date: "2026-10-06" }), holding({ ticker: "A", date: "2026-10-05" })], { ...base, view: "fund", teamSectors: [] });
    expect(out.map((e) => e.ticker)).toEqual(["A", "Z", "B"]);
  });
});

describe("defaultSelectedDay", () => {
  const grid = buildMonthGrid("2026-10");
  const byDate = groupByDate([holding({ ticker: "A", date: "2026-10-14" }), holding({ ticker: "B", date: "2026-10-21" })]);
  it("prefers today when it is on the grid", () => {
    expect(defaultSelectedDay(grid, byDate, "2026-10-02")).toBe("2026-10-02");
  });
  it("on a weekend, opens the coming week even with nothing loaded for it", () => {
    expect(defaultSelectedDay(buildMonthGrid("2026-09"), byDate, "2026-09-27")).toBe("2026-09-28");
  });
  it("otherwise the first upcoming day with events, then any day with events, then the first", () => {
    expect(defaultSelectedDay(grid, byDate, "2026-09-17")).toBe("2026-10-14");
    expect(defaultSelectedDay(grid, byDate, "2026-12-01")).toBe("2026-10-14");
    expect(defaultSelectedDay(grid, new Map(), "2026-12-01")).toBe("2026-10-01");
  });
});

describe("industryOptions", () => {
  it("unions holdings with bellwethers in the team's sectors", () => {
    const bells = [
      { sector: "information_technology", industry: "Semiconductors" },
      { sector: "energy", industry: "Oil & Gas Integrated" },
      { sector: "information_technology", industry: null },
    ] as const;
    expect(industryOptions(["Software—Infrastructure"], [...bells], ["information_technology"])).toEqual(["Semiconductors", "Software—Infrastructure"]);
  });
});
