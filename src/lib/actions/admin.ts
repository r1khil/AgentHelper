"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { invitations, profiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ROLES } from "@/lib/constants";
import { createPasswordAccount, passwordAccountSchema } from "@/lib/members";
import { AGENT_BACKUP_MODEL_SETTING, AGENT_MODEL_SETTING, agentModelLabel, isAgentModelId } from "@/lib/agent/model";
import { EMBEDDING_MODEL_SETTING, RERANK_MODEL_SETTING, embeddingLabel, isEmbeddingModelId, isRerankModelId, rerankLabel } from "@/lib/agent/retrieval-models";
import { ensureEmbeddingIndex } from "@/lib/documents/search";
import { setSetting } from "@/lib/settings";
import { WEEKLY_RECIPIENTS_SETTING } from "@/lib/weekly/email";

const roleSchema = z.enum(ROLES as [string, ...string[]]);
const teamSchema = z.string().uuid().nullable();

function back(message?: string, ok = false): never {
  const q = message ? `?${ok ? "ok" : "error"}=${encodeURIComponent(message)}` : "";
  redirect(`/admin${q}`);
}

/** The settings on the Jobs and connections tab come back to that tab. */
function backJobs(message: string, ok = false): never {
  redirect(`/admin?tab=jobs&${ok ? "ok" : "error"}=${encodeURIComponent(message)}`);
}

function teamFrom(fd: FormData) {
  const v = String(fd.get("teamId") ?? "");
  return v ? v : null;
}

export async function inviteMember(fd: FormData) {
  const admin = await requireAdmin();
  const parsed = z
    .object({ email: z.string().email(), fullName: z.string().trim().min(1).max(120), role: roleSchema, teamId: teamSchema })
    .safeParse({ email: String(fd.get("email") ?? "").trim().toLowerCase(), fullName: fd.get("fullName"), role: fd.get("role"), teamId: teamFrom(fd) });
  if (!parsed.success) back("Check the invitation fields");
  const { email, fullName, role, teamId } = parsed.data;
  const existing = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
  if (existing.length) back("That email already has an account");
  await db
    .insert(invitations)
    .values({ email, fullName, role: role as (typeof ROLES)[number], teamId, invitedBy: admin.id })
    .onConflictDoUpdate({ target: invitations.email, set: { fullName, role: role as (typeof ROLES)[number], teamId, invitedBy: admin.id, acceptedAt: null } });
  revalidatePath("/admin");
  back(`Invited ${email}. They can now sign in with Google.`, true);
}

export async function revokeInvitation(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  await db.delete(invitations).where(eq(invitations.id, id));
  revalidatePath("/admin");
  back();
}

export async function createTestAccount(fd: FormData) {
  await requireAdmin();
  const parsed = passwordAccountSchema.safeParse({
    username: fd.get("username"),
    password: fd.get("password"),
    fullName: fd.get("fullName"),
    role: fd.get("role"),
    teamId: teamFrom(fd),
  });
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? "Check the account fields");
  const result = await createPasswordAccount({ db, supabase: createSupabaseAdmin() }, parsed.data);
  if (!result.ok) back(result.error);
  revalidatePath("/admin");
  back(`Created ${parsed.data.username}`, true);
}

export async function updateMember(fd: FormData) {
  const admin = await requireAdmin();
  const parsed = z
    .object({ id: z.string().uuid(), role: roleSchema, teamId: teamSchema })
    .safeParse({ id: fd.get("id"), role: fd.get("role"), teamId: teamFrom(fd) });
  if (!parsed.success) back("Check the member fields");
  const { id, role, teamId } = parsed.data;
  if (id === admin.id && role !== "admin") back("You cannot remove your own admin role");
  await db.update(profiles).set({ role: role as (typeof ROLES)[number], teamId }).where(eq(profiles.id, id));
  revalidatePath("/admin");
  back("Saved", true);
}

export async function removeMember(fd: FormData) {
  const admin = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (id === admin.id) back("You cannot remove yourself");
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(id); // profile cascades
  if (error) back(error.message);
  revalidatePath("/admin");
  back("Removed", true);
}

export async function resetTestPassword(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) back("Password must be at least 8 characters");
  const { error } = await createSupabaseAdmin().auth.admin.updateUserById(id, { password });
  if (error) back(error.message);
  back("Password updated", true);
}

export async function setAgentModel(fd: FormData) {
  const me = await requireAdmin();
  const primary = String(fd.get("model") ?? "");
  const backup = String(fd.get("backup") ?? "");
  if (!isAgentModelId(primary) || !isAgentModelId(backup)) backJobs("Pick one of the listed models", false);
  await setSetting(AGENT_MODEL_SETTING, primary, me.id);
  await setSetting(AGENT_BACKUP_MODEL_SETTING, backup, me.id);
  revalidatePath("/admin");
  backJobs(
    primary === backup ? `Hoot switched to ${agentModelLabel(primary)} with no backup` : `Hoot switched to ${agentModelLabel(primary)}, backup ${agentModelLabel(backup)}`,
    true,
  );
}

/** Switching the embedding model requeues every document; the partial HNSW index for the model is created up front. */
export async function setEmbeddingModel(fd: FormData) {
  const me = await requireAdmin();
  const id = String(fd.get("model") ?? "");
  if (!isEmbeddingModelId(id)) backJobs("Pick one of the listed embedding models", false);
  try {
    await ensureEmbeddingIndex(id);
  } catch (e) {
    backJobs(`Could not prepare the vector index for ${embeddingLabel(id)}: ${e instanceof Error ? e.message : String(e)}`, false);
  }
  await setSetting(EMBEDDING_MODEL_SETTING, id, me.id);
  revalidatePath("/admin");
  backJobs(`Embeddings switched to ${embeddingLabel(id)}. Documents are re-embedded a few at a time in the background; press "Re-embed now" to start.`, true);
}

export async function setRerankModel(fd: FormData) {
  const me = await requireAdmin();
  const id = String(fd.get("model") ?? "");
  if (!isRerankModelId(id)) backJobs("Pick one of the listed rerank options", false);
  await setSetting(RERANK_MODEL_SETTING, id, me.id);
  revalidatePath("/admin");
  backJobs(`Reranking set to ${rerankLabel(id)}`, true);
}

/** Who Hoot emails the weekly pack to: the first address in To, the rest in CC. Blank means Aadi, with Saad in CC. */
export async function setWeeklyRecipients(fd: FormData) {
  const me = await requireAdmin();
  const raw = String(fd.get("recipients") ?? "").trim();
  const emails = raw.split(/[,\n]/).map((e) => e.trim()).filter(Boolean);
  const bad = emails.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bad) backJobs(`"${bad}" is not an email address`, false);
  await setSetting(WEEKLY_RECIPIENTS_SETTING, emails.join(", "), me.id);
  revalidatePath("/admin");
  backJobs(emails.length ? `The weekly email goes to ${emails.join(", ")}` : "The weekly email goes to Aadi, with Saad in CC", true);
}
