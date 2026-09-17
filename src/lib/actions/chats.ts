"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, teams } from "@/db/schema";
import { requireTeamAccess, requireUser } from "@/lib/auth";

export async function createChat(fd: FormData) {
  const teamId = String(fd.get("teamId") ?? "");
  const holdingId = String(fd.get("holdingId") ?? "") || null;
  const user = await requireTeamAccess(teamId);
  const [team] = await db.select({ slug: teams.slug }).from(teams).where(eq(teams.id, teamId)).limit(1);
  const [c] = await db.insert(chats).values({ teamId, holdingId, createdBy: user.id }).returning({ id: chats.id });
  redirect(`/t/${team.slug}/agent/${c.id}`);
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
  revalidatePath(`/t/${team.slug}/agent`);
  redirect(`/t/${team.slug}/agent`);
}
