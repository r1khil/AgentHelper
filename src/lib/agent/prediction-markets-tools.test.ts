import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/prediction-markets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers/prediction-markets")>()),
  searchKalshi: vi.fn(),
  searchPolymarket: vi.fn(),
}));

import { searchKalshi, searchPolymarket, type PredictionMarket } from "@/lib/providers/prediction-markets";
import { makePredictionMarketTools } from "./prediction-markets-tools";
import type { ToolResult } from "./tools";

const kalshi: PredictionMarket = {
  venue: "Kalshi",
  id: "KXRECSSNBER-26",
  title: "Recession this year? — In 2026",
  kind: "binary",
  mutuallyExclusive: false,
  closes: "2027-01-31T13:25:00.000Z",
  url: "https://kalshi.com/markets/kxrecssnber",
  volume: 3580219,
  volumeUnit: "contracts",
  openInterest: 957447,
  liquidity: null,
  outcomes: [{ label: "Yes", probabilityPct: 5.5, spreadPct: 1, volume: 3580219 }],
};
const poly: PredictionMarket = {
  ...kalshi,
  venue: "Polymarket",
  id: "us-recession-by-end-of-2026",
  title: "US recession by end of 2026?",
  url: "https://polymarket.com/event/us-recession-by-end-of-2026",
  volume: 2130445,
  volumeUnit: "USD",
  outcomes: [{ label: "Yes", probabilityPct: 11.5, spreadPct: 1, volume: 2130445 }],
};

type Data = { markets: (PredictionMarket & { sourceId: string })[]; dropped: Record<string, unknown>; unavailable?: Record<string, string> };
const run = (input: object) =>
  (makePredictionMarketTools().get_market_odds.execute as (i: unknown, o: unknown) => Promise<ToolResult<Data | null>>)(
    { venue: "both", limit: 5, ...input },
    { toolCallId: "t", messages: [] },
  );

describe("get_market_odds", () => {
  beforeEach(() => {
    vi.mocked(searchKalshi).mockReset();
    vi.mocked(searchPolymarket).mockReset();
  });

  it("returns both venues side by side, each market citing its own page", async () => {
    vi.mocked(searchKalshi).mockResolvedValue({ markets: [kalshi], dropped: { markets: 2, events: 0 } });
    vi.mocked(searchPolymarket).mockResolvedValue({ markets: [poly], dropped: { markets: 0, events: 1 } });
    const r = await run({ query: "recession" });
    expect(r.error).toBeUndefined();
    expect(r.data!.markets.map((m) => m.venue)).toEqual(["Kalshi", "Polymarket"]);
    expect(r.sources.map((s) => s.url)).toEqual([kalshi.url, poly.url]);
    expect(r.data!.markets.map((m) => m.sourceId)).toEqual(r.sources.map((s) => s.id));
    expect(r.sources[0]).toMatchObject({ publisher: "Kalshi", sourceType: "Prediction market", title: "Kalshi: Recession this year? — In 2026" });
    expect(r.sources[1].excerpt).toContain("Yes 11.5%");
    expect(r.data!.dropped).toMatchObject({ kalshi: { markets: 2, events: 0 }, polymarket: { markets: 0, events: 1 } });
    expect(searchKalshi).toHaveBeenCalledWith("recession", 5);
  });
  it("asks one venue when told to", async () => {
    vi.mocked(searchPolymarket).mockResolvedValue({ markets: [poly], dropped: { markets: 0, events: 0 } });
    await run({ query: "recession", venue: "polymarket" });
    expect(searchKalshi).not.toHaveBeenCalled();
  });
  it("still answers from one venue when the other is down, and says so", async () => {
    vi.mocked(searchKalshi).mockRejectedValue(new Error("kalshi HTTP 503"));
    vi.mocked(searchPolymarket).mockResolvedValue({ markets: [poly], dropped: { markets: 0, events: 0 } });
    const r = await run({ query: "recession" });
    expect(r.data!.unavailable).toEqual({ kalshi: "kalshi HTTP 503" });
    expect(r.sources).toHaveLength(1);
  });
  it("fails without throwing when every venue is down", async () => {
    vi.mocked(searchKalshi).mockRejectedValue(new Error("kalshi HTTP 503"));
    vi.mocked(searchPolymarket).mockRejectedValue(new Error("polymarket HTTP 503"));
    const r = await run({ query: "recession" });
    expect(r).toEqual({ data: null, sources: [], error: "kalshi HTTP 503" });
  });
});
