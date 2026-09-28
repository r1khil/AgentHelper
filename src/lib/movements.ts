import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceItems, holdings, movements, profiles } from "@/db/schema";
import { inTeams, type TeamIds } from "@/lib/team-filter";

export async function listTeamMovements(teamId: TeamIds) {
  return db
    .select({ m: movements, h: holdings, completedByName: profiles.fullName })
    .from(movements)
    .innerJoin(holdings, eq(holdings.id, movements.holdingId))
    .leftJoin(profiles, eq(profiles.id, movements.completedBy))
    .where(inTeams(holdings.teamId, teamId))
    // Unfinished investigations sort ahead of completed ones so the row cap only ever trims history.
    .orderBy(sql`${movements.status} = 'completed'`, desc(movements.sessionDate), asc(holdings.ticker))
    .limit(200);
}

export async function getMovement(id: string) {
  const [row] = await db
    .select({ m: movements, h: holdings, completedByName: profiles.fullName })
    .from(movements)
    .innerJoin(holdings, eq(holdings.id, movements.holdingId))
    .leftJoin(profiles, eq(profiles.id, movements.completedBy))
    .where(eq(movements.id, id))
    .limit(1);
  return row ?? null;
}

export async function listEvidence(movementId: string) {
  return db.select().from(evidenceItems).where(eq(evidenceItems.movementId, movementId)).orderBy(desc(evidenceItems.publishedAt));
}

/** The unfinished movement on a holding, if its team still owes an update. */
export async function getOpenMovement(holdingId: string) {
  const [row] = await db
    .select()
    .from(movements)
    .where(and(eq(movements.holdingId, holdingId), inArray(movements.status, ["open", "in_progress"])))
    .orderBy(desc(movements.sessionDate))
    .limit(1);
  return row ?? null;
}
