import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarWeek, rangeDays, validateRange } from "./dates";
import {
  parseAgencyICS,
  parseAgencyValues,
  parseCensusIndicators,
  parseFedCalendar,
  extractCensusJSON,
  AGENCY_URLS,
} from "./agency-parsers";
import { makeEvent, inRange } from "./normalize";
import { publicCalendarProvider } from "./public-provider";
import { calendarPreviewEnabled } from "./preview";

const range = { from: "2026-09-14", to: "2026-09-20" };
const ics = (event: string) =>
  `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n${event}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const values = {
  updatedAt: "2026-09-18T15:00:00Z",
  data: [
    {
      source: "dol",
      eventName: "Unlisted new release",
      scheduledAt: "2026-09-17T12:30:00Z",
      actual: 0,
      previous: 206,
      forecast: 207,
      unit: "thousands",
      periodLabel: "Sep 12",
      importance: "med",
    },
  ],
};
afterEach(() => vi.unstubAllEnvs());
describe("calendar dates", () => {
  it("uses Monday through Sunday across year boundaries", () => {
    expect(calendarWeek("2027-01-01")).toEqual({
      from: "2026-12-28",
      to: "2027-01-03",
    });
    expect(rangeDays(range)).toHaveLength(7);
  });
  it("rejects malformed, partial, reversed and oversized ranges", () => {
    for (const [from, to] of [
      ["2026-02-30", range.to],
      [range.to, range.from],
      [range.from, null],
      [range.from, "2026-12-01"],
    ])
      expect(() => validateRange(from, to)).toThrow();
  });
});
describe("public source adapters", () => {
  it("reads all ICS releases, folded names, periods and UTC times", () => {
    const result = parseAgencyICS(
      ics(
        "UID:a\r\nDTSTART:20260917T123000Z\r\nSUMMARY:Obscure activity\\, August 2026\r\n continuation",
      ),
      "BEA",
    );
    expect(result[0]).toMatchObject({
      date: "2026-09-17",
      time: "8:30 AM",
      name: "Obscure activity, August 2026continuation",
      period: "August 2026",
      actual: null,
    });
    expect(
      parseAgencyICS(
        ics("DTSTART;TZID=US-Eastern:20261102T083000\r\nSUMMARY:Release"),
        "BLS",
      )[0].timestamp,
    ).toBe("2026-11-02T13:30:00.000Z");
  });
  it("preserves unknown times and rejects unsupported recurrence rather than silently losing events", () => {
    expect(
      parseAgencyICS(
        ics("DTSTART;VALUE=DATE:20260917\r\nSUMMARY:Release"),
        "BLS",
      )[0],
    ).toMatchObject({ timestamp: null, time: "TBA" });
    expect(parseAgencyICS(ics("STATUS:CANCELLED"), "BLS")).toEqual([]);
    expect(() => parseAgencyICS(ics("RRULE:FREQ=WEEKLY"), "BLS")).toThrow(
      "recurrence",
    );
    expect(() => parseAgencyICS("access denied", "BLS")).toThrow();
  });
  it("expands all Fed publication dates and includes speeches without an indicator whitelist", () => {
    const result = parseFedCalendar({
      events: [
        {
          month: "2026-09",
          days: "3, 10, 17, 24",
          title: "New Fed speech",
          time: "4:30 p.m.",
          type: "Speech",
        },
        {},
        { month: "2026-09", days: "16", title: "Meeting", time: "" },
      ],
    });
    expect(result).toHaveLength(5);
    expect(result[2]).toMatchObject({
      date: "2026-09-17",
      time: "4:30 PM",
      category: "Speech",
    });
    expect(result[4]).toMatchObject({ timestamp: null, time: "TBA" });
    expect(() => parseFedCalendar({ events: [{ title: "Bad" }] })).toThrow();
  });
  it("extracts Census JSON without executing script, retaining new indicators and separate prior values", () => {
    const row = {
      programName: "Test",
      indicatorName: 'A } " quoted name',
      relDate: "September 17th, 2026",
      nextRelDate: "October 15th, 2026",
      statPeriod: "August 2026",
      value: 0,
      compValue: 12,
      unitsOfMeasure: "BLN$",
    };
    const result = parseCensusIndicators(
      `let g_cidrOutput = ${JSON.stringify({ NEW: row })}; throw Error('never execute');`,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      actual: "0",
      previous: "12",
      estimate: null,
      unit: "BLN$",
      time: "TBA",
    });
    expect(result[1]).toMatchObject({
      date: "2026-10-15",
      actual: null,
      previous: "0",
      period: null,
    });
    expect(() => extractCensusJSON("let g_cidrOutput = {broken")).toThrow();
  });
  it("keeps all agency values, zero, units, and prior values without inventing consensus", () => {
    expect(parseAgencyValues(values)[0]).toMatchObject({
      name: "Unlisted new release",
      actual: "0",
      previous: "206",
      estimate: null,
      unit: "thousands",
      importance: 2,
    });
    expect(() =>
      parseAgencyValues({
        ...values,
        data: [{ ...values.data[0], scheduledAt: "2026-09-17T12:30:00" }],
      }),
    ).toThrow("timezone");
  });
  it("filters by New York day, blanks future actuals and retains the latest revision", () => {
    const base = parseAgencyValues(values)[0];
    const next = makeEvent({
      name: "Late Sunday",
      source: "test",
      date: "2026-09-20",
      timestamp: "2026-09-21T03:30:00Z",
      actual: "100",
      estimate: "99",
      previous: "98",
    });
    const result = inRange(
      [next, { ...base, actual: "old", updatedAt: "2026-09-17" }, base],
      range,
      Date.parse("2026-09-19T12:00:00Z"),
    );
    expect(result).toHaveLength(2);
    expect(result[0].actual).toBe("0");
    expect(result[1]).toMatchObject({
      actual: null,
      estimate: "99",
      previous: "98",
      time: "11:30 PM",
    });
  });
  it("updates an actual without losing the event identity, period or previous", () => {
    const upcoming = parseAgencyValues({
      ...values,
      data: [{ ...values.data[0], actual: null }],
    })[0];
    const released = parseAgencyValues(values)[0];
    expect(upcoming.actual).toBeNull();
    expect(released).toMatchObject({
      id: upcoming.id,
      period: upcoming.period,
      previous: upcoming.previous,
      estimate: upcoming.estimate,
      actual: "0",
    });
  });
  it("loads independent sources without credentials and reports partial failures", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).startsWith(AGENCY_URLS.xoomar)
        ? Response.json(values)
        : new Response(null, { status: 403 }),
    );
    const result = await publicCalendarProvider(
      fetcher as typeof fetch,
      async (_key, _seconds, load) => load(),
    ).getEvents(range);
    expect(result.events).toHaveLength(1);
    expect(
      result.sources?.filter((s) => s.status === "unavailable"),
    ).toHaveLength(4);
    expect(result.coverage?.status).toBe("partial");
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).endsWith("from=2026-09-14&to=2026-09-21"),
      ),
    ).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("fails visibly when every source fails instead of substituting fixtures", async () => {
    await expect(
      publicCalendarProvider(
        vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
        async (_key, _seconds, load) => load(),
      ).getEvents(range),
    ).rejects.toThrow("All public");
  });
  it("cannot enable synthetic preview in production", () => {
    vi.stubEnv("ECONOMIC_CALENDAR_PREVIEW", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(calendarPreviewEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(calendarPreviewEnabled()).toBe(true);
  });
});
