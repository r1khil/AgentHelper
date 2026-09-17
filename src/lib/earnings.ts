import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, evidenceItems, holdings } from "@/db/schema";

export async function listTeamEarnings(teamId: string) {
  return db
    .select({ e: earnings, h: holdings })
    .from(earnings)
    .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
    .where(eq(holdings.teamId, teamId))
    .orderBy(desc(earnings.reportDate), asc(holdings.ticker))
    .limit(200);
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
