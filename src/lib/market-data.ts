import { count, inArray, max } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { dailyCloses, securityEvents } from "@/db/schema";
import type { Db } from "@/lib/prices";

/**
 * Stored closes and corporate actions, through Next's data cache. Every performance, risk and exposure view used to
 * re-read each symbol's whole history from Postgres (tens of millions of rows a month, most of Supabase's egress).
 *
 * Entries are per ticker so any symbol list reuses them. The key carries a version (latest fetched_at and row count of
 * both tables), read with one tiny query per load: a price sync, backfill or correction through `upsertCloses` /
 * `upsertEvents` changes it, so nobody sees stale closes and nothing needs to invalidate a tag. `REVALIDATE_S` backs
 * that up for hand edits in SQL that leave fetched_at alone.
 *
 * Outside a Next server (scripts, tests) there is no data cache, so these read Postgres directly with the caller's db.
 */

const REVALIDATE_S = 6 * 60 * 60;

export type CloseRow = { ticker: string; date: string; close: string };
export type EventRow = { ticker: string; date: string; kind: "dividend" | "split"; amount: string | null; ratio: string | null };

type Compact<T> = { ticker: string; rows: T[] };

async function version(db: Db): Promise<string> {
  const [[c], [e]] = await Promise.all([
    db.select({ at: max(dailyCloses.fetchedAt), n: count() }).from(dailyCloses),
    db.select({ at: max(securityEvents.fetchedAt), n: count() }).from(securityEvents),
  ]);
  return [c?.at?.toISOString(), c?.n, e?.at?.toISOString(), e?.n].join("|");
}

// The miss path uses the app's own client: a cached function's arguments become its key, so a db can't be passed.
async function appDb(): Promise<Db> {
  return (await import("@/db/client")).db as unknown as Db;
}

const closesForTicker = unstable_cache(
  async (ticker: string, version: string): Promise<Compact<[string, string]>> => {
    void version; // only part of the key
    const db = await appDb();
    const rows = await db.select({ d: dailyCloses.sessionDate, c: dailyCloses.close }).from(dailyCloses).where(inArray(dailyCloses.ticker, [ticker]));
    return { ticker, rows: rows.map((r) => [r.d, r.c]) };
  },
  ["market-closes-v1"],
  { revalidate: REVALIDATE_S },
);

const eventsForTicker = unstable_cache(
  async (ticker: string, version: string): Promise<Compact<[string, EventRow["kind"], string | null, string | null]>> => {
    void version; // only part of the key
    const db = await appDb();
    const rows = await db
      .select({ d: securityEvents.exDate, k: securityEvents.kind, a: securityEvents.amount, r: securityEvents.ratio })
      .from(securityEvents)
      .where(inArray(securityEvents.ticker, [ticker]));
    return { ticker, rows: rows.map((r) => [r.d, r.k, r.a, r.r]) };
  },
  ["market-events-v1"],
  { revalidate: REVALIDATE_S },
);

function noDataCache(e: unknown) {
  return e instanceof Error && e.message.includes("incrementalCache missing");
}

/** Every stored close for `symbols`, optionally from a date on. */
export async function loadCloses(db: Db, symbols: string[], opts: { from?: string } = {}): Promise<CloseRow[]> {
  const list = [...new Set(symbols)];
  if (!list.length) return [];
  let out: CloseRow[];
  try {
    const v = await version(db);
    const parts = await Promise.all(list.map((t) => closesForTicker(t, v)));
    out = parts.flatMap((p) => p.rows.map(([date, close]) => ({ ticker: p.ticker, date, close })));
  } catch (e) {
    if (!noDataCache(e)) throw e;
    const rows = await db.select({ ticker: dailyCloses.ticker, date: dailyCloses.sessionDate, close: dailyCloses.close }).from(dailyCloses).where(inArray(dailyCloses.ticker, list));
    out = rows;
  }
  return opts.from ? out.filter((r) => r.date >= opts.from!) : out;
}

/** Every stored dividend and split for `symbols`. */
export async function loadEvents(db: Db, symbols: string[]): Promise<EventRow[]> {
  const list = [...new Set(symbols)];
  if (!list.length) return [];
  try {
    const v = await version(db);
    const parts = await Promise.all(list.map((t) => eventsForTicker(t, v)));
    return parts.flatMap((p) => p.rows.map(([date, kind, amount, ratio]) => ({ ticker: p.ticker, date, kind, amount, ratio })));
  } catch (e) {
    if (!noDataCache(e)) throw e;
    return db
      .select({ ticker: securityEvents.ticker, date: securityEvents.exDate, kind: securityEvents.kind, amount: securityEvents.amount, ratio: securityEvents.ratio })
      .from(securityEvents)
      .where(inArray(securityEvents.ticker, list));
  }
}
