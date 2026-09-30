import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, screenHits, screenRuns, teams, watchlist } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { titleCaseCompanyName } from "@/lib/company-name";
import { tickerToCik } from "@/lib/providers/edgar";
import { lookupCompany } from "@/lib/providers/yahoo";

export const COMPANY_TABS = [
  { key: "sheet", label: "Tear sheet" },
  { key: "changes", label: "Filing changes" },
  { key: "dcf", label: "Reverse DCF" },
  { key: "bear", label: "Bear case" },
  { key: "pitch", label: "Pitch" },
] as const;
export type CompanyTab = (typeof COMPANY_TABS)[number]["key"];

export function parseCompanyTab(v: string | undefined, hasHit: boolean): CompanyTab {
  return COMPANY_TABS.some((t) => t.key === v) ? (v as CompanyTab) : hasHit ? "sheet" : "changes";
}

/**
 * Who a company is to the fund: its SEC registration, its latest screen hit (from the latest finished run), and
 * which teams hold it or watch it.
 */
export async function loadCompany(user: CurrentUser, raw: string) {
  const ticker = decodeURIComponent(raw).trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return null;
  const [sec, [hitRow], held, watched] = await Promise.all([
    tickerToCik(ticker).catch(() => null),
    db
      .select({ hit: screenHits, runDate: screenRuns.runDate })
      .from(screenHits)
      .innerJoin(screenRuns, eq(screenRuns.id, screenHits.runId))
      .where(and(eq(screenHits.ticker, ticker), eq(screenRuns.status, "done")))
      .orderBy(desc(screenRuns.runDate))
      .limit(1),
    db
      .select({ teamId: holdings.teamId, slug: teams.slug, name: teams.name })
      .from(holdings)
      .innerJoin(teams, eq(teams.id, holdings.teamId))
      .where(and(eq(holdings.ticker, ticker), eq(holdings.status, "active"))),
    db.select({ id: watchlist.id, teamId: watchlist.teamId, name: teams.name }).from(watchlist).innerJoin(teams, eq(teams.id, watchlist.teamId)).where(eq(watchlist.ticker, ticker)),
  ]);
  const name = sec?.name ?? hitRow?.hit.companyName ?? (await lookupCompany(ticker).catch(() => null))?.name ?? null;
  if (!name) return null;
  // The team a pitch or bear case is for by default: the one holding it, else watching it, else the member's own.
  const teamId = held[0]?.teamId ?? watched[0]?.teamId ?? hitRow?.hit.teamId ?? user.teamId ?? null;
  return { ticker, name: titleCaseCompanyName(name), cik: sec?.cik ?? hitRow?.hit.cik ?? null, hit: hitRow?.hit ?? null, hitRunDate: hitRow?.runDate ?? null, held, watched, teamId };
}
