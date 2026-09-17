import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams } from "@/db/schema";
import { requireTeamAccess } from "@/lib/auth";

export const getTeamBySlug = cache(async (slug: string) => {
  const [team] = await db.select().from(teams).where(eq(teams.slug, slug)).limit(1);
  return team ?? null;
});

/** Load a team by slug and enforce access. 404s for unknown slugs; redirects home for inaccessible teams. */
export async function loadTeam(slug: string) {
  const team = await getTeamBySlug(slug);
  if (!team) notFound();
  const user = await requireTeamAccess(team.id);
  return { team, user };
}
