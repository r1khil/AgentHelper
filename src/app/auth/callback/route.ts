import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { db } from "@/db/client";
import { invitations, profiles } from "@/db/schema";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (!code) return NextResponse.redirect(`${origin}/login?error=Missing+sign-in+code`);

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error?.message ?? "Sign-in failed")}`);

  const user = data.user;
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
