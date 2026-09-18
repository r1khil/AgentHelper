import { describe, expect, it } from "vitest";
import type { Bellwether } from "@/db/schema";
import {
  buildMonthGrid,
  calendarHref,
  defaultSelectedDay,
  filterCalendarEvents,
  groupByDate,
  industryOptions,
  parseCalendarQuery,
  toCalendarEvents,
  type CalendarEvent,
  type HoldingEventRow,
} from "./earnings-calendar";

const TEAM = "team-tech";
const OTHER = "team-fig";

function holding(over: Partial<CalendarEvent> & { ticker: string; date: string }): CalendarEvent {
  return { name: over.ticker, kind: "holding", sector: null, industry: null, reportHour: null, dateStatus: "estimated", epsEstimate: null, earningsId: `e-${over.ticker}`, teamId: TEAM, teamSlug: "tech", teamName: "Tech", ...over };
}
function bell(over: Partial<CalendarEvent> & { ticker: string; date: string }): CalendarEvent {
  return { name: over.ticker, kind: "bellwether", sector: "information_technology", industry: null, reportHour: null, dateStatus: "estimated", epsEstimate: null, etf: "XLK", weightPct: "5.0000", ...over };
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
  it("uses defaults for missing or invalid values", () => {
    expect(parseCalendarQuery({}, today)).toEqual({ view: "sector", month: "2026-09", day: undefined, industry: undefined });
    expect(parseCalendarQuery({ view: "bogus", month: "2026-13", day: "nope" }, today)).toEqual({ view: "sector", month: "2026-09", day: undefined, industry: undefined });
    expect(parseCalendarQuery({ day: "2026-02-30" }, today).day).toBeUndefined();
  });
  it("accepts valid values, arrays and trims the industry", () => {
    expect(parseCalendarQuery({ view: ["fund", "sector"], month: "2026-10", day: "2026-10-22", industry: "  Semiconductors " }, today)).toEqual({ view: "fund", month: "2026-10", day: "2026-10-22", industry: "Semiconductors" });
  });
});

describe("calendarHref", () => {
  it("always writes view and month and only the optional parts that are set", () => {
    expect(calendarHref("/t/tech/earnings", { view: "sector", month: "2026-10" })).toBe("/t/tech/earnings?view=sector&month=2026-10");
    expect(calendarHref("/t/tech/earnings", { view: "industry", month: "2026-10", day: "2026-10-22", industry: "Software—Infrastructure" })).toBe(
      "/t/tech/earnings?view=industry&month=2026-10&day=2026-10-22&industry=Software%E2%80%94Infrastructure",
    );
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
