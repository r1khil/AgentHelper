import { redirect } from "next/navigation";
import { withQuery } from "@/components/app/portfolio/redirects";
import { isFundWide, listAccessibleTeams, requireOnboardedUser } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { rememberedScope } from "@/lib/teams";

/**
 * Backtesting is the Portfolio's What if view now. Old links, and the Risk view's "trim" and stress-test links, keep
 * their scenario, trade and dates, and open in the scope the member was last in (the fund for execs and admins
 * otherwise, their own team for everyone else).
 */
export default async function BacktestingPage({ searchParams }: PageProps<"/backtesting">) {
  const user = await requireOnboardedUser();
  const [query, remembered, teams] = await Promise.all([searchParams, rememberedScope(user), listAccessibleTeams(user)]);
  const own = teams.find((t) => t.id === user.teamId) ?? teams[0];
  const scope = remembered ?? (isFundWide(user) ? FUND_SCOPE_SLUG : own?.slug);
  redirect(scope ? withQuery(`/t/${scope}/what-if`, query) : "/");
}
