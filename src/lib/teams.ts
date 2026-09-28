import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams, type Team } from "@/db/schema";
import { isFundWide, listAccessibleTeams, requireTeamAccess, requireUser, type CurrentUser } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { canViewScope, SCOPE_COOKIE } from "@/lib/scope";

export const getTeamBySlug = cache(async (slug: string) => {
  const [team] = await db.select().from(teams).where(eq(teams.slug, slug)).limit(1);
  return team ?? null;
});

export const getTeam = cache(async (id: string) => {
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return team ?? null;
});

/** Load a team by slug and enforce access. 404s for unknown slugs; redirects home for inaccessible teams. */
export async function loadTeam(slug: string) {
  const team = await getTeamBySlug(slug);
  if (!team) notFound();
  const user = await requireTeamAccess(team.id);
  return { team, user };
}

/**
 * What a `/t/[team]` list page shows: one sector team, or every team when the slug is the fund scope.
 * `teamIds` feeds the list queries either way; `teamById` resolves each row's own team for links and labels.
 */
export type TeamScope =
  | { kind: "team"; slug: string; team: Team; teamIds: string; teamById: Map<string, Team>; user: CurrentUser }
  | { kind: "fund"; slug: string; team: null; teamIds: string[]; teamById: Map<string, Team>; user: CurrentUser };

/** Like loadTeam, but also accepts the fund scope (exec/admin only; anyone else is sent to their own team). */
export async function loadScope(slug: string): Promise<TeamScope> {
  if (slug !== FUND_SCOPE_SLUG) {
    const { team, user } = await loadTeam(slug);
    return { kind: "team", slug, team, teamIds: team.id, teamById: new Map([[team.id, team]]), user };
  }
  const user = await requireUser();
  if (!isFundWide(user)) redirect(user.team ? `/t/${user.team.slug}` : "/");
  const all = await listAccessibleTeams(user);
  return { kind: "fund", slug, team: null, teamIds: all.map((t) => t.id), teamById: new Map(all.map((t) => [t.id, t])), user };
}

/**
 * A team's own item (a holding, report, call, chat) opened under a scope: its team when the scope shows that team's
 * items (the fund shows every team's, a team only its own), else a 404. Access to the scope itself is loadScope's job.
 */
export function itemTeam(scope: TeamScope, teamId: string): Team {
  const team = scope.teamById.get(teamId);
  if (!team) notFound();
  return team;
}

/**
 * The scope this member was last in, for pages outside /t/ that build links (Today, Hoot's list, a general chat).
 * The shell writes the cookie; it's only a preference, so a slug they can't view reads as none.
 */
export async function rememberedScope(user: CurrentUser): Promise<string | null> {
  const slug = (await cookies()).get(SCOPE_COOKIE)?.value ?? null;
  return canViewScope(slug, await listAccessibleTeams(user), isFundWide(user)) ? slug : null;
}
