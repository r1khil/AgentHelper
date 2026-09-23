import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, teams, type Profile, type Role, type Team } from "@/db/schema";
import { createSupabaseServer } from "@/lib/supabase/server";
import { canAccessTeam, isFundWide } from "./roles";

export type CurrentUser = Profile & { team: Team | null };

// The pure role checks live in ./roles so scripts and tools can use them without Next's request APIs.
export { canAccessTeam, canManageTeam, isFundWide, transparencyEnabled } from "./roles";

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServer();
  // getClaims verifies the ES256 access token locally against the project's JWKS (cached per instance), so a
  // render costs no round trip to the Auth server; getUser made one on every page. proxy.ts has already
  // refreshed the session cookie for this request.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;
  const rows = await db
    .select({ profile: profiles, team: teams })
    .from(profiles)
    .leftJoin(teams, eq(teams.id, profiles.teamId))
    .where(eq(profiles.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row.profile, team: row.team };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For app pages: signed in and finished first-sign-in setup. */
export async function requireOnboardedUser(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.onboardedAt) redirect("/onboarding");
  return user;
}

export async function requireTeamAccess(teamId: string) {
  const user = await requireUser();
  if (!canAccessTeam(user, teamId)) redirect("/");
  return user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

export async function requireAdmin() {
  return requireRole("admin");
}

export const listAccessibleTeams = cache(async (user: CurrentUser): Promise<Team[]> => {
  if (isFundWide(user)) return db.select().from(teams).orderBy(teams.sortOrder);
  return user.team ? [user.team] : [];
});
