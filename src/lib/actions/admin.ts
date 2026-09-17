"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { invitations, profiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ROLES, usernameToEmail } from "@/lib/constants";

const roleSchema = z.enum(ROLES as [string, ...string[]]);
const teamSchema = z.string().uuid().nullable();

function back(message?: string, ok = false): never {
  const q = message ? `?${ok ? "ok" : "error"}=${encodeURIComponent(message)}` : "";
  redirect(`/admin${q}`);
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
  const parsed = z
    .object({
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "3-32 chars: letters, digits, . _ -"),
      password: z.string().min(8).max(72),
      fullName: z.string().trim().min(1).max(120),
      role: roleSchema,
      teamId: teamSchema,
    })
    .safeParse({ username: fd.get("username"), password: fd.get("password"), fullName: fd.get("fullName"), role: fd.get("role"), teamId: teamFrom(fd) });
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? "Check the account fields");
  const { username, password, fullName, role, teamId } = parsed.data;
  const email = usernameToEmail(username);
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });
  if (error || !data.user) back(error?.message ?? "Could not create the account");
  const authUser = data.user;
  try {
    await db.insert(profiles).values({ id: authUser.id, email, username, fullName, role: role as (typeof ROLES)[number], kind: "password", teamId });
  } catch (e) {
    await supabase.auth.admin.deleteUser(authUser.id);
    back(e instanceof Error ? e.message : "Could not create the profile");
  }
  revalidatePath("/admin");
  back(`Created ${username}`, true);
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
