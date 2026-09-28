import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CalendarUnavailableError,
  FALLBACK_DEADLINE_MS,
  calendarConfiguration,
  loadConfiguredCalendar,
  providerChain,
} from "./provider-selection";
import { forgetCalendarFailures } from "./public-provider";

const range = { from: "2026-09-21", to: "2026-09-27" };
const tvRow = {
  id: "1",
  title: "Initial Jobless Claims",
  country: "US",
  actual: null,
  previous: 196,
  forecast: 201,
  scale: "K",
  importance: 0,
  date: "2026-09-24T12:30:00.000Z",
};
const biquoteRow = {
  id: "mql5:1",
  eventId: "mql5:claims",
  time: "2026-09-24T12:30:00Z",
  period: null,
  countryCode: "US",
  currency: "USD",
  name: "Initial Jobless Claims",
  importance: "high",
  type: "indicator",
  sector: "jobs",
  unit: "none",
  multiplier: "thousands",
  actual: null,
  forecast: 189,
  previous: 196,
  revisedPrevious: null,
  timeMode: "exact",
  sourceUrl: null,
  source: "mql5",
};

/** Answers by host, so each provider in the chain can be up or down on its own. */
function hosts(answers: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (input: string | URL | Request) => {
    const host = new URL(String(input)).hostname;
    const answer = Object.entries(answers).find(([h]) => host.endsWith(h));
    if (!answer) throw new Error(`offline: ${host}`);
    return answer[1]();
  });
}
const calls = (fetcher: ReturnType<typeof hosts>, host: string) =>
  fetcher.mock.calls.filter(([input]) => String(input).includes(host)).length;
const tradingView = () => Response.json({ status: "ok", result: [tvRow] });
const biquote = () => Response.json([biquoteRow]);

afterEach(() => {
  vi.useRealTimers();
  forgetCalendarFailures();
});

