import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { filingChanges, flags, holdings, watchlist, type FilingChange, type Flag } from "@/db/schema";
import { getSetting } from "@/lib/settings";
import { labelText } from "./labels";

// Reads for the Screener page, the bell and Hoot. The job writes; nothing here does.

export type CoveredName = { ticker: string; cik: string | null; companyName: string; teamId: string; source: "holding" | "watchlist" };

/** Every name the detector covers: each team's active holdings, then its watchlist names it doesn't already hold. */
export async function coveredNames(): Promise<CoveredName[]> {
  const [held, watched] = await Promise.all([
    db.select({ ticker: holdings.ticker, cik: holdings.cik, companyName: holdings.companyName, teamId: holdings.teamId }).from(holdings).where(eq(holdings.status, "active")),
    db.select({ ticker: watchlist.ticker, cik: watchlist.cik, companyName: watchlist.companyName, teamId: watchlist.teamId }).from(watchlist),
  ]);
  const out: CoveredName[] = held.map((h) => ({ ...h, source: "holding" as const }));
  const seen = new Set(out.map((h) => `${h.teamId}:${h.ticker.toUpperCase()}`));
  for (const w of watched) if (!seen.has(`${w.teamId}:${w.ticker.toUpperCase()}`)) out.push({ ...w, source: "watchlist" });
  return out;
}

export type FilingChangeView = FilingChange & { labelText: string };

/**
 * Labeled changes and 8-K flags, newest filing first (queued diffs too with `includeQueued`). Rows marked dropped
 * (labeled with nothing that survived the quote check) never show.
 */
export async function listFilingChanges(opts: { tickers?: string[]; limit?: number; includeQueued?: boolean } = {}): Promise<FilingChangeView[]> {
  if (opts.tickers && !opts.tickers.length) return [];
  const statuses = opts.includeQueued ? ["labeled", "queued"] : ["labeled"];
  const rows = await db
    .select()
    .from(filingChanges)
    .where(and(inArray(filingChanges.status, statuses), opts.tickers ? inArray(filingChanges.ticker, opts.tickers.map((t) => t.toUpperCase())) : undefined))
    .orderBy(desc(filingChanges.filedAt), filingChanges.priority, desc(filingChanges.createdAt))
    .limit(opts.limit ?? 100);
  return rows.map((r) => ({ ...r, labelText: labelText(r.label) }));
}

/** Flags nobody has dismissed, newest first. */
export async function listOpenFlags(opts: { tickers?: string[]; limit?: number } = {}): Promise<Flag[]> {
  if (opts.tickers && !opts.tickers.length) return [];
  return db
    .select()
    .from(flags)
    .where(and(isNull(flags.dismissedAt), opts.tickers ? inArray(flags.ticker, opts.tickers.map((t) => t.toUpperCase())) : undefined))
    .orderBy(desc(flags.createdAt))
    .limit(opts.limit ?? 50);
}

/** Where the evening job keeps its place between invocations (app_settings, JSON). See job.ts. */
export const FILING_CHANGES_STATE_SETTING = "filing_changes_state";

/** What is waiting: diffs queued for the model plus filings listed but not yet compared. */
export async function queueLength(): Promise<number> {
  const [[row], state] = await Promise.all([db.select({ n: count() }).from(filingChanges).where(eq(filingChanges.status, "queued")), getSetting(FILING_CHANGES_STATE_SETTING, { fresh: true })]);
  let pending = 0;
  try {
    const p = state ? (JSON.parse(state) as { pending?: unknown[] }).pending : undefined;
    pending = Array.isArray(p) ? p.length : 0;
  } catch {
    pending = 0;
  }
  return Number(row?.n ?? 0) + pending;
}
