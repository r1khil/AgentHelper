import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceItems, holdings, movements, profiles } from "@/db/schema";

export async function listTeamMovements(teamId: string) {
  return db
    .select({ m: movements, h: holdings, ownerName: profiles.fullName })
    .from(movements)
    .innerJoin(holdings, eq(holdings.id, movements.holdingId))
    .leftJoin(profiles, eq(profiles.id, movements.ownerId))
    .where(eq(holdings.teamId, teamId))
    .orderBy(desc(movements.sessionDate), asc(holdings.ticker))
    .limit(200);
}

export async function listMyOpenMovements(userId: string) {
  return db
    .select({ m: movements, h: holdings })
    .from(movements)
    .innerJoin(holdings, eq(holdings.id, movements.holdingId))
    .where(and(eq(movements.ownerId, userId), eq(movements.status, "open")))
    .orderBy(asc(movements.dueAt));
}

export async function getMovement(id: string) {
  const [row] = await db
    .select({ m: movements, h: holdings, ownerName: profiles.fullName })
    .from(movements)
    .innerJoin(holdings, eq(holdings.id, movements.holdingId))
    .leftJoin(profiles, eq(profiles.id, movements.ownerId))
    .where(eq(movements.id, id))
    .limit(1);
  return row ?? null;
}

export async function listEvidence(movementId: string) {
  return db.select().from(evidenceItems).where(eq(evidenceItems.movementId, movementId)).orderBy(desc(evidenceItems.publishedAt));
}

/** The unfinished movement on a holding, if the analyst still owes an update. */
export async function getOpenMovement(holdingId: string) {
  const [row] = await db
    .select()
    .from(movements)
    .where(and(eq(movements.holdingId, holdingId), inArray(movements.status, ["open", "in_progress"])))
    .orderBy(desc(movements.sessionDate))
    .limit(1);
  return row ?? null;
}
