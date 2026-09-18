import { and, eq, inArray, max, min, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DateTime } from "luxon";
import * as schema from "@/db/schema";
import { dailyCloses, securityEvents } from "@/db/schema";
import { getBarsRange } from "@/lib/providers/yahoo";

// Passed in rather than imported so scripts can run these with their own connection.
export type Db = PostgresJsDatabase<typeof schema>;

const BATCH = 500;

export async function upsertCloses(db: Db, ticker: string, bars: { date: string; close: number }[]) {
  for (let i = 0; i < bars.length; i += BATCH) {
    await db
      .insert(dailyCloses)
      .values(bars.slice(i, i + BATCH).map((b) => ({ ticker, sessionDate: b.date, close: b.close.toString(), source: "yahoo" })))
      .onConflictDoUpdate({ target: [dailyCloses.ticker, dailyCloses.sessionDate], set: { close: sql`excluded.close`, fetchedAt: new Date() } });
  }
}

export async function upsertEvents(db: Db, ticker: string, ev: { dividends: { date: string; amount: number }[]; splits: { date: string; ratio: number }[] }) {
  const rows = [
    ...ev.dividends.map((d) => ({ ticker, exDate: d.date, kind: "dividend" as const, amount: d.amount.toString(), ratio: null })),
    ...ev.splits.map((s) => ({ ticker, exDate: s.date, kind: "split" as const, amount: null, ratio: s.ratio.toString() })),
  ];
  if (!rows.length) return;
  await db
    .insert(securityEvents)
    .values(rows)
    .onConflictDoUpdate({
      target: [securityEvents.ticker, securityEvents.exDate, securityEvents.kind],
      set: { amount: sql`excluded.amount`, ratio: sql`excluded.ratio`, fetchedAt: new Date() },
    });
}

export type SyncPricesResult = { updated: string[]; failed: Record<string, string>; remaining: string[] };

/**
 * Bring closes and dividend/split events up to date for each symbol, back to `from`.
 * One provider call per symbol: a full backfill when history is short, otherwise a one-week
 * top-up. A newly seen split forces a full refetch because Yahoo restates earlier closes.
 */
export async function syncPrices(
  db: Db,
  opts: { symbols: string[]; from: string; budgetMs?: number; onProgress?: (e: { symbol: string; i: number; n: number; bars?: number; error?: string }) => void },
): Promise<SyncPricesResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 240_000;
  const result: SyncPricesResult = { updated: [], failed: {}, remaining: [] };
  const symbols = [...new Set(opts.symbols)];
  if (!symbols.length) return result;

  const have = await db
    .select({ ticker: dailyCloses.ticker, first: min(dailyCloses.sessionDate), last: max(dailyCloses.sessionDate) })
    .from(dailyCloses)
    .where(inArray(dailyCloses.ticker, symbols))
    .groupBy(dailyCloses.ticker);
  const coverage = new Map(have.map((r) => [r.ticker, r]));
  const slack = DateTime.fromISO(opts.from).plus({ days: 5 }).toISODate()!;

  for (const [i, symbol] of symbols.entries()) {
    if (Date.now() - started > budget) {
      result.remaining = symbols.slice(i);
      break;
    }
    try {
      const c = coverage.get(symbol);
      const covered = c?.first && c.last && c.first <= slack;
      const since = covered ? DateTime.fromISO(c.last!).minus({ days: 7 }).toISODate()! : opts.from;
      let range = await getBarsRange(symbol, since);
      if (covered && range.splits.length) {
        const known = await db
          .select({ exDate: securityEvents.exDate })
          .from(securityEvents)
          .where(and(eq(securityEvents.ticker, symbol), eq(securityEvents.kind, "split")));
        const seen = new Set(known.map((k) => k.exDate));
        if (range.splits.some((s) => !seen.has(s.date))) range = await getBarsRange(symbol, opts.from);
      }
      await upsertCloses(db, symbol, range.bars);
      await upsertEvents(db, symbol, range);
      result.updated.push(symbol);
      opts.onProgress?.({ symbol, i: i + 1, n: symbols.length, bars: range.bars.length });
    } catch (e) {
      result.failed[symbol] = e instanceof Error ? e.message : String(e);
      opts.onProgress?.({ symbol, i: i + 1, n: symbols.length, error: result.failed[symbol] });
    }
  }
  return result;
}
