import { afterEach, describe, expect, it, vi } from "vitest";
import { biquoteProvider, parseBiquote } from "./biquote-provider";
import { inRange } from "./normalize";
import {
  calendarConfiguration,
  loadConfiguredCalendar,
} from "./provider-selection";
const row = {
  id: "mql5:1",
  eventId: "mql5:claims",
  time: "2026-09-24T12:30:00Z",
  period: "2026-09-19T00:00:00Z",
  countryCode: "US",
  currency: "USD",
  name: "Initial Jobless Claims",
  importance: "high",
  type: "indicator",
  sector: "jobs",
  unit: "none",
  multiplier: "thousands",
  actual: 0,
  forecast: 189,
  previous: 196,
  revisedPrevious: 195,
  timeMode: "exact",
  sourceUrl: "https://www.dol.gov/",
  source: "mql5",
};
const range = { from: "2026-09-21", to: "2026-09-27" };
afterEach(() => vi.useRealTimers());
describe("free calendar provider", () => {
  it("preserves values/scales/periods and revisions without labeling forecasts consensus", () => {
    expect(parseBiquote([row])[0]).toMatchObject({
      id: "biquote:mql5:1",
      time: "8:30 AM",
      period: "2026-09-19",
      actual: "0",
      estimate: null,
      providerForecast: "189",
      previous: "195",
      previousBeforeRevision: "196",
      unit: "thousands",
      importance: 3,
    });
    expect(parseBiquote([{ ...row, revisedPrevious: 0 }])[0].previous).toBe(
      "0",
    );
    expect(
      parseBiquote([
        { ...row, actual: null, previous: null, revisedPrevious: null },
      ])[0],
    ).toMatchObject({
      actual: null,
      previous: null,
      previousBeforeRevision: null,
    });
  });
  it("dedupes schedule/observation records by exact provider series identity", () => {
    const schedule = { ...row, id: "mql5:schedule", actual: null };
    expect(parseBiquote([row, schedule])).toHaveLength(1);
    expect(parseBiquote([schedule, row])[0].actual).toBe("0");
    expect(
      parseBiquote([row, { ...row, eventId: "different-measure" }]),
    ).toHaveLength(2);
    expect(() => parseBiquote([row, { ...row, actual: 9 }])).toThrow(
      "Conflicting",
    );
  });
  it("blanks future actuals, preserves previous, and maintains IDs on value changes", () => {
    const [event] = parseBiquote([row]);
    expect(
      inRange([event], range, Date.parse("2026-09-21T12:00:00Z"))[0],
    ).toMatchObject({ actual: null, previous: "195", estimate: null });
    expect(
      parseBiquote([{ ...row, actual: 200, time: "2026-09-25T12:30:00Z" }])[0]
        .id,
    ).toBe(event.id);
  });
  it("keeps uncertain days without invented times and converts exact DST/week boundaries", () => {
    expect(
      parseBiquote([
        { ...row, time: "2026-09-21T00:00:00Z", timeMode: "date" },
      ])[0],
    ).toMatchObject({ date: "2026-09-21", time: "TBA", timestamp: null });
    expect(
      parseBiquote([{ ...row, time: "2026-09-28T03:30:00Z" }])[0],
    ).toMatchObject({ date: "2026-09-27", time: "11:30 PM" });
    expect(
      parseBiquote([{ ...row, time: "2026-11-02T13:30:00Z" }])[0].time,
    ).toBe("8:30 AM");
    expect(() =>
      parseBiquote([{ ...row, time: "2026-09-24T12:30:00" }]),
    ).toThrow();
    expect(parseBiquote([{ ...row, countryCode: "CA" }])).toEqual([]);
  });
  it("splits saturated ranges and dedupes inclusive boundaries", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(Array(500).fill(row)))
      .mockResolvedValueOnce(Response.json([row]))
      .mockResolvedValueOnce(Response.json([row]));
    expect(
      (await biquoteProvider(fetcher).getEvents(range)).events,
    ).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      (fetcher.mock.calls[0][0] as URL).searchParams.get("countries"),
    ).toBe("US");
  });
  it("fails visibly for malformed responses and HTTP failures", async () => {
    await expect(
      biquoteProvider(
        vi.fn().mockResolvedValue(Response.json({ error: "bad" })),
      ).getEvents(range),
    ).rejects.toThrow();
    await expect(
      biquoteProvider(
        vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
      ).getEvents(range),
    ).rejects.toThrow("HTTP 503");
  });
  it("explicit free mode bypasses a saved unentitled paid key", async () => {
    const fetcher = vi.fn(async () => Response.json([row]));
    const config = calendarConfiguration({
      ECONOMIC_CALENDAR_PROVIDER: "biquote",
      EODHD_API_KEY: "unused-secret",
    });
    expect(
      (await loadConfiguredCalendar(range, config, fetcher)).provider,
    ).toBe("biquote (free)");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("unused-secret");
    expect(
      calendarConfiguration({ ECONOMIC_CALENDAR_PROVIDER: "biquote" })
        .cacheScope,
    ).not.toBe(
      calendarConfiguration({ ECONOMIC_CALENDAR_PROVIDER: "public" })
        .cacheScope,
    );
  });
});
