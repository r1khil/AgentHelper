"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, holdings, teams } from "@/db/schema";
import { canOpenChat, isFundWide, listAccessibleTeams, requireTeamAccess, requireUser } from "@/lib/auth";
import { boardHref } from "@/lib/scope";
import { rememberedScope } from "@/lib/teams";

export async function createChat(fd: FormData) {
  const teamId = String(fd.get("teamId") ?? "");
  const holdingId = String(fd.get("holdingId") ?? "") || null;
  const user = await requireTeamAccess(teamId);
  const [c] = await db.insert(chats).values({ teamId, holdingId, createdBy: user.id }).returning({ id: chats.id });
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
  if (!c || !canOpenChat(user, c)) return;
  if (c.createdBy !== user.id && user.role !== "admin" && user.role !== "lead_analyst" && user.role !== "exec") return;
  await db.delete(chats).where(eq(chats.id, id));
  // The thread is gone from the list of threads and at its own address; the member goes Home.
  revalidatePath("/hoot");
  revalidatePath(`/hoot/${id}`);
  redirect("/");
}

/**
 * Hoot's quick ask: open a chat that fits the page the member is on. On a holding page the chat is pinned to that
 * holding (it lists on the holding's Threads tab); anywhere else it is a general conversation, filed under the team in
 * view (or the member's own). Either opens at /hoot/<id>, so asking never switches the sector the sidebar is showing. An exec
 * or admin asking outside any one team's view gets a fund-wide conversation (no team): Hoot then sees every team.
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
      return { href: boardHref(await rememberedScope(user), row.slug, input.ticker, c.id), chatId: c.id };
    }
  }
  const team = inView ?? (isFundWide(user) ? null : (accessible.find((t) => t.id === user.teamId) ?? accessible[0]));
  const [c] = await db.insert(chats).values({ teamId: team?.id ?? null, holdingId: null, createdBy: user.id }).returning({ id: chats.id });
  return { href: `/hoot/${c.id}`, chatId: c.id };
}

/**
 * "Pin to a holding": file a general conversation under one holding, so it lists on that holding's Threads tab and
 * Hoot reads it as that holding's research. The member must be able to open the chat and the holding; the chat moves to
 * the holding's team so that team's members see it. Returns the thread's address (it stays at /hoot/<id>).
 */
export async function pinChatToHolding(input: { chatId: string; ticker: string; teamSlug: string }): Promise<{ href: string } | { error: string }> {
  const user = await requireUser();
  const [chat] = await db.select().from(chats).where(eq(chats.id, input.chatId)).limit(1);
  if (!chat || !canOpenChat(user, chat)) return { error: "That conversation isn't available to you." };
  if (chat.holdingId) return { error: "This conversation is already pinned to a holding." };
  const accessible = await listAccessibleTeams(user);
  const team = accessible.find((t) => t.slug === input.teamSlug);
  if (!team) return { error: "That holding isn't in a team you can open." };
  const [h] = await db
    .select({ id: holdings.id })
    .from(holdings)
    .where(and(eq(holdings.teamId, team.id), eq(holdings.ticker, input.ticker), eq(holdings.status, "active")))
    .limit(1);
  if (!h) return { error: `${input.ticker} isn't an active holding of ${team.name}.` };
  await db.update(chats).set({ holdingId: h.id, teamId: team.id }).where(eq(chats.id, chat.id));
  revalidatePath("/hoot");
  revalidatePath(`/hoot/${chat.id}`);
  return { href: boardHref(await rememberedScope(user), team.slug, input.ticker, chat.id) };
}
