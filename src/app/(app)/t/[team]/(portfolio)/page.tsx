import type { Metadata } from "next";
import { getTeamBySlug, loadScope } from "@/lib/teams";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { parseHoldingFilter } from "@/components/app/holdings/holdings-toolbar";
import { FundPositions, TeamPositions } from "@/components/app/portfolio/positions-view";

export async function generateMetadata({ params }: { params: Promise<{ team: string }> }): Promise<Metadata> {
  const { team: slug } = await params;
  if (slug === FUND_SCOPE_SLUG) return { title: "Portfolio" };
  // The team's name, not its URL slug ("Consumer", not "consumer"). The layout checks access.
  const team = await getTeamBySlug(slug);
  return { title: team?.name ?? "Portfolio" };
}

/** Portfolio, Positions: the fund's positions by team, or one team's positions and the holdings it covers. */
export default async function PositionsPage({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<{ filter?: string | string[] }> }) {
  const [{ team: slug }, sp] = await Promise.all([params, searchParams]);
  const scope = await loadScope(slug);
  if (scope.kind === "fund") return <FundPositions scope={scope} />;
  return <TeamPositions scope={scope} filter={parseHoldingFilter(sp.filter)} />;
}
