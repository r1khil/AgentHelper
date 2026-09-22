"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, holdings, teams } from "@/db/schema";
import { isFundWide, listAccessibleTeams, requireTeamAccess, requireUser } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";

export async function createChat(fd: FormData) {
  const teamId = String(fd.get("teamId") ?? "");
  const holdingId = String(fd.get("holdingId") ?? "") || null;
  const user = await requireTeamAccess(teamId);
  const [c] = await db.insert(chats).values({ teamId, holdingId, createdBy: user.id }).returning({ id: chats.id });
  // The chat page sends holding chats on to their board.
  redirect(`/hoot/${c.id}`);
}

/** Start a chat pinned to a holding from the research board; the board then sends the first question itself. */
export async function createHoldingChat(input: { teamId: string; holdingId: string }): Promise<{ id: string }> {
  const user = await requireTeamAccess(input.teamId);
  const [h] = await db.select({ id: holdings.id }).from(holdings).where(and(eq(holdings.id, input.holdingId), eq(holdings.teamId, input.teamId))).limit(1);
  if (!h) throw new Error("Holding not found");
  const [c] = await db.insert(chats).values({ teamId: input.teamId, holdingId: h.id, createdBy: user.id }).returning({ id: chats.id });
  return { id: c.id };
}

export async function deleteChat(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const user = await requireUser();
  const [c] = await db.select().from(chats).where(eq(chats.id, id)).limit(1);
  if (!c) return;
  await requireTeamAccess(c.teamId);
  if (c.createdBy !== user.id && user.role !== "admin" && user.role !== "lead_analyst" && user.role !== "exec") return;
  await db.delete(chats).where(eq(chats.id, id));
  const [team] = await db.select({ slug: teams.slug }).from(teams).where(eq(teams.id, c.teamId)).limit(1);
  const [h] = c.holdingId ? await db.select({ ticker: holdings.ticker }).from(holdings).where(eq(holdings.id, c.holdingId)).limit(1) : [];
  revalidatePath(`/t/${team.slug}/agent`);
  if (isFundWide(user)) revalidatePath(`/t/${FUND_SCOPE_SLUG}/agent`);
  // A holding chat returns to its board; a general conversation returns to Hoot's page in the reader's usual scope.
  redirect(h ? `/t/${team.slug}/agent/h/${h.ticker}` : `/t/${isFundWide(user) ? FUND_SCOPE_SLUG : team.slug}/agent`);
}

/**
 * Hoot's quick ask: open a chat that fits the page the member is on. On a holding page the chat is pinned to that
 * holding (it opens on the research board); anywhere else it is a general conversation, filed under the team in view
 * (or the member's own) but opened at /hoot/<id>, so asking never switches the sector the sidebar is showing.
 * The question itself travels client-side and is sent by the chat surface once it mounts.
 */
export async function startHootChat(input: { teamSlug: string | null; ticker: string | null }): Promise<{ href: string; chatId: string } | { error: string }> {
  const user = await requireUser();
  const accessible = await listAccessibleTeams(user);
  if (accessible.length === 0) return { error: "You're not on a team yet, so Hoot has no research to look through." };
  const inView = accessible.find((t) => t.slug === input.teamSlug);
  if (input.ticker) {
    const scope = inView ? [inView.id] : accessible.map((t) => t.id);
    const [row] = await db
      .select({ holdingId: holdings.id, teamId: holdings.teamId, slug: teams.slug })
      .from(holdings)
      .innerJoin(teams, eq(teams.id, holdings.teamId))
      .where(and(eq(holdings.ticker, input.ticker), inArray(holdings.teamId, scope), eq(holdings.status, "active")))
      .limit(1);
    if (row) {
      const [c] = await db.insert(chats).values({ teamId: row.teamId, holdingId: row.holdingId, createdBy: user.id }).returning({ id: chats.id });
      return { href: `/t/${row.slug}/agent/h/${encodeURIComponent(input.ticker)}?chat=${c.id}`, chatId: c.id };
    }
  }
  const team = inView ?? accessible.find((t) => t.id === user.teamId) ?? accessible[0];
  const [c] = await db.insert(chats).values({ teamId: team.id, holdingId: null, createdBy: user.id }).returning({ id: chats.id });
  return { href: `/hoot/${c.id}`, chatId: c.id };
}
