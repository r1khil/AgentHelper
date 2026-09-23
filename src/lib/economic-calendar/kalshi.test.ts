import { describe, expect, it, vi } from "vitest";
import {
  impliedMedian,
  KALSHI_SERIES,
  ladder,
  likeliestOutcome,
  loadKalshi,
  overlayKalshi,
  type KalshiEvent,
} from "./kalshi";
import { makeEvent } from "./normalize";

const rung = (floor_strike: number, bid: string, ask: string, strike_type = "greater") => ({
  strike_type,
  floor_strike,
  yes_bid_dollars: Number(bid),
  yes_ask_dollars: Number(ask),
  close_time: "2026-10-02T12:29:00Z",
});
const series = (ticker: string) => KALSHI_SERIES.find((s) => s.ticker === ticker)!;
const payrolls: KalshiEvent = {
  series: series("KXPAYROLLS"),
  ticker: "KXPAYROLLS-26SEP",
  closes: Date.parse("2026-10-02T12:29:00Z"),
  markets: [
    rung(60000, "0.64", "0.68"),
    rung(70000, "0.58", "0.63"),
    rung(80000, "0.55", "0.56"),
    rung(90000, "0.48", "0.52"),
    rung(100000, "0.37", "0.38"),
  ],
};
const nfp = makeEvent({
  id: "tv:nfp",
  date: "2026-10-02",
  timestamp: "2026-10-02T12:30:00.000Z",
  name: "Non Farm Payrolls",
  source: "Bureau of Labor Statistics",
  previous: "162K",
});

describe("Kalshi market prices", () => {
  it("reads even odds off the ladder, skipping rungs too wide to mean anything", () => {
    const rungs = ladder([...payrolls.markets, rung(95000, "0.03", "0.97")]);
    expect(rungs.map((r) => r.strike)).toEqual([60000, 70000, 80000, 90000, 100000]);
    expect(impliedMedian(rungs)).toBe(90000);
    // Claims ladders are "at least": P(≥195K) 0.655, P(≥200K) 0.46 → about 199K.
    const claims = ladder([rung(195000, "0.60", "0.71", "greater_or_equal"), rung(200000, "0.40", "0.52", "greater_or_equal")]);
    expect(Math.round(impliedMedian(claims)! / 1000)).toBe(199);
  });
  it("smooths a ladder that prices a higher strike above a lower one", () => {
    const rungs = ladder([rung(1, "0.40", "0.44"), rung(2, "0.50", "0.54"), rung(3, "0.10", "0.12")]);
    expect(rungs.map((r) => Number(r.p.toFixed(4)))).toEqual([0.42, 0.42, 0.11]);
  });
  it("has no median when the ladder never crosses even odds", () => {
    expect(impliedMedian(ladder([rung(1, "0.80", "0.82"), rung(2, "0.70", "0.72")]))).toBeNull();
    expect(impliedMedian([])).toBeNull();
  });
  it("names the likeliest Fed outcome with its chance", () => {
    const fed = ladder([rung(3.75, "0.99", "1.00"), rung(4, "0.64", "0.66"), rung(4.25, "0.01", "0.02")]);
    const best = likeliestOutcome(fed, 0.25)!;
    expect(best.level).toBe(4.25);
    expect(Math.round(best.p * 100)).toBe(64);
  });
  it("attaches the price to the release the market closes just before, in its units", () => {
    const { events, priced } = overlayKalshi([nfp], [payrolls]);
    expect(priced).toBe(1);
    expect(events[0].marketImplied).toEqual({
      value: "90K",
      detail: "median",
      source: "Kalshi",
      url: "https://kalshi.com/markets/kxpayrolls",
    });
    // Consensus is left alone: a price is not a survey.
    expect(events[0].estimate).toBeNull();
  });
  it("matches MQL5 names too, and nothing at another time or of another series", () => {
    const mql5 = makeEvent({ ...nfp, id: "bq:nfp", name: "Nonfarm Payrolls" });
    expect(overlayKalshi([mql5], [payrolls]).priced).toBe(1);
    const nextMonth = makeEvent({ ...nfp, id: "tv:nov", date: "2026-11-06", timestamp: "2026-11-06T13:30:00.000Z" });
    const rate = makeEvent({ ...nfp, id: "tv:u3", name: "Unemployment Rate" });
    const untimed = makeEvent({ ...nfp, id: "tv:x", timestamp: null });
    expect(overlayKalshi([nextMonth, rate, untimed], [payrolls]).priced).toBe(0);
  });
  it("writes each series in the calendar's units", () => {
    const cpi = { ...payrolls, series: series("KXCPI"), markets: [rung(0.2, "0.80", "0.84"), rung(0.3, "0.30", "0.34")] };
    const event = makeEvent({ ...nfp, id: "tv:cpi", name: "Inflation Rate MoM", previous: "0.4%" });
    expect(overlayKalshi([event], [cpi]).events[0].marketImplied?.value).toBe("0.26%");
    const fed = {
      ...payrolls,
      series: series("KXFED"),
      markets: [rung(3.75, "0.99", "1.00"), rung(4, "0.64", "0.66"), rung(4.25, "0.01", "0.02")],
    };
    const decision = makeEvent({ ...nfp, id: "tv:fed", name: "Fed Interest Rate Decision", previous: "4%" });
    expect(overlayKalshi([decision], [fed]).events[0].marketImplied).toMatchObject({ value: "4.25%", detail: "64% likely" });
  });
  it("asks for each series' open events and skips weeks that are over", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ events: [{ event_ticker: "KXPAYROLLS-26SEP", markets: [{ ...rung(90000, "0.48", "0.52"), yes_bid_dollars: "0.4800", yes_ask_dollars: "0.5200" }] }] }),
    );
    const now = Date.parse("2026-09-23T16:00:00Z");
    const events = await loadKalshi({ from: "2026-09-28", to: "2026-10-04" }, fetcher, now);
    expect(fetcher).toHaveBeenCalledTimes(KALSHI_SERIES.length);
    const url = (fetcher.mock.calls[0] as unknown[])[0] as URL;
    expect(Object.fromEntries(url.searchParams)).toEqual({ series_ticker: "KXPAYROLLS", status: "open", with_nested_markets: "true" });
    expect(events[0]).toMatchObject({ ticker: "KXPAYROLLS-26SEP", closes: Date.parse("2026-10-02T12:29:00Z") });
    expect(events[0].markets[0].yes_bid_dollars).toBe(0.48);
    const past = vi.fn();
    expect(await loadKalshi({ from: "2026-09-14", to: "2026-09-20" }, past, now)).toEqual([]);
    expect(past).not.toHaveBeenCalled();
    await expect(
      loadKalshi({ from: "2026-09-28", to: "2026-10-04" }, vi.fn(async () => new Response(null, { status: 429 })), now),
    ).rejects.toThrow("HTTP 429");
  });
});
