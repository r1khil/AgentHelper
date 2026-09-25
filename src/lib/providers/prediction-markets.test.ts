import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The provider cache writes through to the database when DATABASE_URL is set; keep tests off it.
vi.mock("@/db/client", () => ({ db: {} }));

import {
  kalshiMarket,
  ladder,
  likeliestRange,
  matchSeries,
  numberFormat,
  polymarketMarket,
  searchKalshi,
  searchPolymarket,
  searchWords,
  type KalshiSeries,
} from "./prediction-markets";

// Trimmed from live responses on 2026-09-25.
const km = (ticker: string, over: Record<string, unknown>) => ({
  ticker,
  status: "active",
  close_time: "2026-10-28T17:55:00Z",
  volume_fp: 5000,
  open_interest_fp: 2000,
  ...over,
});
const fedOct = {
  event_ticker: "KXFED-26OCT",
  series_ticker: "KXFED",
  title: "Fed funds rate after Oct 2026 meeting?",
  sub_title: "On Oct 28, 2026",
  mutually_exclusive: false,
  markets: [
    km("KXFED-26OCT-T3.75", { strike_type: "greater", floor_strike: 3.75, yes_sub_title: "Above 3.75%", yes_bid_dollars: 0.99, yes_ask_dollars: 1, volume_fp: 23957 }),
    km("KXFED-26OCT-T4.00", { strike_type: "greater", floor_strike: 4, yes_sub_title: "Above 4.00%", yes_bid_dollars: 0.66, yes_ask_dollars: 0.67, volume_fp: 64490 }),
    km("KXFED-26OCT-T4.25", { strike_type: "greater", floor_strike: 4.25, yes_sub_title: "Above 4.25%", yes_bid_dollars: 0.01, yes_ask_dollars: 0.02, volume_fp: 18664 }),
    km("KXFED-26OCT-T4.50", { strike_type: "greater", floor_strike: 4.5, yes_sub_title: "Above 4.50%", yes_bid_dollars: 0, yes_ask_dollars: 0.3, volume_fp: 6345 }),
  ],
};
const cuts = {
  event_ticker: "KXRATECUTCOUNT-26DEC31",
  series_ticker: "KXRATECUTCOUNT",
  title: "Number of rate cuts in 2026?",
  sub_title: "In 2026",
  mutually_exclusive: true,
  markets: [
    km("T0", { strike_type: "between", yes_sub_title: "Exactly 0 cuts", yes_bid_dollars: 0.952, yes_ask_dollars: 0.955, volume_fp: 2576593 }),
    km("T1", { strike_type: "between", yes_sub_title: "Exactly 1 cut", yes_bid_dollars: 0.02, yes_ask_dollars: 0.025, volume_fp: 1101903 }),
    // Quoted but never traded: too thin to count.
    km("T9", { strike_type: "between", yes_sub_title: "Exactly 9 cuts", yes_bid_dollars: 0, yes_ask_dollars: 0.01, volume_fp: 0 }),
  ],
};
const recession = {
  event_ticker: "KXRECSSNBER-26",
  series_ticker: "KXRECSSNBER",
  title: "Recession this year?",
  sub_title: "In 2026",
  mutually_exclusive: false,
  markets: [km("KXRECSSNBER-26", { yes_sub_title: "Starts", yes_bid_dollars: "0.0500", yes_ask_dollars: "0.0600", volume_fp: "3580218.53", close_time: "2027-01-31T13:25:00Z" })],
};

