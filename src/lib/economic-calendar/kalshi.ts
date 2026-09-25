import { DateTime } from "luxon";
import { z } from "zod";
import { NY } from "@/lib/providers/calendar";
import { impliedMedian, ladder, likeliestOutcome } from "@/lib/providers/prediction-markets";
import type { CalendarRange, EconomicEvent } from "./types";

// Kalshi's public market-data API (documented, no key). Its U.S. macro markets are ladders of "above X"
// contracts that close minutes before each release, so they price a release weeks before economists'
// consensus is published. A price is not a survey: this is kept apart from consensus and never feeds
// the surprise comparison.
export const KALSHI_EVENTS = "https://api.elections.kalshi.com/trade-api/v2/events";
export const KALSHI_PAGE = "https://kalshi.com/category/economics";

const thousands = (n: number) => `${Math.round(n / 1000)}K`;
const percent = (decimals: number) => (n: number) => `${Number(n.toFixed(decimals))}%`;
const level = (n: number) => `${Number(n.toFixed(1))}`;

type Series = {
  ticker: string;
  /** Release names across providers: Trading Economics ("Inflation Rate MoM") and MQL5 ("CPI m/m"). */
  name: RegExp;
  format: (n: number) => string;
  /** Fed decisions land on 25 bp steps, so the likeliest outcome says more than a median. */
  likeliest?: number;
};
export const KALSHI_SERIES: Series[] = [
  { ticker: "KXPAYROLLS", name: /^non ?farm payrolls$/i, format: thousands },
  { ticker: "KXU3", name: /^unemployment rate$/i, format: percent(2) },
  { ticker: "KXCPI", name: /^(?:inflation rate|cpi) (?:mom|m\/m)$/i, format: percent(2) },
  { ticker: "KXCPIYOY", name: /^(?:inflation rate|cpi) (?:yoy|y\/y)$/i, format: percent(2) },
  { ticker: "KXCPICORE", name: /^core (?:inflation rate|cpi) (?:mom|m\/m)$/i, format: percent(2) },
  { ticker: "KXCPICOREYOY", name: /^core (?:inflation rate|cpi) (?:yoy|y\/y)$/i, format: percent(2) },
  { ticker: "KXPCEHEAD", name: /^pce price index (?:mom|m\/m)$/i, format: percent(2) },
  { ticker: "KXPCECORE", name: /^core pce price index (?:mom|m\/m)$/i, format: percent(2) },
  { ticker: "KXGDP", name: /^gdp (?:growth rate )?(?:qoq|q\/q)\b/i, format: percent(1) },
  { ticker: "KXJOBLESSCLAIMS", name: /^initial jobless claims$/i, format: thousands },
  { ticker: "KXISMPMI", name: /^ism manufacturing pmi$/i, format: level },
  { ticker: "KXUSISMSERV", name: /^ism (?:services|non-manufacturing) pmi$/i, format: level },
  { ticker: "KXUSRETAIL", name: /^retail sales (?:mom|m\/m)$/i, format: percent(2) },
  { ticker: "KXUSPPI", name: /^ppi (?:mom|m\/m)$/i, format: percent(2) },
  { ticker: "KXFED", name: /^fed(?:eral)? (?:funds|interest) rate(?: decision)?$/i, format: percent(2), likeliest: 0.25 },
];

const dollars = z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number).nullish();
const marketSchema = z.object({
  strike_type: z.string(),
  floor_strike: z.number().finite().nullish(),
  yes_bid_dollars: dollars,
  yes_ask_dollars: dollars,
  close_time: z.string().datetime({ offset: true }),
});
const bodySchema = z.object({
  events: z.array(
    z.object({ event_ticker: z.string(), markets: z.array(marketSchema).default([]) }),
  ),
});
// The ladder math is shared with Hoot's get_market_odds tool.
export { impliedMedian, ladder, likeliestOutcome };

export type KalshiEvent = { series: Series; ticker: string; closes: number; markets: z.infer<typeof marketSchema>[] };

export async function loadKalshi(range: CalendarRange, fetcher: typeof fetch = fetch, now = Date.now()) {
  // Markets close at the release, so a week that is over has nothing left to price.
  if (range.to < DateTime.fromMillis(now, { zone: NY }).toISODate()!) return [];
  const settled = await Promise.allSettled(
    KALSHI_SERIES.map(async (series) => {
      const url = new URL(KALSHI_EVENTS);
      url.search = new URLSearchParams({ series_ticker: series.ticker, status: "open", with_nested_markets: "true" }).toString();
      const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(5_000), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return bodySchema.parse(await response.json()).events.flatMap((e): KalshiEvent[] => {
        const closes = Math.min(...e.markets.map((m) => Date.parse(m.close_time)));
        return e.markets.length ? [{ series, ticker: e.event_ticker, closes, markets: e.markets }] : [];
      });
    }),
  );
  if (settled.every((s) => s.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}

/** A release is a market's when the market closes within this long before it. */
const CLOSE_TO_RELEASE_MS = 20 * 60_000;

/** Attach each open market's implied value to the release it prices. */
export function overlayKalshi(events: EconomicEvent[], markets: KalshiEvent[]) {
  let priced = 0;
  const out = events.map((event) => {
    if (!event.timestamp) return event;
    const at = Date.parse(event.timestamp);
    const market = markets.find(
      (m) => m.series.name.test(event.name.trim()) && at > m.closes - 60_000 && at - m.closes <= CLOSE_TO_RELEASE_MS,
    );
    if (!market) return event;
    const rungs = ladder(market.markets);
    const { series } = market;
    let value: string | null = null;
    let detail = "median";
    if (series.likeliest) {
      const outcome = likeliestOutcome(rungs, series.likeliest);
      if (outcome && outcome.p >= 0.3) {
        value = series.format(outcome.level);
        detail = `${Math.round(outcome.p * 100)}% likely`;
      }
    } else {
      const median = impliedMedian(rungs);
      if (median !== null) value = series.format(median);
    }
    if (value === null) return event;
    priced++;
    return {
      ...event,
      marketImplied: {
        value,
        detail,
        source: "Kalshi",
        url: `https://kalshi.com/markets/${series.ticker.toLowerCase()}`,
      },
    };
  });
  return { events: out, priced };
}
