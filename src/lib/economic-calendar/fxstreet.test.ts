import { describe, expect, it, vi } from "vitest";
import {
  figure,
  loadFxStreet,
  overlayFxStreet,
  parseFxStreet,
  type FxStreetRow,
} from "./fxstreet";
import { makeEvent } from "./normalize";

const claims = makeEvent({
  id: "tv:1",
  date: "2026-09-24",
  timestamp: "2026-09-24T12:30:00.000Z",
  name: "Initial Jobless Claims",
  source: "Department of Labour",
  previous: "196K",
});
const fx = (row: Partial<FxStreetRow>): FxStreetRow => ({
  dateUtc: "2026-09-24T12:30:00Z",
  name: "Initial Jobless Claims",
  countryCode: "US",
  actual: null,
  consensus: 201,
  previous: 195,
  revised: 196,
  ...row,
});

describe("FXStreet overlay", () => {
  it("reads figures the way the page writes them", () => {
    expect(figure("196K")).toBe(196);
    expect(figure("-$255B")).toBe(-255);
    expect(figure("0.4%")).toBe(0.4);
    expect(figure("1,234.5")).toBe(1234.5);
    expect(figure("n/a")).toBeNull();
    expect(figure(null)).toBeNull();
  });
  it("fills missing consensus and the pre-revision previous in the event's own units", () => {
    const { events, matched, consensus } = overlayFxStreet([claims], [fx({})]);
    expect({ matched, consensus }).toEqual({ matched: 1, consensus: 1 });
    expect(events[0]).toMatchObject({
      estimate: "201K",
      estimateSource: "FXStreet",
      previous: "196K",
      previousBeforeRevision: "195K",
    });
    const trade = makeEvent({
      ...claims,
      id: "tv:2",
      name: "Balance of Trade",
      previous: "-$71.2B",
    });
    const [filled] = overlayFxStreet(
      [trade],
      [fx({ name: "Goods and Services Trade Balance", consensus: -90, previous: -73.3, revised: -71.2 })],
    ).events;
    expect(filled).toMatchObject({ estimate: "-$90B", previousBeforeRevision: "-$73.3B" });
  });
  it("never replaces the provider's own consensus or revision", () => {
    const own = { ...claims, estimate: "200K", estimateSource: "TradingView", previousBeforeRevision: "190K" };
    expect(overlayFxStreet([own], [fx({})]).events[0]).toEqual(own);
  });
  it("matches across naming differences only when the figures agree", () => {
    const cpi = makeEvent({ ...claims, id: "tv:3", name: "Inflation Rate MoM", previous: "-0.4%", actual: "0.1%" });
    const row = fx({ name: "Consumer Price Index (MoM)", consensus: 0.1, previous: -0.4, revised: null, actual: 0.1 });
    expect(overlayFxStreet([cpi], [row]).events[0].estimate).toBe("0.1%");
    // Same minute and previous, but the actual shows it's a different series.
    expect(overlayFxStreet([cpi], [{ ...row, actual: 0.3 }]).consensus).toBe(0);
  });
  it("refuses a coincidence of values between unrelated series", () => {
    const gdp = makeEvent({ ...claims, id: "tv:4", name: "GDP Price Index QoQ Final", previous: "3.6%" });
    const pce = fx({ name: "Core Personal Consumption Expenditures (QoQ)", consensus: 3.6, previous: 3.6, revised: null });
    expect(overlayFxStreet([gdp], [pce]).matched).toBe(0);
  });
  it("skips ambiguous, untimed and previous-less events", () => {
    const two = [fx({}), fx({ name: "Initial Jobless Claims 4-week average" })];
    expect(overlayFxStreet([claims], two).matched).toBe(0);
    const untimed = makeEvent({ ...claims, id: "tv:5", timestamp: null });
    const blank = makeEvent({ ...claims, id: "tv:6", previous: null });
    expect(overlayFxStreet([untimed, blank], [fx({})]).matched).toBe(0);
    expect(overlayFxStreet([claims], [fx({ dateUtc: "2026-09-24T12:31:00Z" })]).matched).toBe(0);
  });
  it("asks for the padded Eastern week with the Referer the feed requires", async () => {
    const fetcher = vi.fn(async () => Response.json([fx({}), fx({ countryCode: "GB" })]));
    const rows = await loadFxStreet({ from: "2026-09-21", to: "2026-09-27" }, fetcher);
    expect(rows).toHaveLength(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/en/api/v1/eventDates/2026-09-20T04:00:00Z/2026-09-29T04:00:00Z");
    expect(url.searchParams.get("countries")).toBe("US");
    expect(new Headers(init.headers).get("Referer")).toBe("https://www.fxstreet.com/");
    await expect(
      loadFxStreet({ from: "2026-09-21", to: "2026-09-27" }, vi.fn(async () => new Response(null, { status: 401 }))),
    ).rejects.toThrow("HTTP 401");
    expect(() => parseFxStreet({ error: "changed" })).toThrow();
  });
});
