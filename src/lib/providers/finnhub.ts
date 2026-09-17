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
  return cached(`finnhub:earnings:${symbol}:${from}`, 60 * 60 * 6, async () => {
    const res = await fh<FhEarnings>("/calendar/earnings", { symbol, from, to });
    return (res.earningsCalendar ?? [])
      .map((e) => ({
        date: e.date,
        hour: e.hour || undefined,
        isEstimate: true,
        epsEstimate: e.epsEstimate ?? undefined,
        revenueEstimate: e.revenueEstimate ?? undefined,
        fiscalPeriod: e.year && e.quarter ? `Q${e.quarter} FY${e.year}` : undefined,
        sourceUrl: "https://finnhub.io/",
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  });
}
