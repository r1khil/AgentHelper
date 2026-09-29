import type { Metadata } from "next";
import { requireOnboardedUser } from "@/lib/auth";
import { calendarFactorContext } from "@/lib/risk/factor-context";
import { IndexCard } from "./index-card";
import { loadMarkets } from "./load";
import { MarketsView } from "./markets-view";
import { parseMarketsQuery } from "./types";

export const metadata: Metadata = { title: "Markets" };

/**
 * Markets: the fund's earnings reports and the economic releases on one schedule (what the Calendar's Earnings and
 * Economic releases tabs and Home's This week showed). The earnings load here; the releases stream in on the client.
 */
export default async function MarketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, sp] = await Promise.all([requireOnboardedUser(), searchParams]);
  const query = parseMarketsQuery(sp);
  const data = await loadMarkets(user, query);
  return (
    <MarketsView
      {...data}
      query={query}
      // Not awaited: the page renders at once and the factor lines stream in when the risk report is ready.
      factorContext={calendarFactorContext(user)}
      // Streams in after the page: the view holds it in a Suspense boundary with the card's skeleton.
      todayCard={<IndexCard />}
    />
  );
}