const pm = (id: string, over: Record<string, unknown>) => ({
  id,
  question: "",
  active: true,
  closed: false,
  acceptingOrders: true,
  outcomes: '["Yes", "No"]',
  endDate: "2027-01-01T04:59:00Z",
  volumeNum: 50_000,
  liquidityNum: 10_000,
  ...over,
});
const polyCuts = {
  id: "51456",
  slug: "how-many-fed-rate-cuts-in-2026",
  title: "How many Fed rate cuts in 2026?",
  active: true,
  closed: false,
  negRisk: true,
  openInterest: 1971147.48,
  markets: [
    pm("1", { question: "Will no Fed rate cuts happen in 2026?", groupItemTitle: "0 (0 bps)", bestBid: 0.969, bestAsk: 0.97, volumeNum: 8539168 }),
    pm("2", { question: "Will 1 Fed rate cut happen in 2026?", groupItemTitle: "1 (25 bps)", bestBid: 0.015, bestAsk: 0.019, volumeNum: 3361479 }),
  ],
};
const polyCutBy = {
  id: "106884",
  slug: "fed-rate-cut-by-629",
  title: "Fed rate cut by...?",
  active: true,
  closed: false,
  negRisk: false,
  markets: [
    // A January market that already resolved: history, not odds.
    pm("949492", { question: "Fed rate cut by January 2026 meeting?", groupItemTitle: "January Meeting", closed: true, acceptingOrders: false, umaResolutionStatus: "resolved", bestAsk: 0.001, volumeNum: 588114 }),
    pm("3", { question: "Fed rate cut by December 2026 meeting?", groupItemTitle: "December 2026 Meeting", bestBid: 0.028, bestAsk: 0.03, volumeNum: 375856 }),
    // Wide and barely traded.
    pm("4", { question: "Fed rate cut by March 2027 meeting?", groupItemTitle: "March 2027 Meeting", bestBid: 0.05, bestAsk: 0.31, volumeNum: 34 }),
  ],
};
const polyResolved = { id: "903089", slug: "fed-rate-cut-by", title: "Fed rate cut by...?", active: true, closed: true, markets: [pm("5", { closed: true, bestBid: 0.99, bestAsk: 1 })] };

describe("prediction market reading", () => {
  it("reads a Kalshi ladder as a median and likeliest range, skipping rungs too wide to mean anything", () => {
    const { market, dropped } = kalshiMarket(fedOct, undefined);
    expect(dropped).toBe(1);
    expect(market).toMatchObject({
      venue: "Kalshi",
      kind: "ladder",
      title: "Fed funds rate after Oct 2026 meeting? — On Oct 28, 2026",
      url: "https://kalshi.com/markets/kxfed",
      volume: 113456,
      volumeUnit: "contracts",
      impliedMedian: "4.06%",
      likeliest: { label: "above 4% to 4.25%", probabilityPct: 65 },
      closes: "2026-10-28T17:55:00.000Z",
    });
    // Near-certain rungs are left out of the list; the informative one stays.
    expect(market!.outcomes).toEqual([{ label: "Above 4.00%", probabilityPct: 66.5, spreadPct: 1, volume: 64490 }]);
  });
  it("lists a one-winner Kalshi event's outcomes and drops never-traded ones", () => {
    const { market, dropped } = kalshiMarket(cuts, undefined);
    expect(dropped).toBe(1);
    expect(market).toMatchObject({ kind: "outcomes", mutuallyExclusive: true, likeliest: { label: "Exactly 0 cuts", probabilityPct: 95.3 } });
    expect(market!.outcomes.map((o) => o.label)).toEqual(["Exactly 0 cuts", "Exactly 1 cut"]);
  });
  it("drops a ladder whose whole event has barely traded", () => {
    const thin = { ...fedOct, markets: fedOct.markets.map((m) => ({ ...m, volume_fp: 10 })) };
    expect(kalshiMarket(thin, undefined)).toEqual({ market: null, dropped: 4 });
  });
  it("keeps only open, liquid Polymarket contracts", () => {
    const one = polymarketMarket(polyCuts as never);
    expect(one.market).toMatchObject({
      venue: "Polymarket",
      kind: "outcomes",
      mutuallyExclusive: true,
      url: "https://polymarket.com/event/how-many-fed-rate-cuts-in-2026",
      volumeUnit: "USD",
      openInterest: 1971147,
      likeliest: { label: "0 (0 bps)", probabilityPct: 97 },
    });
    const by = polymarketMarket(polyCutBy as never);
    // The resolved January contract is not counted as dropped; it is simply not a live market.
    expect(by.dropped).toBe(1);
    expect(by.market!.outcomes).toEqual([{ label: "December 2026 Meeting", probabilityPct: 2.9, spreadPct: 0.2, volume: 375856 }]);
    expect(by.market!.likeliest).toBeUndefined();
  });
  it("does not name a likeliest outcome when the listed ones hold little of the odds", () => {
    const stale = { ...cuts, markets: [km("Q4", { yes_sub_title: "Q4 2025", yes_bid_dollars: 0.03, yes_ask_dollars: 0.09 }), km("Q3", { yes_sub_title: "Q3 2025", yes_bid_dollars: 0.01, yes_ask_dollars: 0.02 })] };
    expect(kalshiMarket(stale, undefined).market!.likeliest).toBeNull();
  });
  it("writes ladder values in the rungs' units", () => {
    expect(numberFormat("Above $80\u200e billion")(261.84)).toBe("$261.8 billion");
    expect(numberFormat("Above 4.00%")(4.0625)).toBe("4.06%");
    expect(numberFormat("Above -25,000")(51234)).toBe("51,230");
  });
  it("names ladder ranges in the contract's units", () => {
    const rungs = ladder([{ strike_type: "greater", floor_strike: 0.2, yes_bid_dollars: 0.8, yes_ask_dollars: 0.84 }, { strike_type: "greater", floor_strike: 0.3, yes_bid_dollars: 0.3, yes_ask_dollars: 0.34 }]);
    expect(likeliestRange(rungs, (n) => `${n}%`)).toEqual({ label: "above 0.2% to 0.3%", p: expect.closeTo(0.5, 5) });
  });
});

