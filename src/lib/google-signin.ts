import "server-only";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { db } from "@/db/client";
import { invitations, profiles } from "@/db/schema";

/**
 * Shared tail of every Google sign-in: a returning member goes straight in,
 * an invited email gets a profile, anyone else is dropped and bounced.
 */
export async function completeGoogleSignIn(supabase: SupabaseClient, user: User, origin: string, next: string) {
  const existing = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (existing.length) return NextResponse.redirect(`${origin}${next}`);

  const email = (user.email ?? "").toLowerCase();
  const [invite] = email
    ? await db.select().from(invitations).where(eq(invitations.email, email)).limit(1)
    : [];

  if (!invite) {
    // Not on the roster: drop the auth user so it does not linger, and bounce.
    await supabase.auth.signOut();
    try {
      await createSupabaseAdmin().auth.admin.deleteUser(user.id);
    } catch {
      // Best effort. Without a profile the user cannot reach anything anyway.
    }
    return NextResponse.redirect(`${origin}/not-invited`);
  }

  const fullName =
    invite.fullName ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    email.split("@")[0];

  await db.transaction(async (tx) => {
    await tx.insert(profiles).values({
      id: user.id,
      email,
      fullName,
      role: invite.role,
      kind: "google",
      teamId: invite.teamId,
    });
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id));
  });

  return NextResponse.redirect(`${origin}${next}`);
}
