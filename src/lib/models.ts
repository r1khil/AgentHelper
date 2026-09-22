import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, modelMappings, modelProposals, models, profiles } from "@/db/schema";
import { inTeams, type TeamIds } from "@/lib/team-filter";

export async function listTeamModels(teamId: TeamIds) {
  const hs = await db.select().from(holdings).where(and(inTeams(holdings.teamId, teamId), eq(holdings.status, "active"))).orderBy(asc(holdings.ticker));
  if (!hs.length) return [];
  const ms = await db
    .select({ m: models, uploader: profiles.fullName })
    .from(models)
    .leftJoin(profiles, eq(profiles.id, models.uploadedBy))
    .where(inArray(models.holdingId, hs.map((h) => h.id)))
    .orderBy(desc(models.version));
  return hs.map((h) => {
    const versions = ms.filter((x) => x.m.holdingId === h.id);
    return { holding: h, latest: versions[0] ?? null, versions: versions.length };
  });
}

export async function getModel(modelId: string) {
  const [row] = await db.select({ m: models, h: holdings }).from(models).innerJoin(holdings, eq(holdings.id, models.holdingId)).where(eq(models.id, modelId)).limit(1);
  return row ?? null;
}

export async function listModelVersions(holdingId: string) {
  return db.select().from(models).where(eq(models.holdingId, holdingId)).orderBy(desc(models.version));
}

export async function listMappings(modelId: string) {
  return db.select().from(modelMappings).where(eq(modelMappings.modelId, modelId)).orderBy(asc(modelMappings.sheet), asc(modelMappings.rowRef));
}

export async function listProposals(modelId: string) {
  return db
    .select({ p: modelProposals, mapping: modelMappings, reviewer: profiles.fullName })
    .from(modelProposals)
    .innerJoin(modelMappings, eq(modelMappings.id, modelProposals.mappingId))
    .leftJoin(profiles, eq(profiles.id, modelProposals.reviewedBy))
    .where(eq(modelProposals.modelId, modelId))
    .orderBy(asc(modelMappings.rowRef), asc(modelProposals.periodEnd));
}
