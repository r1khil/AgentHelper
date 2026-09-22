import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { holdingNotes, holdingProposals, holdings, profiles } from "@/db/schema";
import { inTeams, type TeamIds } from "@/lib/team-filter";

export async function listTeamHoldings(teamId: TeamIds, status: "active" | "exited" | "all" = "active") {
  const where = status === "all" ? inTeams(holdings.teamId, teamId) : and(inTeams(holdings.teamId, teamId), eq(holdings.status, status));
  return db
    .select({ h: holdings, ownerName: profiles.fullName })
    .from(holdings)
    .leftJoin(profiles, eq(profiles.id, holdings.ownerId))
    .where(where)
    .orderBy(asc(holdings.ticker));
}

export async function getHolding(teamId: string, ticker: string) {
  const [row] = await db
    .select({ h: holdings, ownerName: profiles.fullName })
    .from(holdings)
    .leftJoin(profiles, eq(profiles.id, holdings.ownerId))
    .where(and(eq(holdings.teamId, teamId), eq(holdings.ticker, ticker.toUpperCase())))
    .orderBy(desc(holdings.status)) // active first if an exited duplicate exists
    .limit(1);
  return row ?? null;
}

export async function listNotes(holdingId: string) {
  return db
    .select({ n: holdingNotes, authorName: profiles.fullName })
    .from(holdingNotes)
    .leftJoin(profiles, eq(profiles.id, holdingNotes.authorId))
    .where(eq(holdingNotes.holdingId, holdingId))
    .orderBy(desc(holdingNotes.createdAt));
}

/** App-extracted values awaiting an analyst's decision (one pending per field). */
export async function listPendingProposals(holdingId: string) {
  return db
    .select()
    .from(holdingProposals)
    .where(and(eq(holdingProposals.holdingId, holdingId), eq(holdingProposals.status, "pending")))
    .orderBy(desc(holdingProposals.createdAt));
}

export async function listTeamMembers(teamId: string) {
  return db.select().from(profiles).where(eq(profiles.teamId, teamId)).orderBy(asc(profiles.fullName));
}
