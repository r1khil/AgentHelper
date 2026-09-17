import "server-only";
import { getQuotes, SPX_SYMBOL } from "@/lib/providers/yahoo";
import type { Quote } from "@/lib/providers/types";

export type MarketRow = { quote?: Quote; relativePp?: number; error?: string };

/** Live quotes for tickers plus the day's move relative to the S&P 500, in percentage points. */
export async function marketSnapshot(tickers: string[]): Promise<{ rows: Record<string, MarketRow>; spx?: Quote; error?: string }> {
  if (!tickers.length) return { rows: {} };
  try {
    const quotes = await getQuotes([...new Set([...tickers, SPX_SYMBOL])]);
    const spx = quotes[SPX_SYMBOL];
    const rows: Record<string, MarketRow> = {};
    for (const t of tickers) {
      const q = quotes[t];
      if (!q) {
        rows[t] = { error: "No quote" };
        continue;
      }
      const rel = q.changePct !== undefined && spx?.changePct !== undefined ? q.changePct - spx.changePct : undefined;
      rows[t] = { quote: q, relativePp: rel };
    }
    return { rows, spx };
  } catch (e) {
    return { rows: {}, error: e instanceof Error ? e.message : "Market data unavailable" };
  }
}
