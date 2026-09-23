import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarNotice, inRange } from "./normalize";
import {
  formatValue,
  parseTradingView,
  tradingViewProvider,
} from "./tradingview-provider";

const row = {
  id: "421400",
  title: "Initial Jobless Claims",
  country: "US",
  indicator: "Initial Jobless Claims",
  category: "lbr",
  period: "Sep/19",
  referenceDate: "2026-09-19T00:00:00Z",
  source: "Department of Labour",
  source_url: "https://www.dol.gov/",
  actual: 203,
  previous: 196,
  forecast: 201,
  actualRaw: 203000,
  previousRaw: 196000,
  forecastRaw: 201000,
  currency: "USD",
  unit: null,
  scale: "K",
  importance: 0,
  date: "2026-09-24T12:30:00.000Z",
};
const body = (...result: object[]) => ({ status: "ok", result });
const range = { from: "2026-09-21", to: "2026-09-27" };
afterEach(() => vi.useRealTimers());

describe("TradingView calendar", () => {
  it("reads consensus, actual, previous, scale, period and importance", () => {
    const [event] = parseTradingView(body(row));
    expect(event).toMatchObject({
      id: "tv:421400",
      date: "2026-09-24",
      time: "8:30 AM",
      timestamp: "2026-09-24T12:30:00.000Z",
      tentative: false,
      name: "Initial Jobless Claims",
      category: "Labor",
      period: "Week ending Sep 19",
      actual: "203K",
      estimate: "201K",
      previous: "196K",
      importance: 2,
      unit: null,
      source: "Department of Labour",
      sourceUrl: "https://www.dol.gov/",
    });
  });
  it("writes values in the shapes the page compares with consensus", () => {
    expect(formatValue(0.4, "%", null)).toBe("0.4%");
    expect(formatValue(-255, "$", "B")).toBe("-$255B");
    expect(formatValue(2.969, null, "M")).toBe("2.969M");
    expect(formatValue(0, null, null)).toBe("0");
    expect(formatValue(null, "%", null)).toBeNull();
    const [gas] = parseTradingView(
      body({ ...row, unit: "cf", scale: "B", actual: 53, importance: -1 }),
    );
    expect(gas).toMatchObject({ actual: "53B", unit: "cf", importance: 1 });
  });
  it("labels monthly and quarterly periods with their year", () => {
    const [cpi, gdp, other] = parseTradingView(
      body(
        { ...row, id: 1, period: "Aug", referenceDate: "2026-08-31T00:00:00Z", importance: 1 },
        { ...row, id: 2, period: "Q2", referenceDate: "2026-06-30T00:00:00Z" },
        { ...row, id: 3, period: "", referenceDate: null },
      ),
    );
    expect(cpi).toMatchObject({ period: "Aug 2026", importance: 3 });
    expect(gdp.period).toBe("Q2 2026");
    expect(other.period).toBeNull();
  });
  it("keeps holidays and summits on their own day with no clock time", () => {
    const [holiday] = parseTradingView(
      body({
        ...row,
        title: "Labor Day",
        indicator: "Holidays",
        category: null,
        date: "2026-09-07T00:00:00.000Z",
        actual: null,
        forecast: null,
        previous: null,
      }),
    );
    expect(holiday).toMatchObject({
      date: "2026-09-07",
      timestamp: null,
      time: "All day",
      tentative: false,
      category: "Holidays",
      estimate: null,
    });
  });
  it("blanks an actual stamped for a release that has not happened yet", () => {
    const events = parseTradingView(body(row));
    expect(
      inRange(events, range, Date.parse("2026-09-24T12:00:00Z"))[0].actual,
    ).toBeNull();
    expect(
      inRange(events, range, Date.parse("2026-09-24T12:31:00Z"))[0].actual,
    ).toBe("203K");
  });
  it("drops other countries and rejects a changed payload", () => {
    expect(parseTradingView(body({ ...row, country: "GB" }))).toEqual([]);
    expect(() => parseTradingView({ status: "error", result: [] })).toThrow();
    expect(() => parseTradingView(body({ ...row, date: "Sep 24" }))).toThrow();
    expect(() => parseTradingView([row])).toThrow();
  });
  it("asks for the Eastern week plus a day either side and filters back", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
    const fetcher = vi.fn(async () =>
      Response.json(
        body(
          row,
          { ...row, id: "early", date: "2026-09-21T03:00:00.000Z" },
          { ...row, id: "late", date: "2026-09-28T03:30:00.000Z" },
        ),
      ),
    );
    const result = await tradingViewProvider(fetcher).getEvents(range);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("countries")).toBe("US");
    expect(url.searchParams.get("from")).toBe("2026-09-20T04:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-09-29T04:00:00.000Z");
    expect(new Headers(init.headers).get("Origin")).toBe(
      "https://www.tradingview.com",
    );
    // 03:30 UTC on the 28th is still the 27th in New York; 03:00 UTC on the 21st is the 20th.
    expect(result.events.map((e) => e.id)).toEqual(["tv:421400", "tv:late"]);
    expect(result.sources).toEqual([
      expect.objectContaining({ name: "TradingView", status: "ok", count: 2 }),
    ]);
    expect(result.coverage).toBeUndefined();
  });
  it("says a week isn't published yet instead of calling the feed broken", async () => {
    const provider = tradingViewProvider(vi.fn(async () => Response.json({ status: "ok" })));
    const error = await provider.getEvents(range).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalendarNotice);
    expect((error as Error).message).toBe("not published this far ahead");
  });
  it("fails on HTTP errors so the next provider can answer", async () => {
    await expect(
      tradingViewProvider(
        vi.fn(async () => new Response("denied", { status: 403 })),
      ).getEvents(range),
    ).rejects.toThrow("HTTP 403");
  });
});
