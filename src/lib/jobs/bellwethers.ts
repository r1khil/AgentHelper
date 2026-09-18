import "server-only";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { holdings, sectorBellwethers, securities } from "@/db/schema";
import { ETF_BY_SECTOR, GICS_SECTORS } from "@/lib/attribution/sectors";
import { ensureSecurity } from "@/lib/attribution/store";
import { NY, todayNY } from "@/lib/providers/calendar";
import { getEarningsCalendarRange } from "@/lib/providers/finnhub";
import type { EarningsDate } from "@/lib/providers/types";
import { getEarningsDate, getFundTopHoldings, getSectorProfile } from "@/lib/providers/yahoo";

export type BellwetherJobResult = { etfs: number; tickers: number; dated: number; errors: Record<string, string> };

/** Constituents kept per sector ETF. */
const TOP_N = 10;
/** How far ahead to look for a report date. */
const HORIZON_DAYS = 100;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Refresh the sector bellwethers: the top constituents of each sector SPDR, their industry and
 * their next report date. Finnhub's whole-market calendar covers most names in one call; Yahoo
 * fills the rest. An ETF whose constituents cannot be fetched keeps its previous rows.
 */
export async function refreshBellwethers(): Promise<BellwetherJobResult> {
  const today = todayNY();
  const to = DateTime.fromISO(today, { zone: NY }).plus({ days: HORIZON_DAYS }).toISODate()!;
  const finnhub = await getEarningsCalendarRange(today, to).catch(() => new Map<string, EarningsDate[]>());
  const result: BellwetherJobResult = { etfs: 0, tickers: 0, dated: 0, errors: {} };
  const seen = new Set<string>();

  for (const sector of GICS_SECTORS) {
    const etf = ETF_BY_SECTOR[sector];
    let top: Awaited<ReturnType<typeof getFundTopHoldings>>;
    try {
      top = (await getFundTopHoldings(etf)).slice(0, TOP_N);
    } catch (e) {
      result.errors[etf] = msg(e);
      continue;
    }
    if (top.length === 0) {
      result.errors[etf] = "No constituents returned";
      continue;
    }

    const kept: string[] = [];
    for (const c of top) {
      const ticker = c.symbol.toUpperCase();
      if (seen.has(ticker)) continue;
      seen.add(ticker);
      try {
        const profile = await getSectorProfile(ticker);
        const fh = finnhub.get(ticker)?.find((e) => e.date >= today) ?? null;
        const y = fh ? null : await getEarningsDate(ticker).catch(() => null);
        const next: EarningsDate | null = fh ?? (y && y.date >= today ? y : null);
        const dateStatus = next ? (y && y.isEstimate === false ? "confirmed" : "estimated") : null;
        const values = {
          sector,
          etf,
          name: c.name,
          weightPct: c.weightPct.toFixed(4),
          industry: profile.industry,
          reportDate: next?.date ?? null,
          reportHour: next?.hour ?? null,
          dateStatus,
          epsEstimate: next?.epsEstimate?.toString() ?? null,
          dateSourceUrl: next?.sourceUrl ?? null,
          updatedAt: new Date(),
        } as const;
        await db
          .insert(sectorBellwethers)
          .values({ ticker, ...values })
          .onConflictDoUpdate({ target: sectorBellwethers.ticker, set: values });
        kept.push(ticker);
        result.tickers++;
        if (next) result.dated++;
      } catch (e) {
        result.errors[ticker] = msg(e);
      }
    }
    if (kept.length > 0) {
      await db.delete(sectorBellwethers).where(and(eq(sectorBellwethers.etf, etf), notInArray(sectorBellwethers.ticker, kept)));
    }
    result.etfs++;
  }
  return result;
}

/**
 * Make sure every active holding has a securities row and fill in missing industries.
 * Profiles are cached for a week, so re-checking ETFs and other null industries is cheap.
 */
export async function backfillIndustries(): Promise<{ checked: number; filled: number }> {
  const active = await db.selectDistinct({ ticker: holdings.ticker }).from(holdings).where(eq(holdings.status, "active"));
  for (const { ticker } of active) {
    try {
      await ensureSecurity(db, ticker);
    } catch {
      // Unknown to Yahoo; nothing to classify.
    }
  }
  const missing = await db.select({ ticker: securities.ticker }).from(securities).where(isNull(securities.industry));
  let filled = 0;
  for (const { ticker } of missing) {
    try {
      const profile = await getSectorProfile(ticker);
      if (!profile.industry) continue;
      await db.update(securities).set({ industry: profile.industry }).where(eq(securities.ticker, ticker));
      filled++;
    } catch {
      // Best effort; the next sweep retries.
    }
  }
  return { checked: missing.length, filled };
}
