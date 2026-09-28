import YahooFinance from "yahoo-finance2";
import { DateTime } from "luxon";
import { NY } from "./calendar";
import { retry, spaced } from "./limiter";
import { cached, readCached, storeCached } from "./cache";
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
  const unique = [...new Set(symbols)].sort();
  if (!unique.length) return {};
  // Every Today and team page view used to be a live Yahoo call. A short shared cache lets all renders in the
  // same minute, on any warm instance via the DB layer, reuse one; the quotes are delayed anyway.
  return cached(`yahoo:quotes:${unique.join(",")}`, 60, async () => {
    const out: Record<string, Quote> = {};
    const res = await spaced(HOST, GAP_MS, () => retry(() => yf().quote(unique)));
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
  });
}

/** A security's type never changes, so each answer is kept a month; an unknown symbol is asked about again the next day. */
const QUOTE_TYPE_TTL = 60 * 60 * 24 * 30;
const QUOTE_TYPE_DOWN = "yahoo:quote-type:down";

/**
 * Yahoo's quote type per symbol ("EQUITY", "ETF", "MUTUALFUND", …), or null when Yahoo has no quote for it. Cached per
 * symbol, so only symbols never seen before cost a call, and those share one batch.
 */
export async function getQuoteTypes(symbols: string[]): Promise<Record<string, string | null>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out: Record<string, string | null> = {};
  const hits = await Promise.all(unique.map((s) => readCached<{ type: string | null }>(`yahoo:quote-type:${s}`)));
  const missing = unique.filter((s, i) => {
    if (hits[i]) out[s] = hits[i]!.type;
    return !hits[i];
  });
  if (!missing.length) return out;
  // After a failure, pages don't wait out Yahoo's retries again for a few minutes.
  if (await readCached(QUOTE_TYPE_DOWN, { db: false })) throw new Error("Yahoo quote types failed recently");
  let res;
  try {
    res = await spaced(HOST, GAP_MS, () => yf().quote(missing));
  } catch (e) {
    await storeCached(QUOTE_TYPE_DOWN, 5 * 60, true, { db: false });
    throw e;
  }
  const found = new Map(res.map((q) => [q.symbol.toUpperCase(), q.quoteType ?? null]));
  await Promise.all(
    missing.map((s) => {
      const type = found.get(s) ?? null;
      out[s] = type;
      return storeCached(`yahoo:quote-type:${s}`, type ? QUOTE_TYPE_TTL : 60 * 60 * 24, { type });
    }),
  );
  return out;
}

/**
 * Company name for a symbol. Returns null only when Yahoo has no quote for it; provider failures throw,
 * so callers can tell an unknown ticker from an outage. Names rarely change, so a day's cache is safe.
 */
export async function resolveCompany(symbol: string): Promise<{ symbol: string; name: string } | null> {
  return cached(`yahoo:company:${symbol}`, 60 * 60 * 24, async () => {
    const q = await spaced(HOST, GAP_MS, () => retry(() => yf().quote(symbol)));
    if (!q) return null;
    return { symbol: q.symbol, name: q.longName ?? q.shortName ?? q.symbol };
  });
}

export async function lookupCompany(symbol: string): Promise<{ symbol: string; name: string } | null> {
  try {
    return await resolveCompany(symbol);
  } catch {
    return null;
  }
}

export async function getEarningsDate(symbol: string): Promise<EarningsDate | null> {
  return cached(`yahoo:earnings:v2:${symbol}`, 60 * 60 * 6, async () => {
    const res = await spaced(HOST, GAP_MS, () => retry(() => yf().quoteSummary(symbol, { modules: ["calendarEvents", "earningsTrend"] })));
    const e = res.calendarEvents?.earnings;
    const dates = (e?.earningsDate ?? []) as Date[];
    if (!dates.length) return null;
    const date = DateTime.fromJSDate(dates[0]).setZone(NY).toISODate()!;
    const ev = e as unknown as { isEarningsDateEstimate?: boolean; earningsAverage?: number; revenueAverage?: number };
    // calendarEvents carries no currency; the trend rows name it per figure, and it is the same for every period.
    const trend = (res.earningsTrend?.trend ?? []) as unknown as { earningsEstimate?: { earningsCurrency?: string }; revenueEstimate?: { revenueCurrency?: string } }[];
    return {
      date,
      isEstimate: ev.isEarningsDateEstimate ?? true,
      epsEstimate: ev.earningsAverage,
      revenueEstimate: ev.revenueAverage,
      epsCurrency: trend.find((t) => t.earningsEstimate?.earningsCurrency)?.earningsEstimate?.earningsCurrency,
      revenueCurrency: trend.find((t) => t.revenueEstimate?.revenueCurrency)?.revenueEstimate?.revenueCurrency,
      sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,
    };
  });
}

/**
 * Five-minute closes for one session (regular hours only), as UTC ISO times. Cached five minutes while the session can
 * still move and a day once it is over, in the shared cache so every viewer of the Daily page reuses one fetch.
 */
