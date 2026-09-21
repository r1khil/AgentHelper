"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, holdings, teams } from "@/db/schema";
import { requireTeamAccess, requireUser } from "@/lib/auth";

export async function createChat(fd: FormData) {
  const teamId = String(fd.get("teamId") ?? "");
  const holdingId = String(fd.get("holdingId") ?? "") || null;
  const user = await requireTeamAccess(teamId);
  const [team] = await db.select({ slug: teams.slug }).from(teams).where(eq(teams.id, teamId)).limit(1);
  const [c] = await db.insert(chats).values({ teamId, holdingId, createdBy: user.id }).returning({ id: chats.id });
  redirect(`/t/${team.slug}/agent/${c.id}`);
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
  // A holding chat returns to its board; a team-wide chat returns to the index.
  redirect(h ? `/t/${team.slug}/agent/h/${h.ticker}` : `/t/${team.slug}/agent`);
}
