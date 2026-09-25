import { eq, inArray, isNull, max, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { etfConstituents, trades } from "@/db/schema";
import { DEFAULT_ETF_SECTOR, type GicsSector } from "@/lib/attribution/sectors";
import type { Db } from "@/lib/prices";
import { coveragePct, type ConstituentSource, type ParsedHoldings } from "./parse";
import { ETF_SOURCES, REFERENCE_ETFS, fetchEtfHoldings, type Fetcher, type TopHoldings } from "./sources";

/** A stored list is refreshed once its as-of date is more than this many days old. */
export const MAX_AGE_DAYS = 7;
/** A full issuer list isn't replaced by Yahoo's top 10 until it is this old. */
const KEEP_ISSUER_LIST_DAYS = 30;
const BATCH = 500;

/** Tickers the app knows are ETFs: those with an issuer source, and those with a default sector. */
export function isKnownEtf(ticker: string): boolean {
  const t = ticker.toUpperCase();
  return t in ETF_SOURCES || t in DEFAULT_ETF_SECTOR;
}

/** ETFs the ledger currently holds (net shares above zero). Splits don't change the sign, so raw shares do. */
export async function heldEtfs(db: Db): Promise<string[]> {
  const rows = await db
    .select({
      ticker: trades.ticker,
      net: sql<string>`sum(case when ${trades.side} = 'buy' then ${trades.shares} else -${trades.shares} end)`,
    })
    .from(trades)
    .where(isNull(trades.voidedAt))
    .groupBy(trades.ticker);
  return rows.filter((r) => Number(r.net) > 1e-9 && isKnownEtf(r.ticker)).map((r) => r.ticker.toUpperCase()).sort();
}

/** Every list the look-through needs: held ETFs, SPY and the sector SPDRs. */
export async function lookthroughTargets(db: Db): Promise<string[]> {
  return [...new Set([...REFERENCE_ETFS, ...(await heldEtfs(db))])];
}

/** False until migration 0021 is applied; the price job skips the refresh until then. */
export async function constituentsTableExists(db: Db): Promise<boolean> {
  const rows = await db.execute<{ t: string | null }>(sql`select to_regclass('public.etf_constituents')::text as t`);
  // postgres.js returns the rows; other drivers (PGlite in tests) wrap them in { rows }.
  const list = (Array.isArray(rows) ? rows : (rows as unknown as { rows: unknown[] }).rows) as { t: string | null }[];
  const first = list[0];
  return Boolean(first?.t);
}

type StoredMeta = { etf: string; asOf: string; source: string };

async function storedMeta(db: Db, etfs: string[]): Promise<Map<string, StoredMeta>> {
  if (!etfs.length) return new Map();
  const latest = await db
    // One list per ETF is kept, so its rows share a source; max() just picks it.
    .select({ etf: etfConstituents.etf, asOf: max(etfConstituents.asOf), source: max(etfConstituents.source) })
    .from(etfConstituents)
    .where(inArray(etfConstituents.etf, etfs))
    .groupBy(etfConstituents.etf);
  return new Map(latest.filter((r) => r.asOf).map((r) => [r.etf, { etf: r.etf, asOf: r.asOf!, source: r.source ?? "" }]));
}

/** Replace an ETF's stored list with a new one, atomically. Only the latest list is kept. */
export async function saveConstituents(db: Db, list: ParsedHoldings): Promise<number> {
  const rows = list.constituents.map((c) => ({
    etf: list.etf,
    asOf: list.asOf,
    symbol: c.symbol,
    name: c.name.slice(0, 200),
    weight: c.weight.toFixed(6),
    sector: c.sector,
    source: list.source,
  }));
  await db.transaction(async (tx) => {
    await tx.delete(etfConstituents).where(eq(etfConstituents.etf, list.etf));
    for (let i = 0; i < rows.length; i += BATCH) await tx.insert(etfConstituents).values(rows.slice(i, i + BATCH));
  });
  return rows.length;
}

export type RefreshedList = { etf: string; asOf: string; source: ConstituentSource; rows: number; coveragePct: number; issuerError: string | null };

export type EtfRefreshResult = {
  status: "ok" | "skipped" | "failed";
  reason?: string;
  refreshed: RefreshedList[];
  /** Lists younger than the refresh age, left alone. */
  fresh: string[];
  /** Issuer failed and only Yahoo's top 10 was available, so a recent full list was kept instead. */
  kept: string[];
  failed: Record<string, string>;
  /** Not reached within the time budget; the next run picks them up. */
  remaining: string[];
};

/**
 * Refresh each target ETF's list when the stored one is more than a week old (or missing). Called by the
 * nightly price job after prices; never throws, and does nothing until the table exists, so deploying
 * before migration 0021 is applied is harmless.
 */
export async function refreshEtfConstituents(
  db: Db,
  opts: {
    etfs?: string[];
    maxAgeDays?: number;
    force?: boolean;
    budgetMs?: number;
    today?: string;
    fetcher?: Fetcher;
    topHoldings?: TopHoldings;
    write?: boolean;
    log?: (msg: string) => void;
  } = {},
): Promise<EtfRefreshResult> {
  const log = opts.log ?? ((m: string) => console.log(`[lookthrough] ${m}`));
  const result: EtfRefreshResult = { status: "ok", refreshed: [], fresh: [], kept: [], failed: {}, remaining: [] };
  const started = Date.now();
  const budget = opts.budgetMs ?? 60_000;
  const write = opts.write ?? true;
  try {
    if (!(await constituentsTableExists(db))) {
      log("etf_constituents does not exist yet (migration 0021); skipping");
      return { ...result, status: "skipped", reason: "etf_constituents table not created yet (migration 0021)" };
    }
    const today = opts.today ?? DateTime.now().setZone("America/New_York").toISODate()!;
    const targets = (opts.etfs ?? (await lookthroughTargets(db))).map((e) => e.toUpperCase());
    const stored = await storedMeta(db, targets);
    const cutoff = DateTime.fromISO(today).minus({ days: opts.maxAgeDays ?? MAX_AGE_DAYS }).toISODate()!;
    const keepCutoff = DateTime.fromISO(today).minus({ days: KEEP_ISSUER_LIST_DAYS }).toISODate()!;

    for (const etf of targets) {
      const prev = stored.get(etf);
      if (!opts.force && prev && prev.asOf >= cutoff) {
        result.fresh.push(etf);
        continue;
      }
      if (Date.now() - started > budget) {
        result.remaining.push(etf);
        continue;
      }
      try {
        const { list, issuerError } = await fetchEtfHoldings(etf, { fetcher: opts.fetcher, topHoldings: opts.topHoldings, today });
        if (list.source === "yahoo-top10" && prev && prev.source !== "yahoo-top10" && prev.asOf >= keepCutoff) {
          result.kept.push(etf);
          log(`${etf}: issuer failed (${issuerError}); kept the ${prev.source} list as of ${prev.asOf}`);
          continue;
        }
        const rows = write ? await saveConstituents(db, list) : list.constituents.length;
        const entry: RefreshedList = { etf, asOf: list.asOf, source: list.source, rows, coveragePct: Math.round(coveragePct(list) * 100) / 100, issuerError };
        result.refreshed.push(entry);
        log(`${etf}: ${rows} names, ${entry.coveragePct}% as of ${list.asOf} (${list.source})${issuerError ? `; issuer failed: ${issuerError}` : ""}`);
      } catch (e) {
        result.failed[etf] = e instanceof Error ? e.message : String(e);
        log(`${etf}: failed: ${result.failed[etf]}`);
      }
    }
    const failed = Object.keys(result.failed).length;
    if (failed && !result.refreshed.length && !result.fresh.length) return { ...result, status: "failed", reason: `${failed} lists failed` };
    return failed ? { ...result, reason: `${failed} lists failed` } : result;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    log(`refresh failed: ${reason}`);
    return { ...result, status: "failed", reason };
  }
}

export type StoredList = {
  etf: string;
  asOf: string;
  source: ConstituentSource;
  constituents: { symbol: string; name: string; weight: number; sector: GicsSector | null }[];
};

/** The stored list for each ETF (weights in percent), or nothing for an ETF with no list. */
export async function loadEtfConstituents(db: Db, etfs: string[]): Promise<StoredList[]> {
  const list = [...new Set(etfs.map((e) => e.toUpperCase()))];
  if (!list.length || !(await constituentsTableExists(db))) return [];
  const rows = await db.select().from(etfConstituents).where(inArray(etfConstituents.etf, list));
  const out = new Map<string, StoredList>();
  for (const r of rows) {
    let l = out.get(r.etf);
    // saveConstituents keeps one list per ETF; if two ever coexist, the later as-of wins.
    if (l && l.asOf > r.asOf) continue;
    if (!l || l.asOf < r.asOf) out.set(r.etf, (l = { etf: r.etf, asOf: r.asOf, source: r.source as ConstituentSource, constituents: [] }));
    l.constituents.push({ symbol: r.symbol, name: r.name, weight: Number(r.weight), sector: r.sector });
  }
  for (const l of out.values()) l.constituents.sort((a, b) => b.weight - a.weight);
  return [...out.values()];
}
