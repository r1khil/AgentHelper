import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHead } from "@/components/app/page-head";
import { NeedsYou, OverviewAsOf, OverviewHero, OverviewPositions, OverviewStats, ThisWeek } from "@/components/app/portfolio/overview-sections";
import { OverviewSkeletonBody } from "@/components/app/page-skeletons";
import { TradeDialog } from "@/components/app/attribution/trade-dialog";
import { Button } from "@/components/ui/button";
import { listAccessibleTeams } from "@/lib/auth";
import { loadFundOverview } from "@/lib/portfolio/overview";
import { todayNY } from "@/lib/providers/calendar";
import type { CurrentUser } from "@/lib/auth";

/**
 * Portfolio · Overview: the fund's value and what moved it, a chart of the ledger's history, six numbers that open the
 * tabs explaining them, what needs the reader, and the positions by team. Execs and admins only (loadScope sends
 * everyone else to their team).
 */
export async function FundOverview({ user }: { user: CurrentUser }) {
  const today = todayNY();
  const overview = loadFundOverview();
  const teams = await listAccessibleTeams(user);
  return (
    <>
      <PageHead
        crumbs={[{ label: "Portfolio" }]}
        scope
        asof={
          <Suspense fallback={null}>
            <OverviewAsOf overview={overview} />
          </Suspense>
        }
        actions={
          <Suspense fallback={<Button disabled>Record trade</Button>}>
            <RecordTrade overview={overview} today={today} />
          </Suspense>
        }
      />
      <Suspense fallback={<OverviewSkeletonBody />}>
        <Body overview={overview} user={user} teams={teams} today={today} />
      </Suspense>
    </>
  );
}

/** The page's body waits for the ledger once, so an empty fund reads as empty instead of as three empty sections. */
async function Body({ overview, user, teams, today }: { overview: ReturnType<typeof loadFundOverview>; user: CurrentUser; teams: Awaited<ReturnType<typeof listAccessibleTeams>>; today: string }) {
  const o = await overview;
  if (!o) {
    return (
      <EmptyState title="Nothing in the ledger yet" hoot="wave">
        The Overview is built from the trade ledger and closing prices. Record the opening positions from Activity, or import them from a CSV, and it fills in.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col">
      <OverviewHero overview={overview} today={today} />
      <Suspense fallback={<div className="h-[92px] border-b" />}>
        <OverviewStats overview={overview} />
      </Suspense>
      <div className="grid grid-cols-2 gap-14 pt-[22px] pb-1.5">
        <Suspense fallback={<div className="h-40" aria-hidden />}>
          <NeedsYou user={user} overview={overview} />
        </Suspense>
        <Suspense fallback={<div className="h-40" aria-hidden />}>
          <ThisWeek teams={teams} />
        </Suspense>
      </div>
      <OverviewPositions overview={overview} teams={teams} />
    </div>
  );
}

async function RecordTrade({ overview, today }: { overview: ReturnType<typeof loadFundOverview>; today: string }) {
  const o = await overview;
  return <TradeDialog today={today} positions={(o?.positions ?? []).map((p) => ({ ticker: p.ticker, shares: p.shares }))} primary />;
}
