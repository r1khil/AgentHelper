import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { LedgerButton, LEDGER_HREF } from "@/components/app/attribution/attribution-panels";
import { FundAttributionView } from "@/components/app/attribution/attribution-views";
import type { TeamLookup } from "@/components/app/attribution/contributors-table";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { computeAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries } from "@/lib/attribution/load";
import { INDEX_LABEL } from "@/lib/attribution/sectors";
import { indexCumulative, indexReturn, periodFromQuery, qualityNotices, sectorEffectPoints } from "@/lib/attribution/view";
import { listAccessibleTeams, requireRole, transparencyEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "Fund attribution" };

/** Before there is anything to attribute: the Ledger stays one click away. */
function NotYet({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex justify-end"><LedgerButton /></div>
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
        Attribution is calculated from the trade ledger. Record the Fund&apos;s positions and cash to begin.
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
        sectorEffects={sectorEffectPoints(result)}
        weightsAsOf={loaded.weightSets.at(-1)?.asOf}
      />
    </>
  );
}
