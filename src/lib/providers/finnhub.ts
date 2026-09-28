import { DateTime } from "luxon";
import { cached } from "./cache";
import { retry, spaced } from "./limiter";
import type { EarningsDate, NewsItem } from "./types";

const HOST = "finnhub";
const GAP_MS = 1100; // free tier: 60/min

export function finnhubConfigured() {
  return Boolean(process.env.FINNHUB_API_KEY);
}

async function fh<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("FINNHUB_API_KEY is not configured");
  const qs = new URLSearchParams({ ...params, token: key });
  return spaced(HOST, GAP_MS, () =>
    retry(async () => {
      const res = await fetch(`https://finnhub.io/api/v1${path}?${qs}`);
      if (res.status === 429) throw new Error("Finnhub rate limited");
      if (!res.ok) throw new Error(`Finnhub ${res.status} for ${path}`);
      return (await res.json()) as T;
    }),
  );
}

type FhNews = { id: number; headline: string; summary: string; url: string; source: string; datetime: number };

export async function getCompanyNews(symbol: string, fromISO: string, toISO: string): Promise<NewsItem[]> {
  if (!finnhubConfigured()) return [];
  return cached(`finnhub:news:${symbol}:${fromISO}:${toISO}`, 60 * 30, async () => {
    const rows = await fh<FhNews[]>("/company-news", { symbol, from: fromISO, to: toISO });
    const seen = new Set<number>();
    const out: NewsItem[] = [];
    for (const r of rows) {
      if (seen.has(r.id) || !r.url) continue;
      seen.add(r.id);
      out.push({ id: String(r.id), headline: r.headline, summary: r.summary, url: r.url, source: r.source, publishedAt: new Date(r.datetime * 1000).toISOString() });
    }
    return out.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)).slice(0, 40);
  });
}

type FhEarnings = { earningsCalendar: { date: string; hour: string; epsEstimate: number | null; revenueEstimate: number | null; quarter: number; year: number; symbol: string }[] };

export async function getEarningsCalendar(symbol: string): Promise<EarningsDate[]> {
  if (!finnhubConfigured()) return [];
  const from = DateTime.now().minus({ days: 120 }).toISODate()!;
  const to = DateTime.now().plus({ days: 120 }).toISODate()!;
  return cached(`finnhub:earnings:v2:${symbol}:${from}`, 60 * 60 * 6, async () => {
    const res = await fh<FhEarnings>("/calendar/earnings", { symbol, from, to });
    const rows = res.earningsCalendar ?? [];
    // The calendar names no currency, and Finnhub may answer for the home listing (TSM comes back as 2330.TW,
    // in TWD per local share). The profile says which currency its estimates are in.
    const currency = rows.some((e) => e.epsEstimate != null || e.revenueEstimate != null)
      ? await fh<{ estimateCurrency?: string }>("/stock/profile2", { symbol }).then((p) => p.estimateCurrency || undefined, () => undefined)
      : undefined;
    return rows
      .map((e) => ({
        date: e.date,
        hour: e.hour || undefined,
        isEstimate: true,
        epsEstimate: e.epsEstimate ?? undefined,
        revenueEstimate: e.revenueEstimate ?? undefined,
        epsCurrency: currency,
        revenueCurrency: currency,
        fiscalPeriod: e.year && e.quarter ? `Q${e.quarter} FY${e.year}` : undefined,
        sourceUrl: "https://finnhub.io/",
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  });
}

/**
 * Every earnings event Finnhub lists in a date range, keyed by symbol. Empty when Finnhub is off. The estimates carry
 * no currency (a profile call per symbol is too many); the sector bellwethers that use them are S&P 500 names, in USD.
 */
export async function getEarningsCalendarRange(fromISO: string, toISO: string): Promise<Map<string, EarningsDate[]>> {
  if (!finnhubConfigured()) return new Map();
  const rows = await cached(
    `finnhub:earnings-range:${fromISO}:${toISO}`,
    60 * 60 * 6,
    async () => {
      const res = await fh<FhEarnings>("/calendar/earnings", { from: fromISO, to: toISO });
      return (res.earningsCalendar ?? []).map((e) => ({
        symbol: e.symbol,
        date: e.date,
        hour: e.hour || undefined,
        isEstimate: true,
        epsEstimate: e.epsEstimate ?? undefined,
        revenueEstimate: e.revenueEstimate ?? undefined,
        fiscalPeriod: e.year && e.quarter ? `Q${e.quarter} FY${e.year}` : undefined,
        sourceUrl: "https://finnhub.io/",
      }));
    },
    { db: false },
  );
  const out = new Map<string, EarningsDate[]>();
  for (const { symbol, ...e } of rows) {
    if (!symbol) continue;
    out.set(symbol, [...(out.get(symbol) ?? []), e]);
  }
  for (const list of out.values()) list.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}
