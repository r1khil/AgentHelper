import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { holdingNotes, holdings, profiles } from "@/db/schema";

export async function listTeamHoldings(teamId: string, status: "active" | "exited" | "all" = "active") {
  const where = status === "all" ? eq(holdings.teamId, teamId) : and(eq(holdings.teamId, teamId), eq(holdings.status, status));
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

export async function listTeamMembers(teamId: string) {
  return db.select().from(profiles).where(eq(profiles.teamId, teamId)).orderBy(asc(profiles.fullName));
}
