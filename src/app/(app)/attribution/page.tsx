import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { LEDGER_HREF } from "@/components/app/attribution/attribution-panels";
import { FundAttributionView } from "@/components/app/attribution/attribution-views";
import type { TeamLookup } from "@/components/app/attribution/contributors-table";
import { TODAY_KEY } from "@/components/app/attribution/period-selector";
import { TodayView } from "@/components/app/daily/today-view";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { computeAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries } from "@/lib/attribution/load";
import { loadLiveSnapshot } from "@/lib/attribution/live-load";
import { INDEX_LABEL } from "@/lib/attribution/sectors";
import { indexCumulative, indexReturn, periodFromQuery, qualityNotices } from "@/lib/attribution/view";
import { listAccessibleTeams, requireRole, transparencyEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "Performance" };

/** Before there is anything to attribute: the empty state, and the Ledger one click away. */
function NotYet({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <EmptyState title={title} action={action}>{children}</EmptyState>
    </div>
  );
}

export default async function AttributionPage({ searchParams }: PageProps<"/attribution">) {
  const user = await requireRole("exec", "admin");
  const [query, loaded, teamList] = await Promise.all([searchParams, loadAttributionSeries(), listAccessibleTeams(user)]);
  const teams: TeamLookup = new Map(teamList.map((t) => [t.id, { name: t.name, slug: t.slug }]));

  if (!loaded.inception) {
    return (
      <NotYet title="No trades recorded" action={<Button nativeButton={false} size="sm" render={<Link href={LEDGER_HREF} />}>Open ledger</Button>}>
        Performance is calculated from the trade ledger. Record the Fund&apos;s positions and cash to begin.
      </NotYet>
    );
  }
  if (!loaded.latest) {
    return (
      <NotYet title="Price history is still loading">
        Closes for the ledger&apos;s tickers and the sector ETFs have not been stored yet. They load after each ledger change and every weeknight.
      </NotYet>
    );
  }

  // Today: the live session, the old Daily page. Same page, same period buttons.
  const asked = Array.isArray(query.period) ? query.period[0] : query.period;
  if (asked === TODAY_KEY) {
    const snapshot = await loadLiveSnapshot({});
    if (!snapshot) {
      return (
        <NotYet title="Nothing to show yet">Today&apos;s performance starts once the ledger has positions and their closing prices have loaded.</NotYet>
      );
    }
    const closed = periodFromQuery({ period: "1d" }, { inception: loaded.inception, latest: loaded.latest });
    // The live numbers use the same saved sector weights, so a stale set is worth a word here too.
    const notices = qualityNotices(loaded, closed.period, { canEdit: true }).filter((n) => n.word === "Stale" || n.text.startsWith("No S&P 500 sector weights"));
    return (
      <TodayView
        initial={snapshot}
        scope={{ kind: "fund" }}
        teams={teamList.map((t) => [t.id, { name: t.name, slug: t.slug }])}
        period={{ basePath: "/attribution", inception: loaded.inception, latest: loaded.latest }}
        notices={notices}
      />
    );
  }

  const { period, queryString, from, to } = periodFromQuery(query, { inception: loaded.inception, latest: loaded.latest });
  const result = computeAttribution(loaded.series, period);
  const notices = qualityNotices(loaded, period, { canEdit: true });
  const spx = indexReturn(loaded, period);
  if (spx === null && result.days > 0) {
    notices.push({ text: `${INDEX_LABEL} index closes for this period have not been stored yet. The headline comparison appears after the next price run.` });
  }

  return (
    <>
      <PageContextPublisher value={{ kind: "attribution", path: "/attribution", title: "Fund attribution", scope: "fund", period: period.key, from, to, start: period.start, end: period.end }} />
      <FundAttributionView
        view={{ basePath: "/attribution", period, from, to, queryString, inception: loaded.inception, latest: loaded.latest }}
        result={result}
        spx={spx}
        spxSeries={indexCumulative(loaded, period, result.cumulative.map((c) => c.date))}
        teams={teams}
        notices={notices}
        showAll={query.all === "1"}
        transparency={transparencyEnabled(user)}
        weightsAsOf={loaded.weightSets.at(-1)?.asOf}
      />
    </>
  );
}
