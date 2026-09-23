import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseTradingEconomics,
  parseEodhd,
  tradingEconomicsProvider,
  eodhdProvider,
} from "./dedicated-providers";
import { inRange } from "./normalize";
import {
  calendarConfiguration,
  loadConfiguredCalendar,
} from "./provider-selection";

/** The FXStreet overlay asks alongside every provider; answer it empty so ordered mocks stay in order. */
type Fetch = (input: string | URL | Request) => Promise<Response>;
function besideFxStreet(provider: Fetch) {
  return vi.fn(async (input: string | URL | Request) =>
    String(input).includes("fxstreet.com") ? Response.json([]) : provider(input),
  );
}

const range = { from: "2026-09-21", to: "2026-09-27" };
const te = {
  CalendarId: "123",
  Country: "United States",
  Date: "2026-09-24T12:30:00",
  Event: "Initial Jobless Claims",
  Category: "Initial Jobless Claims",
  Reference: "Sep/19",
  ReferenceDate: "2026-09-19T00:00:00",
  Actual: "210K",
  Previous: "208K",
  Revised: "207K",
  Forecast: "209K",
  TEForecast: "999K",
  Unit: "K",
  Currency: "",
  Importance: 3,
  DateSpan: "0",
  LastUpdate: "2026-09-21T12:00:00",
};
const eod = {
  type: "GDP Growth Rate",
  comparison: "qoq",
  period: "Q2",
  country: "US",
  date: "2026-09-24 12:30:00",
  actual: 0,
  estimate: 2.5,
  previous: 2.1,
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("dedicated calendar mapping", () => {
  it("uses survey forecast, preserves period, units, importance and revision semantics", () => {
    expect(parseTradingEconomics([te])[0]).toMatchObject({
      id: "te:123",
      date: "2026-09-24",
      time: "8:30 AM",
      period: "Sep/19",
      referenceDate: te.ReferenceDate,
      actual: "210K",
      estimate: "209K",
      previous: "208K",
      previousBeforeRevision: "207K",
      importance: 3,
      unit: "K",
    });
    expect(
      parseTradingEconomics([
        { ...te, Forecast: "", Actual: 0, Previous: "null" },
      ])[0],
    ).toMatchObject({ estimate: null, actual: "0", previous: null });
  });
  it("blanks future actuals while retaining estimate and previous, then displays released actuals", () => {
    const events = parseTradingEconomics([te]);
    expect(
      inRange(events, range, Date.parse("2026-09-24T12:29:00Z"))[0],
    ).toMatchObject({ actual: null, estimate: "209K", previous: "208K" });
    expect(
      inRange(events, range, Date.parse("2026-09-24T12:31:00Z"))[0].actual,
    ).toBe("210K");
    expect(
      inRange(
        parseTradingEconomics([{ ...te, Actual: "" }]),
        range,
        Date.parse("2026-09-25T12:00:00Z"),
      )[0].actual,
    ).toBeNull();
  });
  it("keeps TE identity through rescheduling and dedupes newest revision", () => {
    const old = parseTradingEconomics([te])[0];
    const newer = parseTradingEconomics([
      {
        ...te,
        Date: "2026-09-25T14:00:00",
        Previous: "206K",
        LastUpdate: "2026-09-22T12:00:00",
      },
    ])[0];
    expect(newer.id).toBe(old.id);
    const movedOutside = {
      ...newer,
      date: "2026-09-28",
      timestamp: "2026-09-28T14:00:00Z",
    };
    expect(inRange([old, movedOutside], range)).toEqual([]);
    expect(inRange([newer, old], range, Date.parse("2026-10-01"))).toEqual([
      newer,
    ]);
  });
  it("handles winter/summer DST, Eastern date boundaries, estimated times and missing period", () => {
    expect(
      parseTradingEconomics([{ ...te, Date: "2026-11-02T13:30:00" }])[0].time,
    ).toBe("8:30 AM");
    expect(
      parseTradingEconomics([{ ...te, Date: "2026-09-28T03:30:00" }])[0],
    ).toMatchObject({ date: "2026-09-27", time: "11:30 PM" });
    expect(
      parseTradingEconomics([
        { ...te, DateSpan: "1", Reference: "", ReferenceDate: "" },
      ])[0],
    ).toMatchObject({
      timestamp: null,
      tentative: true,
      time: "TBA",
      period: null,
    });
    expect(
      inRange(
        parseTradingEconomics([{ ...te, DateSpan: "1" }]),
        range,
        Date.parse("2026-09-23T12:00:00Z"),
      )[0].actual,
    ).toBeNull();
  });
  it("rejects invalid payloads and excludes non-US rows without guessing fields", () => {
    expect(() => parseTradingEconomics({ error: "subscription" })).toThrow();
    expect(() => parseTradingEconomics([{ ...te, Date: "invalid" }])).toThrow();
    expect(() => parseTradingEconomics([{ ...te, CalendarId: "" }])).toThrow();
    expect(parseTradingEconomics([{ ...te, Country: "Canada" }])).toEqual([]);
    expect(
      parseTradingEconomics([{ ...te, SourceURL: "javascript:alert(1)" }])[0]
        .sourceUrl,
    ).toBeUndefined();
  });
  it("preserves EODHD zero/estimate/previous without inventing missing metadata", () => {
    const event = parseEodhd([eod], "UTC")[0];
    expect(event).toMatchObject({
      name: "GDP Growth Rate (qoq)",
      period: "Q2",
      actual: "0",
      estimate: "2.5",
      previous: "2.1",
      importance: null,
      previousBeforeRevision: null,
      time: "8:30 AM",
    });
    expect(event.unit).toBeUndefined();
    expect(parseEodhd([{ ...eod, actual: 1, estimate: 3 }], "UTC")[0].id).toBe(
      event.id,
    );
    expect(parseEodhd([{ ...eod, comparison: "yoy" }], "UTC")[0].id).not.toBe(
      event.id,
    );
    expect(
      inRange([event, event], range, Date.parse("2026-09-21")),
    ).toHaveLength(1);
    expect(inRange([event], range, Date.parse("2026-09-21"))[0]).toMatchObject({
      actual: null,
      estimate: "2.5",
      previous: "2.1",
    });
    expect(() => parseEodhd([eod], "")).toThrow("timezone");
  });
});

describe("requests and fallback", () => {
  it("requests the next UTC day and filters back to Eastern range", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json([
          te,
          { ...te, CalendarId: "late", Date: "2026-09-28T03:30:00" },
          { ...te, CalendarId: "outside", Date: "2026-09-28T12:30:00" },
        ]),
      );
    const result = await tradingEconomicsProvider("secret", fetcher).getEvents(
      range,
    );
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.pathname).toContain("/2026-09-21/2026-09-28");
    expect(result.events.map((e) => e.id)).toEqual(["te:123", "te:late"]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("uses TE first and does not fall back merely because a week is empty", async () => {
    const provider = vi.fn(async () => Response.json([]));
    const result = await loadConfiguredCalendar(
      range,
      calendarConfiguration({
        TRADING_ECONOMICS_API_KEY: "secret",
        EODHD_API_KEY: "fallback",
        EODHD_CALENDAR_TIMEZONE: "UTC",
      }),
      besideFxStreet(provider),
    );
    expect(result.provider).toBe("Trading Economics");
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("falls back on upstream failure and surfaces safe source status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));
    const fetcher = besideFxStreet(
      vi
        .fn<Fetch>()
        .mockResolvedValueOnce(new Response("secret", { status: 403 }))
        .mockResolvedValueOnce(Response.json([eod])),
    );
    const result = await loadConfiguredCalendar(
      range,
      calendarConfiguration({
        TRADING_ECONOMICS_API_KEY: "secret",
        EODHD_API_KEY: "fallback",
        EODHD_CALENDAR_TIMEZONE: "UTC",
      }),
      fetcher,
    );
    expect(result.provider).toBe("EODHD");
    expect(result.sources?.[0]).toMatchObject({
      status: "unavailable",
      error: "HTTP 403",
    });
    expect(result.events[0]).toMatchObject({
      actual: null,
      estimate: "2.5",
      previous: "2.1",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("paginates EODHD and refuses silent truncation", async () => {
    const fullPage = Array.from({ length: 1000 }, () => eod);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(fullPage))
      .mockResolvedValueOnce(Response.json([{ ...eod, type: "Other" }]));
    expect(
      (await eodhdProvider("secret", "UTC", fetcher).getEvents(range)).events,
    ).toHaveLength(2);
    expect((fetcher.mock.calls[1][0] as URL).searchParams.get("offset")).toBe(
      "1000",
    );
    const truncated = vi
      .fn()
      .mockImplementation(async () => Response.json(fullPage));
    await expect(
      eodhdProvider("secret", "UTC", truncated).getEvents(range),
    ).rejects.toThrow("truncated");
  });
  it("redacts transport errors and scopes the cache to credentials", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new Error("https://host/?c=secret"));
    await expect(
      tradingEconomicsProvider("secret", fetcher).getEvents(range),
    ).rejects.toThrow("Calendar request failed");
    expect(
      calendarConfiguration({ TRADING_ECONOMICS_API_KEY: "a" }).cacheScope,
    ).not.toBe(
      calendarConfiguration({ TRADING_ECONOMICS_API_KEY: "b" }).cacheScope,
    );
  });
});
