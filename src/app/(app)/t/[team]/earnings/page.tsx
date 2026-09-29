import { redirect } from "next/navigation";
import { marketsHref } from "@/app/(app)/markets/types";
import { FUND_SCOPE_SLUG } from "@/lib/constants";

/**
 * The Calendar's Earnings tab is Markets now, on the same team. The Show filters and the Sector view carry over as the
 * bellwether toggle; the layouts (week, month, list) and the Industry view don't exist there, so they are dropped. One
 * report's page (earnings/[id]) stays where it is.
 */
export default async function EarningsPage({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ team }, sp] = await Promise.all([params, searchParams]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const show = one(sp.show)?.split(",") ?? [];
  const scope = one(sp.scope) ?? one(sp.view);
  // A team's calendar opens Markets on that team (Markets checks the reader may see it).
  redirect(marketsHref({ team: team === FUND_SCOPE_SLUG ? null : team, bellwethers: show.includes("bellwethers") || scope === "sector" || scope === "industry" }));
}
