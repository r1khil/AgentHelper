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

export type BarsRange = {
  bars: { date: string; close: number }[];
  dividends: { date: string; amount: number }[];
  splits: { date: string; ratio: number }[];
};

/**
 * Daily closes plus dividend and split events between two dates (inclusive). Closes are
 * split-adjusted but not dividend-adjusted. Today's bar is left out until the session has closed.
 */
export async function getBarsRange(symbol: string, from: string, to?: string): Promise<BarsRange> {
  const now = DateTime.now().setZone(NY);
  const end = to ?? now.toISODate()!;
  const period1 = DateTime.fromISO(from, { zone: NY }).startOf("day");
  const period2 = DateTime.fromISO(end, { zone: NY }).plus({ days: 1 }).startOf("day");
  const sessionOpen = now.hour < 16 || (now.hour === 16 && now.minute < 15) ? now.toISODate()! : null;
  return cached(
    `yahoo:range:${symbol}:${from}:${end}`,
    60 * 10,
    async () => {
      const res = await spaced(HOST, GAP_MS, () =>
        retry(() => yf().chart(symbol, { period1: period1.toJSDate(), period2: period2.toJSDate(), interval: "1d", events: "div|split" })),
      );
      const iso = (d: Date) => DateTime.fromJSDate(d).setZone(NY).toISODate()!;
      const bars: BarsRange["bars"] = [];
      for (const q of res.quotes ?? []) {
        if (q.close === null || q.close === undefined) continue;
        const date = iso(q.date);
        if (date === sessionOpen) continue;
        bars.push({ date, close: q.close });
      }
      return {
        bars,
        dividends: (res.events?.dividends ?? []).map((d) => ({ date: iso(d.date), amount: d.amount })),
        splits: (res.events?.splits ?? []).filter((s) => s.denominator > 0).map((s) => ({ date: iso(s.date), ratio: s.numerator / s.denominator })),
      };
    },
    { db: false },
  );
}

export type SectorProfile = { sector: string | null; industry: string | null };

/** Yahoo's sector and industry labels for a company; both null for ETFs and funds. */
export async function getSectorProfile(symbol: string): Promise<SectorProfile> {
  return cached(`yahoo:profile:${symbol}`, 60 * 60 * 24 * 7, async () => {
    try {
      const res = await spaced(HOST, GAP_MS, () => retry(() => yf().quoteSummary(symbol, { modules: ["assetProfile"] }), 2));
      return { sector: res.assetProfile?.sector ?? null, industry: res.assetProfile?.industry ?? null };
    } catch {
      return { sector: null, industry: null };
    }
  });
}

export type FundHolding = { symbol: string; name: string; weightPct: number };

/** Top constituents of a fund as Yahoo reports them (usually ten), heaviest first. */
export async function getFundTopHoldings(symbol: string): Promise<FundHolding[]> {
  return cached(`yahoo:topholdings:${symbol}`, 60 * 60 * 24 * 7, async () => {
    const res = await spaced(HOST, GAP_MS, () => retry(() => yf().quoteSummary(symbol, { modules: ["topHoldings"] })));
    const out: FundHolding[] = [];
    for (const h of res.topHoldings?.holdings ?? []) {
      if (!h.symbol) continue;
      out.push({ symbol: h.symbol, name: h.holdingName || h.symbol, weightPct: (h.holdingPercent ?? 0) * 100 });
    }
    return out.sort((a, b) => b.weightPct - a.weightPct);
  });
}

/** Sector weights of a fund as Yahoo reports them (Morningstar sector names), in percent. */
export async function getFundSectorWeights(symbol: string): Promise<Record<string, number>> {
  return cached(`yahoo:sectorweights:${symbol}`, 60 * 60 * 12, async () => {
    const res = await spaced(HOST, GAP_MS, () => retry(() => yf().quoteSummary(symbol, { modules: ["topHoldings"] })));
    const out: Record<string, number> = {};
    for (const row of res.topHoldings?.sectorWeightings ?? []) {
      for (const [k, v] of Object.entries(row)) if (typeof v === "number") out[k] = v * 100;
    }
    return out;
  });
}
