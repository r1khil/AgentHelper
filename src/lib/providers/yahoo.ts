import YahooFinance from "yahoo-finance2";
import { DateTime } from "luxon";
import { NY } from "./calendar";
import { retry, spaced } from "./limiter";
import { cached } from "./cache";
import type { Bar, EarningsDate, Quote } from "./types";

export const SPX_SYMBOL = "^GSPC";

let client: InstanceType<typeof YahooFinance> | null = null;
function yf() {
  client ??= new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
  return client;
}

const HOST = "yahoo";
const GAP_MS = 250;

export async function getDailyBars(symbol: string, days = 30): Promise<Bar[]> {
  const period2 = DateTime.now().setZone(NY).plus({ days: 1 }).startOf("day");
  const period1 = period2.minus({ days: Math.max(days, 7) + 10 });
  const key = `yahoo:chart:${symbol}:${period2.toISODate()}:${days}`;
  return cached(key, 60 * 15, async () => {
    const res = await spaced(HOST, GAP_MS, () =>
      retry(() =>
        yf().chart(symbol, { period1: period1.toJSDate(), period2: period2.toJSDate(), interval: "1d" }),
      ),
    );
    const bars: Bar[] = [];
    for (const q of res.quotes ?? []) {
      if (q.close === null || q.close === undefined) continue;
      const date = DateTime.fromJSDate(q.date).setZone(NY).toISODate()!;
      bars.push({ date, close: q.close, open: q.open ?? undefined, high: q.high ?? undefined, low: q.low ?? undefined, volume: q.volume ?? undefined });
    }
    return bars.slice(-days);
  });
}

export async function getQuote(symbol: string): Promise<Quote> {
  return cached(`yahoo:quote:${symbol}`, 60, async () => {
    const q = await spaced(HOST, GAP_MS, () => retry(() => yf().quote(symbol)));
    if (!q || q.regularMarketPrice === undefined) throw new Error(`No quote for ${symbol}`);
    return {
      symbol: q.symbol,
      name: q.longName ?? q.shortName,
      price: q.regularMarketPrice,
      previousClose: q.regularMarketPreviousClose,
      changePct: q.regularMarketChangePercent,
      marketState: q.marketState,
      asOf: (q.regularMarketTime instanceof Date ? q.regularMarketTime : new Date()).toISOString(),
      currency: q.currency,
      marketCap: q.marketCap,
      exchange: q.fullExchangeName,
    };
  });
}

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  if (!symbols.length) return out;
  const res = await spaced(HOST, GAP_MS, () => retry(() => yf().quote(symbols)));
  for (const q of res) {
    if (q.regularMarketPrice === undefined) continue;
    out[q.symbol] = {
      symbol: q.symbol,
      name: q.longName ?? q.shortName,
      price: q.regularMarketPrice,
      previousClose: q.regularMarketPreviousClose,
      changePct: q.regularMarketChangePercent,
      marketState: q.marketState,
      asOf: (q.regularMarketTime instanceof Date ? q.regularMarketTime : new Date()).toISOString(),
      currency: q.currency,
      marketCap: q.marketCap,
      exchange: q.fullExchangeName,
    };
  }
  return out;
}

export async function lookupCompany(symbol: string): Promise<{ symbol: string; name: string } | null> {
  try {
    const q = await spaced(HOST, GAP_MS, () => retry(() => yf().quote(symbol)));
    if (!q) return null;
    return { symbol: q.symbol, name: q.longName ?? q.shortName ?? q.symbol };
  } catch {
    return null;
  }
}

export async function getEarningsDate(symbol: string): Promise<EarningsDate | null> {
  return cached(`yahoo:earnings:${symbol}`, 60 * 60 * 6, async () => {
    const res = await spaced(HOST, GAP_MS, () => retry(() => yf().quoteSummary(symbol, { modules: ["calendarEvents"] })));
    const e = res.calendarEvents?.earnings;
    const dates = (e?.earningsDate ?? []) as Date[];
    if (!dates.length) return null;
    const date = DateTime.fromJSDate(dates[0]).setZone(NY).toISODate()!;
    const ev = e as unknown as { isEarningsDateEstimate?: boolean; earningsAverage?: number; revenueAverage?: number };
    return {
      date,
      isEstimate: ev.isEarningsDateEstimate ?? true,
      epsEstimate: ev.earningsAverage,
      revenueEstimate: ev.revenueAverage,
      sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,
    };
  });
}