describe("Kalshi series matching", () => {
  const series: KalshiSeries[] = [
    { ticker: "RATECUT", title: "Fed rate cut", category: "Economics", tags: ["Interest rates"] },
    { ticker: "KXRATECUT", title: "Fed rate cut", category: "Economics", tags: ["Fed"] },
    { ticker: "KXFED", title: "Fed funds rate", category: "Economics", tags: ["Fed"] },
    { ticker: "KXCPI", title: "CPI", category: "Economics", tags: ["Inflation"] },
    { ticker: "KXRECESSAPPT", title: "Recess appointments", category: "Politics", tags: [] },
    { ticker: "KXRECSSNBER", title: "Recession", category: "Economics", tags: ["Growth"] },
  ];
  it("ranks title matches, prefers KX tickers, and does not stretch a word", () => {
    expect(matchSeries(series, "Will the Fed cut rates?").map((s) => s.ticker)).toEqual(["KXRATECUT", "KXFED"]);
    expect(matchSeries(series, "recession odds").map((s) => s.ticker)).toEqual(["KXRECSSNBER"]);
    expect(matchSeries(series, "inflation").map((s) => s.ticker)).toEqual(["KXCPI"]);
    expect(searchWords("FOMC decision 2026")).toEqual(["fed", "decision"]);
  });
});

describe("venue search", () => {
  beforeEach(() => vi.stubEnv("DATABASE_URL", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("matches Kalshi series, then reads only their open events", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/series"))
        return Response.json({ series: url.searchParams.get("category") === "Economics" ? [{ ticker: "KXRECSSNBER", title: "Recession", category: "Economics", tags: ["Growth"] }] : [] });
      return Response.json({ events: [recession] });
    });
    const r = await searchKalshi("recession", 5, fetcher as typeof fetch);
    // The API sends prices and volumes as strings.
    expect(r.markets).toMatchObject([{ id: "KXRECSSNBER-26", kind: "binary", outcomes: [{ label: "Yes", probabilityPct: 5.5, spreadPct: 1, volume: 3580219 }] }]);
    const eventsCall = fetcher.mock.calls.map((c) => new URL(String(c[0]))).find((u) => u.pathname.endsWith("/events"))!;
    expect(Object.fromEntries(eventsCall.searchParams)).toEqual({ series_ticker: "KXRECSSNBER", status: "open", with_nested_markets: "true" });
  });
  it("asks Polymarket for active events and filters resolved ones", async () => {
    const fetcher = vi.fn(async () => Response.json({ events: [polyResolved, polyCutBy, polyCuts], pagination: { hasMore: false } }));
    const r = await searchPolymarket("fed rate cut", 5, fetcher as typeof fetch);
    const url = new URL(String((fetcher.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe("/public-search");
    expect(url.searchParams.get("events_status")).toBe("active");
    expect(r.markets.map((m) => m.id)).toEqual(["fed-rate-cut-by-629", "how-many-fed-rate-cuts-in-2026"]);
    expect(r.dropped).toEqual({ markets: 1, events: 0 });
  });
  it("surfaces an HTTP failure", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(searchPolymarket("tariffs", 5, fetcher as typeof fetch)).rejects.toThrow("polymarket HTTP 503");
  });
});
