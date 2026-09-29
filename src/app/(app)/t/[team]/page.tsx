import type { Metadata } from "next";
import { getTeamBySlug, loadScope } from "@/lib/teams";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { parseHoldingFilter } from "@/components/app/holdings/holdings-toolbar";
import { FundOverview } from "./fund-overview";
import { TeamPage } from "./team-page";

export async function generateMetadata({ params }: { params: Promise<{ team: string }> }): Promise<Metadata> {
  const { team: slug } = await params;
  if (slug === FUND_SCOPE_SLUG) return { title: "Portfolio" };
  // The team's name, not its URL slug ("Consumer", not "consumer"). The page itself checks access.
  const team = await getTeamBySlug(slug);
  return { title: team?.name ?? "Team" };
}

/** `/t/fund` is the Portfolio overview; any other slug is that team's page. */
export default async function TeamRoute({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<{ filter?: string | string[] }> }) {
  const [{ team: slug }, sp] = await Promise.all([params, searchParams]);
  const scope = await loadScope(slug);
  if (scope.kind === "fund") return <FundOverview user={scope.user} />;
  return <TeamPage scope={scope} filter={parseHoldingFilter(sp.filter)} />;
}
