import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, watchlist, type WatchlistRow } from "@/db/schema";
import { pickCompanyName } from "@/lib/company-name";
import { tickerToCik } from "@/lib/providers/edgar";
import { lookupCompany } from "@/lib/providers/yahoo";

export type WatchlistView = WatchlistRow & { addedByName: string | null };

/** Watchlist names for these teams, alphabetical. */
export async function listWatchlist(teamIds: string[]): Promise<WatchlistView[]> {
  if (!teamIds.length) return [];
  const rows = await db
    .select({ w: watchlist, addedByName: profiles.fullName })
    .from(watchlist)
    .leftJoin(profiles, eq(profiles.id, watchlist.addedBy))
    .where(inArray(watchlist.teamId, teamIds))
    .orderBy(asc(watchlist.ticker));
  return rows.map((r) => ({ ...r.w, addedByName: r.addedByName }));
}

/**
 * Adds a name to a team's watchlist, with its CIK from SEC's ticker file (none for a name that isn't an SEC registrant;
 * filing changes then skip it). Returns an error in words when the ticker isn't a company.
 */
export async function addWatch(teamId: string, rawTicker: string, addedBy: string): Promise<{ ok: true; row: WatchlistRow } | { ok: false; error: string }> {
  const ticker = rawTicker.trim().toUpperCase().replace(/^\$/, "");
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return { ok: false, error: "Type a ticker, like KRE or BRK.B." };
  const [sec, yahoo] = await Promise.all([tickerToCik(ticker).catch(() => null), lookupCompany(ticker).catch(() => null)]);
  if (!sec && !yahoo) return { ok: false, error: `${ticker} isn't a listed company we can find.` };
  const [row] = await db
    .insert(watchlist)
    .values({ teamId, ticker, companyName: pickCompanyName(ticker, [yahoo?.name, sec?.name]) || ticker, cik: sec?.cik ?? null, addedBy })
    .onConflictDoNothing()
    .returning();
  if (!row) return { ok: false, error: `${ticker} is already on the watchlist.` };
  return { ok: true, row };
}

export async function removeWatch(id: string): Promise<WatchlistRow | null> {
  const [row] = await db.delete(watchlist).where(eq(watchlist.id, id)).returning();
  return row ?? null;
}

export async function getWatch(id: string): Promise<WatchlistRow | null> {
  const [row] = await db.select().from(watchlist).where(eq(watchlist.id, id));
  return row ?? null;
}

export async function isWatched(teamId: string, ticker: string): Promise<boolean> {
  const [row] = await db.select({ id: watchlist.id }).from(watchlist).where(and(eq(watchlist.teamId, teamId), eq(watchlist.ticker, ticker)));
  return !!row;
}
