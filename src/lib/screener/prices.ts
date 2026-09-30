/*
 * Prices for the whole-market screen. No free bulk source is wired yet, so Yahoo is read one ticker at a time inside
 * the resumable job; everything goes through BulkPriceSource so a bulk source (Stooq's daily files) can replace it.
 *
 * The screen needs only two things per company: today's price and market cap (for the $3B floor and EV), and the
 * price at each fiscal year end for six years (EV/EBIT against its own five-year median). So a source returns
 * month-end closes, not daily bars, and they are stored per ticker as a few dozen numbers.
 *
 * Month-end closes are on today's share basis (Yahoo adjusts closes for later splits, not for dividends), and the
 * split history comes with them, so the screen can put each year's reported share count on the same basis
 * (adjustForSplits in line-items.ts) before multiplying the two.
 */

export type LiveQuote = { price: number; marketCap: number | null; currency: string | null; quoteType: string | null };

/** "YYYY-MM" → the last close of that month, adjusted for later splits. */
export type MonthEndCloses = Record<string, number>;

export type PriceHistory = { closes: MonthEndCloses; splits: { date: string; ratio: number }[] };

export interface BulkPriceSource {
  readonly name: string;
  /** Today's price and market cap for many symbols at once; symbols the source doesn't know are left out. */
  quotes(symbols: string[]): Promise<Record<string, LiveQuote>>;
  /** Month-end closes since `from` (YYYY-MM-DD) and the splits in that time; null when the source has no history. */
  monthEndCloses(symbol: string, from: string): Promise<PriceHistory | null>;
}

/** The last close in each month. */
export function monthEndCloses(bars: { date: string; close: number }[]): MonthEndCloses {
  const sorted = [...bars].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: MonthEndCloses = {};
  for (const b of sorted) if (Number.isFinite(b.close) && b.close > 0) out[b.date.slice(0, 7)] = +b.close.toFixed(4);
  return out;
}

/** The close for the month a fiscal year ended in, else the month before (a 52/53-week year can end on the 1st–3rd). */
export function priceAtYearEnd(closes: MonthEndCloses | null | undefined, end: string): number | null {
  if (!closes) return null;
  const month = end.slice(0, 7);
  if (closes[month] !== undefined) return closes[month];
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return closes[d.toISOString().slice(0, 7)] ?? null;
}

/** Yahoo symbols use "-" for share classes where SEC's file uses "." or "-" (BRK.B / BRK-B). */
export function yahooSymbol(ticker: string) {
  return ticker.toUpperCase().replace(/\./g, "-");
}

type ChartResult = { quotes?: { date: Date | string; close?: number | null }[]; events?: { splits?: { date: Date | string; numerator: number; denominator: number }[] } };

const GAP_MS = 400; // Gentler than the app's 250 ms: a run reads a couple of thousand symbols.

/** Yahoo through yahoo-finance2, sharing the app's per-host Yahoo queue. */
export function yahooBulkSource(): BulkPriceSource {
  const client = async () => {
    const { default: YahooFinance } = await import("yahoo-finance2");
    return new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
  };
  let yf: Awaited<ReturnType<typeof client>> | null = null;
  const get = async () => (yf ??= await client());
  const paced = async <T>(fn: () => Promise<T>) => {
    const { retry, spaced } = await import("@/lib/providers/limiter");
    return spaced("yahoo", GAP_MS, () => retry(fn, 3, 1000));
  };

  return {
    name: "yahoo",
    async quotes(symbols) {
      const out: Record<string, LiveQuote> = {};
      if (!symbols.length) return out;
      const y = await get();
      const run = async (batch: string[]) => {
        const res = await paced(() => y.quote(batch, {}, { validateResult: false }));
        for (const q of res as { symbol: string; regularMarketPrice?: number; marketCap?: number; currency?: string; quoteType?: string }[]) {
          if (typeof q.regularMarketPrice !== "number") continue;
          out[q.symbol.toUpperCase()] = { price: q.regularMarketPrice, marketCap: q.marketCap ?? null, currency: q.currency ?? null, quoteType: q.quoteType ?? null };
        }
      };
      try {
        await run(symbols);
      } catch {
        // One bad symbol can fail a batch; retry in small pieces and give up only on the pieces that still fail.
        for (let i = 0; i < symbols.length; i += 10) await run(symbols.slice(i, i + 10)).catch(() => undefined);
      }
      return out;
    },
    async monthEndCloses(symbol, from) {
      const y = await get();
      try {
        const res = (await paced(() => y.chart(symbol, { period1: new Date(`${from}T00:00:00Z`), period2: new Date(), interval: "1d", events: "split" }, { validateResult: false }))) as ChartResult;
        const iso = (d: Date | string | number) => new Date(d).toISOString().slice(0, 10);
        const bars = (res.quotes ?? []).filter((q) => typeof q.close === "number").map((q) => ({ date: iso(q.date), close: q.close as number }));
        if (!bars.length) return null;
        const splits = (res.events?.splits ?? []).filter((s) => s.denominator > 0).map((s) => ({ date: iso(s.date), ratio: s.numerator / s.denominator }));
        return { closes: monthEndCloses(bars), splits };
      } catch (e) {
        if (/No data found|Not Found|delisted|doesn't exist/i.test(String(e))) return null;
        throw e;
      }
    },
  };
}
