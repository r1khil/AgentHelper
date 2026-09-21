"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, holdings, teams } from "@/db/schema";
import { canManageTeam, requireTeamAccess, requireUser } from "@/lib/auth";
import { deleteMemoryRow, getMemory } from "@/lib/agent/memory/store";

/** Remove one research-log entry. Leads, execs and admins may remove any; an analyst may remove entries from their own chats. */
export async function deleteMemory(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const user = await requireUser();
  const row = await getMemory(id);
  if (!row) return;
  const [h] = row.holdingId ? await db.select({ teamId: holdings.teamId, ticker: holdings.ticker }).from(holdings).where(eq(holdings.id, row.holdingId)).limit(1) : [];
  const teamId = row.teamId ?? h?.teamId ?? null;
  if (teamId) await requireTeamAccess(teamId);
  else if (user.role !== "admin") return;
  let allowed = teamId ? canManageTeam(user, teamId) : user.role === "admin";
  if (!allowed && row.sourceChatId) {
    const [c] = await db.select({ createdBy: chats.createdBy }).from(chats).where(eq(chats.id, row.sourceChatId)).limit(1);
    allowed = c?.createdBy === user.id;
  }
  if (!allowed) return;
  await deleteMemoryRow(id);
  if (teamId && h) {
    const [team] = await db.select({ slug: teams.slug }).from(teams).where(eq(teams.id, teamId)).limit(1);
    if (team) revalidatePath(`/t/${team.slug}/agent/h/${h.ticker}`);
  }
}
