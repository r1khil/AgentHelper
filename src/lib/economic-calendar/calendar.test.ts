import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarWeek, rangeDays, validateRange } from "./dates";
import { normalizeEvents, tradingEconomicsProvider } from "./trading-economics";
import { calendarPreviewEnabled } from "./preview";

const range = { from: "2026-09-21", to: "2026-09-27" };
const row = {
  CalendarId: "1",
  Date: "2026-09-24T12:30:00",
  Country: "United States",
  Event: "Initial Jobless Claims",
  Reference: "Sep/19",
  Actual: "204K",
  Forecast: "205K",
  Previous: "200K",
  Revised: "196K",
  Importance: 2,
};
afterEach(() => vi.unstubAllEnvs());
describe("calendar dates", () => {
  it("uses Monday through Sunday across month and year boundaries", () => {
    expect(calendarWeek("2027-01-01")).toEqual({
      from: "2026-12-28",
      to: "2027-01-03",
    });
    expect(rangeDays(range)).toHaveLength(7);
  });
  it("rejects invalid, partial, reversed and oversized ranges", () => {
    for (const [from, to] of [
      ["2026-02-30", range.to],
      [range.to, range.from],
      [range.from, null],
      [range.from, "2026-12-01"],
    ])
      expect(() => validateRange(from, to)).toThrow();
    expect(validateRange(range.from, range.to)).toEqual(range);
  });
});
describe("full-feed adapter", () => {
  it("preserves every event, including unknown releases, speakers and no-value events", () => {
    const rows = [
      row,
      {
        ...row,
        CalendarId: "2",
        Event: "New obscure regional survey",
        Actual: 0,
        Forecast: null,
        Importance: null,
      },
      {
        ...row,
        CalendarId: "3",
        Event: "Fed Barkin Speech",
        Actual: "",
        Forecast: "",
        Previous: "",
        Reference: "",
      },
    ];
    const events = normalizeEvents(rows, range);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      time: "8:30 AM",
      period: "Sep/19",
      actual: "204K",
      estimate: "205K",
      previous: "200K",
      previousBeforeRevision: "196K",
    });
    expect(events[1]).toMatchObject({ actual: "0", importance: null });
    expect(events[2]).toMatchObject({
      actual: null,
      estimate: null,
      period: null,
    });
  });
  it("does not replace missing consensus with the TE proprietary forecast", () => {
    expect(
      normalizeEvents([{ ...row, Forecast: "", TEForecast: "207K" }], range)[0]
        .estimate,
    ).toBeNull();
  });
  it("updates released values without losing estimates or previous", () => {
    const before = normalizeEvents([{ ...row, Actual: "" }], range)[0];
    const after = normalizeEvents([row], range)[0];
    expect(before.actual).toBeNull();
    expect(after).toMatchObject({
      actual: "204K",
      estimate: before.estimate,
      previous: before.previous,
    });
  });
  it("sorts chronologically, deduplicates only IDs, and keeps the newest revision", () => {
    const events = normalizeEvents(
      [
        { ...row, LastUpdate: "2026-09-24T13:00:00" },
        { ...row, Actual: "1K", LastUpdate: "2026-09-24T12:00:00" },
        { ...row, CalendarId: "2", Date: "2026-09-22T14:00:00" },
      ],
      range,
    );
    expect(events.map((e) => e.id)).toEqual(["2", "1"]);
    expect(events[1].actual).toBe("204K");
  });
  it("includes late Sunday ET and excludes prior Sunday ET, independent of UTC dates", () => {
    const events = normalizeEvents(
      [
        { ...row, Date: "2026-09-28T03:30:00" },
        { ...row, CalendarId: "2", Date: "2026-09-21T03:30:00" },
      ],
      range,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: "2026-09-27", time: "11:30 PM" });
    expect(
      normalizeEvents(
        [{ ...row, Date: "2026-11-02T13:30:00" }],
        calendarWeek("2026-11-02"),
      )[0].time,
    ).toBe("8:30 AM");
  });
  it("fails visibly on malformed or country-restricted responses", () => {
    expect(() => normalizeEvents({ error: "Access denied" }, range)).toThrow();
    expect(() => normalizeEvents([{ ...row, Date: "bad" }], range)).toThrow();
    expect(() =>
      normalizeEvents([{ ...row, Country: "Sweden" }], range),
    ).toThrow();
  });
  it("requests the whole country feed with no importance/category limits and sends key only in header", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json([row]));
    await tradingEconomicsProvider("test-secret", fetcher).getEvents(range);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.tradingeconomics.com/calendar/country/united%20states/2026-09-21/2026-09-28?f=json",
    );
    expect(options.headers.Authorization).toBe("test-secret");
  });
  it("rejects truncation and access failures instead of showing an empty calendar", async () => {
    await expect(
      tradingEconomicsProvider(
        "test",
        vi.fn().mockResolvedValue(Response.json(Array(1000).fill(row))),
      ).getEvents(range),
    ).rejects.toThrow("limit");
    await expect(
      tradingEconomicsProvider(
        "test",
        vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
      ).getEvents(range),
    ).rejects.toThrow("403");
  });
  it("cannot enable synthetic preview in production", () => {
    vi.stubEnv("ECONOMIC_CALENDAR_PREVIEW", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(calendarPreviewEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(calendarPreviewEnabled()).toBe(true);
  });
});
