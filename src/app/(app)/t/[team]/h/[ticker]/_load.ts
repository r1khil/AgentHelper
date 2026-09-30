import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { modelMappings, modelProposals, profiles, sellSideCalls } from "@/db/schema";

/*
 * What the holding page needs beyond lib/holdings' loadHoldingActivity: the fields the old Models and
 * Sell-side lists showed for each row, for this one holding only.
 */

/** The team's sell-side calls on this ticker (the way sellSideSummary counts them), newest first, with who recorded each. */
export async function listHoldingCalls(teamId: string, ticker: string) {
  return db
    .select({ id: sellSideCalls.id, title: sellSideCalls.title, status: sellSideCalls.status, error: sellSideCalls.error, createdAt: sellSideCalls.createdAt, by: profiles.fullName })
    .from(sellSideCalls)
    .leftJoin(profiles, eq(profiles.id, sellSideCalls.createdBy))
    .where(and(eq(sellSideCalls.teamId, teamId), eq(sellSideCalls.ticker, ticker.toUpperCase())))
    .orderBy(desc(sellSideCalls.createdAt))
    .limit(50);
}

export type ModelCounts = { proposed: number; approved: number; exceptions: number; mappings: number };

/** Per model version: values waiting (proposed, exceptions), approved, and line items mapped, as the Models list counted them. */
export async function modelCounts(modelIds: string[]): Promise<Map<string, ModelCounts>> {
  const out = new Map<string, ModelCounts>(modelIds.map((id) => [id, { proposed: 0, approved: 0, exceptions: 0, mappings: 0 }]));
  if (!modelIds.length) return out;
  const [statuses, mapped] = await Promise.all([
    db
      .select({ modelId: modelProposals.modelId, status: modelProposals.status, n: count() })
      .from(modelProposals)
      .where(inArray(modelProposals.modelId, modelIds))
      .groupBy(modelProposals.modelId, modelProposals.status),
    db.select({ modelId: modelMappings.modelId, n: count() }).from(modelMappings).where(inArray(modelMappings.modelId, modelIds)).groupBy(modelMappings.modelId),
  ]);
  for (const s of statuses) {
    const c = out.get(s.modelId);
    if (!c) continue;
    if (s.status === "proposed") c.proposed = Number(s.n);
    else if (s.status === "approved") c.approved = Number(s.n);
    else if (s.status === "exception") c.exceptions = Number(s.n);
  }
  for (const m of mapped) {
    const c = out.get(m.modelId);
    if (c) c.mappings = Number(m.n);
  }
  return out;
}