export async function getIntradayBars(symbol: string, session: string, over: boolean): Promise<{ t: string; close: number }[]> {
  const open = DateTime.fromISO(session, { zone: NY }).set({ hour: 9, minute: 30 });
  return cached(`yahoo:intraday:5m:${symbol}:${session}:${over ? "final" : "live"}`, over ? 60 * 60 * 24 : 60 * 5, async () => {
    const res = await spaced(HOST, GAP_MS, () =>
      retry(() => yf().chart(symbol, { period1: open.toJSDate(), period2: open.set({ hour: 16, minute: 30 }).toJSDate(), interval: "5m", includePrePost: false })),
    );
    return (res.quotes ?? [])
      .filter((q) => q.close !== null && q.close !== undefined && DateTime.fromJSDate(q.date).setZone(NY).toISODate() === session)
      // A bar is stamped at its start; its close is the price five minutes later.
      .map((q) => ({ t: new Date(Math.min(q.date.getTime() + 5 * 60_000, Date.now())).toISOString(), close: q.close as number }));
  });
}

export type BarsRange = {
  bars: { date: string; close: number }[];
  dividends: { date: string; amount: number }[];
  splits: { date: string; ratio: number }[];
  /** Yahoo's first trade date for the symbol, when it reports one: history cannot start earlier. */
  firstTrade?: string | null;
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
        firstTrade: res.meta?.firstTradeDate ? iso(new Date(res.meta.firstTradeDate)) : null,
      };
    },
    { db: false },
  );
}

