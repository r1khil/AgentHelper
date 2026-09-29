import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceItems, holdings, movements, notifications, profiles } from "@/db/schema";
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
    // The oldest first: when a holding has two, the one due soonest (or already overdue) is what the team owes.
    .orderBy(asc(movements.sessionDate))
    .limit(1);
  return row ?? null;
}

/** The close check's email about a movement: how many people it went to and when the first one left (null while unsent). */
export async function getMovementAlert(movementId: string) {
  const rows = await db
    .select({ sentAt: notifications.sentAt })
    .from(notifications)
    .where(and(eq(notifications.kind, "movement_alert"), eq(notifications.refId, movementId)));
  const sent = rows.flatMap((r) => (r.sentAt ? [r.sentAt] : []));
  return { recipients: rows.length, sentAt: sent.length ? new Date(Math.min(...sent.map((d) => d.getTime()))) : null };
}
