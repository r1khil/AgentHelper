import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, teams, type Profile, type Role, type Team } from "@/db/schema";
import { createSupabaseServer } from "@/lib/supabase/server";

export type CurrentUser = Profile & { team: Team | null };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const rows = await db
    .select({ profile: profiles, team: teams })
    .from(profiles)
    .leftJoin(teams, eq(teams.id, profiles.teamId))
    .where(eq(profiles.id, user.id))
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

export function isFundWide(user: Pick<Profile, "role">) {
  return user.role === "exec" || user.role === "admin";
}

export function canAccessTeam(user: Pick<Profile, "role" | "teamId">, teamId: string) {
  return isFundWide(user) || user.teamId === teamId;
}

export function canManageTeam(user: Pick<Profile, "role" | "teamId">, teamId: string) {
  if (user.role === "admin" || user.role === "exec") return true;
  return user.role === "lead_analyst" && user.teamId === teamId;
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