describe("provider chain", () => {
  it("tries paid keys, then TradingView, biquote and the agency feeds", () => {
    const names = (env: Record<string, string>) =>
      providerChain(calendarConfiguration(env)).map((p) => p.name);
    expect(names({})).toEqual([
      "TradingView",
      "biquote (free)",
      "Public agency feeds",
    ]);
    expect(
      names({ TRADING_ECONOMICS_API_KEY: "k", EODHD_API_KEY: "e" }),
    ).toEqual([
      "Trading Economics",
      "EODHD",
      "TradingView",
      "biquote (free)",
      "Public agency feeds",
    ]);
    // Naming a free feed moves it to the front and ignores saved paid keys.
    expect(
      names({ ECONOMIC_CALENDAR_PROVIDER: "biquote", EODHD_API_KEY: "e" }),
    ).toEqual(["biquote (free)", "TradingView", "Public agency feeds"]);
    expect(names({ ECONOMIC_CALENDAR_PROVIDER: "public" })).toEqual([
      "Public agency feeds",
      "TradingView",
      "biquote (free)",
    ]);
    expect(() =>
      calendarConfiguration({ ECONOMIC_CALENDAR_PROVIDER: "marketwatch" }),
    ).toThrow("Invalid");
  });
  it("uses TradingView with consensus and no coverage warning when it answers", async () => {
    const fetcher = hosts({ "tradingview.com": tradingView, "biquote.io": biquote });
    const result = await loadConfiguredCalendar(
      range,
      calendarConfiguration({}),
      fetcher,
    );
    expect(result.provider).toBe("TradingView");
    expect(result.events[0]).toMatchObject({ estimate: "201K", previous: "196K" });
    expect(result.coverage).toBeUndefined();
    expect(calls(fetcher, "tradingview.com")).toBe(1);
    expect(calls(fetcher, "biquote.io")).toBe(0);
  });
  it("adds FXStreet's pre-revision previous and names each consensus source", async () => {
    const fxRow = {
      dateUtc: "2026-09-24T12:30:00Z",
      name: "Initial Jobless Claims",
      countryCode: "US",
      actual: null,
      consensus: 203,
      previous: 195,
      revised: 196,
    };
    const result = await loadConfiguredCalendar(
      range,
      calendarConfiguration({}),
      hosts({ "tradingview.com": tradingView, "fxstreet.com": () => Response.json([fxRow]) }),
    );
    expect(result.events[0]).toMatchObject({
      estimate: "201K",
      estimateSource: "TradingView",
      previous: "196K",
      previousBeforeRevision: "195K",
    });
    expect(result.sources?.find((s) => s.name.startsWith("FXStreet"))).toMatchObject({
      status: "ok",
      count: 1,
    });
    expect(result.coverage).toBeUndefined();

    // FXStreet being down costs the extras, never the calendar or a warning.
    const without = await loadConfiguredCalendar(
      range,
      calendarConfiguration({}),
      hosts({ "tradingview.com": tradingView }),
    );
    expect(without.events[0].previousBeforeRevision).toBeNull();
    expect(without.sources?.find((s) => s.name.startsWith("FXStreet"))).toMatchObject({ status: "unavailable" });
    expect(without.coverage).toBeUndefined();
  });
  it("restores consensus from FXStreet when the fallback feed has none", async () => {
    const fxRow = {
      dateUtc: "2026-09-24T12:30:00Z",
      name: "Initial Jobless Claims",
      countryCode: "US",
      actual: null,
      consensus: 201,
      previous: 196,
      revised: null,
    };
    const result = await loadConfiguredCalendar(
      range,
      calendarConfiguration({}),
      hosts({
        "tradingview.com": () => new Response(null, { status: 503 }),
        "biquote.io": biquote,
        "fxstreet.com": () => Response.json([fxRow]),
      }),
    );
    expect(result.provider).toBe("biquote (free)");
    expect(result.events[0]).toMatchObject({ estimate: "201", estimateSource: "FXStreet" });
    expect(result.coverage?.message).toMatch(/Consensus comes from FXStreet where its releases matched\.$/);
  });
  it("falls back to biquote and says so when TradingView fails", async () => {
    const fetcher = hosts({
      "tradingview.com": () => new Response("secret body", { status: 403 }),
      "biquote.io": biquote,
    });
    const result = await loadConfiguredCalendar(
      range,
      calendarConfiguration({}),
      fetcher,
    );
    expect(result.provider).toBe("biquote (free)");
    expect(result.sources?.[0]).toMatchObject({
      name: "TradingView",
      status: "unavailable",
      error: "HTTP 403",
    });
    expect(result.coverage).toMatchObject({ status: "partial" });
    expect(result.coverage?.message).toMatch(
      /^TradingView \(HTTP 403\) is unavailable, so this view comes from biquote \(free\)\. Free biquote feed/,
    );
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("reaches the agency feeds when both free aggregators are down", async () => {
    const fetcher = hosts({
      "tradingview.com": () => new Response(null, { status: 500 }),
      "biquote.io": () => Response.json({ error: "changed" }),
      // XOOMAR's URL carries the dates, so this answer can't leak into other tests through the cache.
      "xoomar.com": () =>
        Response.json({ data: [], updatedAt: "2026-11-02T00:00:00Z" }),
    });
    const result = await loadConfiguredCalendar(
      { from: "2026-11-02", to: "2026-11-08" },
      calendarConfiguration({}),
      fetcher,
    );
    expect(result.provider).toBe("Public agency feeds");
    expect(result.coverage?.message).toMatch(
      /^TradingView \(HTTP 500\), biquote \(free\) \(Feed could not be loaded or validated\) are unavailable/,
    );
  });
  it("names an unpublished week plainly when TradingView has nothing that far ahead", async () => {
    const result = await loadConfiguredCalendar(
      range,
      calendarConfiguration({}),
      hosts({ "tradingview.com": () => Response.json({ status: "ok" }), "biquote.io": biquote }),
    );
    expect(result.provider).toBe("biquote (free)");
    expect(result.coverage?.message).toMatch(/^TradingView \(not published this far ahead\) is unavailable/);
  });
  it("attaches Kalshi prices to the releases they cover, apart from consensus", async () => {
    // Pinned before the markets close; loadKalshi skips a week that is already over.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
    const market = { strike_type: "greater_or_equal", close_time: "2026-09-24T12:25:00Z" };
    const result = await loadConfiguredCalendar(
      range,
      calendarConfiguration({}),
      hosts({
        "tradingview.com": tradingView,
        "kalshi.com": () =>
          Response.json({
            events: [
              {
                event_ticker: "KXJOBLESSCLAIMS-26SEP24",
                markets: [
                  { ...market, floor_strike: 195000, yes_bid_dollars: "0.6000", yes_ask_dollars: "0.7000" },
                  { ...market, floor_strike: 205000, yes_bid_dollars: "0.3000", yes_ask_dollars: "0.4000" },
                ],
              },
            ],
          }),
      }),
    );
    expect(result.events[0]).toMatchObject({
      estimate: "201K",
      marketImplied: { value: "200K", detail: "median", source: "Kalshi" },
    });
    expect(result.sources?.at(-1)).toMatchObject({ name: "Kalshi market prices", status: "ok", count: 1 });
  });
  it("reports every failure, safely, when nothing answers", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("https://host/?c=secret");
    });
    const error = await loadConfiguredCalendar(
      range,
      calendarConfiguration({ TRADING_ECONOMICS_API_KEY: "secret" }),
      fetcher,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalendarUnavailableError);
    const sources = (error as CalendarUnavailableError).sources;
    expect(sources.map((s) => s.name)).toEqual([
      "Trading Economics",
      "TradingView",
      "biquote (free)",
      "Public agency feeds",
    ]);
    expect(sources.every((s) => s.status === "unavailable")).toBe(true);
    expect(JSON.stringify(sources)).not.toContain("secret");
  });
  it("stops starting fallbacks once the deadline has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
    const fetcher = hosts({
      "tradingview.com": () => {
        vi.setSystemTime(Date.now() + FALLBACK_DEADLINE_MS + 1);
        return new Response(null, { status: 504 });
      },
      "biquote.io": biquote,
    });
    const error = await loadConfiguredCalendar(
      range,
      calendarConfiguration({}),
      fetcher,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalendarUnavailableError);
    expect(calls(fetcher, "tradingview.com")).toBe(1);
    expect(calls(fetcher, "biquote.io")).toBe(0);
  });
});
