import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, evidenceItems, holdings, sectorBellwethers, securities, teams } from "@/db/schema";
import type { GicsSector } from "@/lib/attribution/sectors";
import type { HoldingEventRow } from "@/lib/earnings-calendar";

export async function listTeamEarnings(teamId: string) {
  return db
    .select({ e: earnings, h: holdings })
    .from(earnings)
    .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
    .where(eq(holdings.teamId, teamId))
    .orderBy(desc(earnings.reportDate), asc(holdings.ticker))
    .limit(200);
}

/** Every active holding's earnings in a date window, across all teams, with the security's classification. */
export async function listCalendarHoldingEvents(from: string, to: string): Promise<HoldingEventRow[]> {
  return db
    .select({ e: earnings, h: holdings, teamSlug: teams.slug, teamName: teams.name, sector: securities.sector, industry: securities.industry })
    .from(earnings)
    .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
    .innerJoin(teams, eq(teams.id, holdings.teamId))
    .leftJoin(securities, eq(securities.ticker, holdings.ticker))
    .where(and(eq(holdings.status, "active"), gte(earnings.reportDate, from), lte(earnings.reportDate, to)))
    .orderBy(asc(earnings.reportDate), asc(holdings.ticker));
}

export async function listBellwethers() {
  return db.select().from(sectorBellwethers).orderBy(asc(sectorBellwethers.sector), desc(sectorBellwethers.weightPct));
}

/** Distinct industries among active holdings that are this team's or sit in its sectors. */
export async function listHoldingIndustries(teamId: string, sectors: GicsSector[]): Promise<string[]> {
  const scope = sectors.length > 0 ? or(eq(holdings.teamId, teamId), inArray(securities.sector, sectors)) : eq(holdings.teamId, teamId);
  const rows = await db
    .selectDistinct({ industry: securities.industry })
    .from(securities)
    .innerJoin(holdings, eq(holdings.ticker, securities.ticker))
    .where(and(eq(holdings.status, "active"), isNotNull(securities.industry), scope));
  return rows.map((r) => r.industry!).sort();
}

export async function getEarnings(id: string) {
  const [row] = await db.select({ e: earnings, h: holdings }).from(earnings).innerJoin(holdings, eq(holdings.id, earnings.holdingId)).where(eq(earnings.id, id)).limit(1);
  return row ?? null;
}

export async function listEarningsEvidence(earningsId: string) {
  return db.select().from(evidenceItems).where(eq(evidenceItems.earningsId, earningsId)).orderBy(desc(evidenceItems.publishedAt));
}

export type ActualsRow = { metric: string; actual: string | null; priorYear: string | null; priorGuidance: string | null; estimate: string | null; sourceId: string | null; note?: string };
export type Actuals = { rows: ActualsRow[]; sources: { id: string; title: string; url: string }[]; extractedAt: string; model?: string; missing: string[] };

/** The next upcoming report for a holding (soonest first), for the research board's prep-pack card. */
export async function getUpcomingEarnings(holdingId: string) {
  const [row] = await db.select().from(earnings).where(and(eq(earnings.holdingId, holdingId), eq(earnings.status, "upcoming"))).orderBy(asc(earnings.reportDate)).limit(1);
  return row ?? null;
}