/** Dividend- and split-adjusted daily closes for total-return backtesting. Never fall back to raw close. */
export async function getAdjustedBarsRange(symbol: string, from: string, to: string): Promise<{ date: string; close: number }[]> {
  return cached(`yahoo:backtest-adjusted:v1:${symbol}:${from}:${to}`, 60 * 15, async () => {
    let res;
    try {
      res = await spaced(HOST, GAP_MS, () => retry(() => yf().chart(symbol, {
        period1: DateTime.fromISO(from, { zone: NY }).startOf("day").toJSDate(),
        period2: DateTime.fromISO(to, { zone: NY }).plus({ days: 1 }).startOf("day").toJSDate(),
        interval: "1d",
      })));
    } catch (error) {
      // Yahoo rejects ranges entirely before a listing instead of returning zero quotes.
      // Confirm the symbol still has current USD history and that its first trade is after
      // this range. Other failures remain errors so bad data is never silently cash.
      if (!/Data doesn't exist for startDate|No data found/i.test(String(error))) throw error;
      const recentEnd = DateTime.now().setZone(NY).minus({ days: 1 }).startOf("day");
      const probe = await spaced(HOST, GAP_MS, () => retry(() => yf().chart(symbol, {
        period1: recentEnd.minus({ days: 30 }).toJSDate(),
        period2: recentEnd.plus({ days: 1 }).toJSDate(),
        interval: "1d",
      })));
      const firstTrade = probe.meta.firstTradeDate
        ? DateTime.fromJSDate(new Date(probe.meta.firstTradeDate)).setZone(NY).toISODate()
        : null;
      if (probe.meta.currency !== "USD" || !probe.quotes?.length || !firstTrade || firstTrade <= to)
        throw error;
      return [];
    }
    if (res.meta.currency !== "USD") throw new Error("Backtesting requires USD-denominated history.");
    // Yahoo emits the occasional all-null row; drop it like getBarsRange does. The engine refuses to fill
    // gaps, so a dropped session still fails the replay if it is needed. Present but unusable values throw.
    const bars: { date: string; close: number }[] = [];
    for (const q of res.quotes ?? []) {
      if (q.adjclose == null) continue;
      if (!Number.isFinite(q.adjclose) || q.adjclose <= 0) throw new Error(`Invalid adjusted close for ${symbol}`);
      bars.push({ date: DateTime.fromJSDate(q.date).setZone(NY).toISODate()!, close: q.adjclose });
    }
    // The engine treats history that starts late as pre-listing cash, so only return a late or empty
    // series when Yahoo's first trade date confirms the listing came after the requested start.
    const near = (a: string, b: string) => DateTime.fromISO(b).diff(DateTime.fromISO(a), "days").days <= 7;
    if (!bars.length || !near(from, bars[0].date)) {
      const firstTrade = res.meta.firstTradeDate
        ? DateTime.fromJSDate(new Date(res.meta.firstTradeDate)).setZone(NY).toISODate()
        : null;
      const listedLater = firstTrade && firstTrade > from && (bars.length ? near(firstTrade, bars[0].date) : firstTrade > to);
      if (!listedLater) throw new Error(`Adjusted history for ${symbol} starts late without a later listing date.`);
    }
    return bars;
  });
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

export type InstitutionalHolder = { organization: string; pctHeld: number | null; shares: number | null; value: number | null; reportDate: string | null };
export type HoldersSnapshot = { insidersPctHeld: number | null; institutionsPctHeld: number | null; institutionsCount: number | null; top: InstitutionalHolder[] };

/** Ownership breakdown and the largest institutional holders Yahoo lists (13F-derived, typically quarterly). */
export async function getHolders(symbol: string): Promise<HoldersSnapshot> {
  return cached(`yahoo:holders:${symbol}`, 60 * 60 * 24, async () => {
    const res = (await spaced(HOST, GAP_MS, () => retry(() => yf().quoteSummary(symbol, { modules: ["majorHoldersBreakdown", "institutionOwnership"] }), 2))) as {
      majorHoldersBreakdown?: { insidersPercentHeld?: number; institutionsPercentHeld?: number; institutionsCount?: number };
      institutionOwnership?: { ownershipList?: { organization?: string; pctHeld?: number; position?: number; value?: number; reportDate?: Date | string }[] };
    };
    const pct = (v: number | undefined) => (typeof v === "number" ? +(v * 100).toFixed(2) : null);
    const b = res.majorHoldersBreakdown;
    return {
      insidersPctHeld: pct(b?.insidersPercentHeld),
      institutionsPctHeld: pct(b?.institutionsPercentHeld),
      institutionsCount: b?.institutionsCount ?? null,
      top: (res.institutionOwnership?.ownershipList ?? []).slice(0, 10).map((o) => ({
        organization: o.organization ?? "Unknown",
        pctHeld: pct(o.pctHeld),
        shares: o.position ?? null,
        value: o.value ?? null,
        reportDate: o.reportDate ? new Date(o.reportDate).toISOString().slice(0, 10) : null,
      })),
    };
  });
}

/** `currency` is the ISO code of each figure (TSM: EPS per ADR in USD, revenue in TWD), null when Yahoo omits it. */
export type EstimateRow = { period: string; endDate: string | null; eps: { avg: number | null; low: number | null; high: number | null; analysts: number | null; yearAgo: number | null; growthPct: number | null; currency: string | null }; revenue: { avg: number | null; low: number | null; high: number | null; analysts: number | null; growthPct: number | null; currency: string | null } };
export type EstimatesSnapshot = { trend: EstimateRow[]; recommendations: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[]; targetMeanPrice: number | null; targetLowPrice: number | null; targetHighPrice: number | null; analystCount: number | null };

/** Consensus EPS and revenue estimates by period plus the recommendation mix, as Yahoo aggregates them. */
export async function getEstimates(symbol: string): Promise<EstimatesSnapshot> {
  return cached(`yahoo:estimates:v2:${symbol}`, 60 * 60 * 12, async () => {
    const res = (await spaced(HOST, GAP_MS, () => retry(() => yf().quoteSummary(symbol, { modules: ["earningsTrend", "recommendationTrend", "financialData"] }), 2))) as {
      earningsTrend?: { trend?: { period?: string; endDate?: Date | string | null; earningsEstimate?: Record<string, unknown>; revenueEstimate?: Record<string, unknown> }[] };
      recommendationTrend?: { trend?: { period?: string; strongBuy?: number; buy?: number; hold?: number; sell?: number; strongSell?: number }[] };
      financialData?: { targetMeanPrice?: number; targetLowPrice?: number; targetHighPrice?: number; numberOfAnalystOpinions?: number };
    };
    const n = (v: unknown) => (typeof v === "number" ? v : null);
    const pct = (v: unknown) => (typeof v === "number" ? +(v * 100).toFixed(1) : null);
    const code = (v: unknown) => (typeof v === "string" && v ? v : null);
    const trend = (res.earningsTrend?.trend ?? [])
      .filter((t) => t.period && ["0q", "+1q", "0y", "+1y"].includes(t.period))
      .map((t) => ({
        period: ({ "0q": "current quarter", "+1q": "next quarter", "0y": "current fiscal year", "+1y": "next fiscal year" } as Record<string, string>)[t.period!] ?? t.period!,
        endDate: t.endDate ? new Date(t.endDate).toISOString().slice(0, 10) : null,
        eps: { avg: n(t.earningsEstimate?.avg), low: n(t.earningsEstimate?.low), high: n(t.earningsEstimate?.high), analysts: n(t.earningsEstimate?.numberOfAnalysts), yearAgo: n(t.earningsEstimate?.yearAgoEps), growthPct: pct(t.earningsEstimate?.growth), currency: code(t.earningsEstimate?.earningsCurrency) },
        revenue: { avg: n(t.revenueEstimate?.avg), low: n(t.revenueEstimate?.low), high: n(t.revenueEstimate?.high), analysts: n(t.revenueEstimate?.numberOfAnalysts), growthPct: pct(t.revenueEstimate?.growth), currency: code(t.revenueEstimate?.revenueCurrency) },
      }));
    const recommendations = (res.recommendationTrend?.trend ?? []).slice(0, 2).map((r) => ({ period: r.period === "0m" ? "current" : r.period === "-1m" ? "one month ago" : (r.period ?? "?"), strongBuy: r.strongBuy ?? 0, buy: r.buy ?? 0, hold: r.hold ?? 0, sell: r.sell ?? 0, strongSell: r.strongSell ?? 0 }));
    const f = res.financialData;
    return { trend, recommendations, targetMeanPrice: n(f?.targetMeanPrice), targetLowPrice: n(f?.targetLowPrice), targetHighPrice: n(f?.targetHighPrice), analystCount: n(f?.numberOfAnalystOpinions) };
  });
}
