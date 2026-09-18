import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { ContributorsTable, type TeamLookup } from "@/components/app/attribution/contributors-table";
import { CumulativeActiveChart } from "@/components/app/attribution/cumulative-active-chart";
import { DataQualityNotices } from "@/components/app/attribution/data-quality-notice";
import { EXPLAIN } from "@/components/app/attribution/explainers";
import { BPS_NOTE, fmtBps, fmtSigned } from "@/components/app/attribution/format";
import { Explained } from "@/components/app/attribution/info-tip";
import { PeriodSelector } from "@/components/app/attribution/period-selector";
import { SectorEffectsChart } from "@/components/app/attribution/sector-effects-chart";
import { SectorTable } from "@/components/app/attribution/sector-table";
import { StatTile } from "@/components/app/attribution/stat-tile";
import { TeamTable } from "@/components/app/attribution/team-table";
import { computeAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries } from "@/lib/attribution/load";
import { INDEX_LABEL } from "@/lib/attribution/sectors";
import { indexCumulative, indexReturn, periodFromQuery, qualityNotices, sectorEffectPoints } from "@/lib/attribution/view";
import { listAccessibleTeams, requireRole, transparencyEnabled } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Fund attribution" };

const ledgerButton = (
  <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/attribution/ledger" />}>
    <BookOpenText />
    Ledger
  </Button>
);

export default async function AttributionPage({ searchParams }: PageProps<"/attribution">) {
  const user = await requireRole("exec", "admin");
  const [query, loaded, teamList] = await Promise.all([searchParams, loadAttributionSeries(), listAccessibleTeams(user)]);
  const teams: TeamLookup = new Map(teamList.map((t) => [t.id, { name: t.name, slug: t.slug }]));

  if (!loaded.inception) {
    return (
      <>
        <PageHeader title="Attribution" description="vs S&P 500 sector benchmark" actions={ledgerButton} />
        <EmptyState title="No trades recorded" action={<Button nativeButton={false} size="sm" render={<Link href="/attribution/ledger" />}>Open ledger</Button>}>
          Attribution is calculated from the trade ledger. Record the Fund&apos;s positions and cash to begin.
        </EmptyState>
      </>
    );
  }
  if (!loaded.latest) {
    return (
      <>
        <PageHeader title="Attribution" description="vs S&P 500 sector benchmark" actions={ledgerButton} />
        <EmptyState title="Price history is still loading">
          Closes for the ledger&apos;s tickers and the sector ETFs have not been stored yet. They load after each ledger change and every weeknight.
        </EmptyState>
      </>
    );
  }

  const { period, queryString, from, to } = periodFromQuery(query, { inception: loaded.inception, latest: loaded.latest });
  const result = computeAttribution(loaded.series, period);
  const notices = qualityNotices(loaded, period, { canEdit: true });
  const showAll = query.all === "1";
  const top = result.holdings.slice(0, 5);
  const bottom = result.holdings.slice(-5).reverse().filter((h) => !top.includes(h));
  const spx = indexReturn(loaded, period);
  const active = spx === null ? null : result.portfolioReturn - spx;
  if (spx === null && result.days > 0) {
    notices.push({ text: `${INDEX_LABEL} index closes for this period have not been stored yet. The headline comparison appears after the next price run.` });
  }
  const spxSeries = indexCumulative(loaded, period, result.cumulative.map((c) => c.date));
  const transparency = transparencyEnabled(user);

  return (
    <>
      <PageHeader
        title="Attribution"
        description={`vs S&P 500 sector benchmark · ${fmtDate(period.start)} close through ${fmtDate(period.end)}`}
        actions={ledgerButton}
      />
      <div className="mb-4">
        <PeriodSelector basePath="/attribution" active={period.key} from={from} to={to} />
      </div>
      <DataQualityNotices notices={notices} />

      {result.days === 0 ? (
        <EmptyState title="No completed trading days in this period">
          The ledger opens at the {fmtDate(loaded.inception)} close. Results appear after the next session&apos;s closing prices load.
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Portfolio" value={result.portfolioReturn} explain={EXPLAIN.portfolio} />
            <StatTile label={INDEX_LABEL} value={spx} explain={EXPLAIN.index} />
            <StatTile label="Active return" value={active} unit="bps" emphasis hint={`vs ${INDEX_LABEL}`} explain={EXPLAIN.active} />
            <StatTile label="Allocation" value={result.effects?.allocation ?? null} unit="bps" hint="Sector weights · vs sector benchmark" explain={EXPLAIN.allocation} />
            <StatTile label="Selection" value={result.effects?.selection ?? null} unit="bps" hint="Picks within sectors · vs sector benchmark" explain={EXPLAIN.selection} />
            <StatTile label="Interaction" value={result.effects?.interaction ?? null} unit="bps" hint="Weight × pick · vs sector benchmark" explain={EXPLAIN.interaction} />
          </div>
          {result.benchmarkReturn !== null && result.activeReturn !== null && (
            <p className="-mt-3 mb-6 text-xs text-muted-foreground">
              <Explained label="Sector benchmark">{EXPLAIN.benchmark}</Explained> returned {fmtSigned(result.benchmarkReturn)} over the period. Allocation, selection and interaction are
              measured against it and add up to {fmtBps(result.activeReturn)} of active return on that basis.
            </p>
          )}

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <SectionTitle><Explained label="Effects by sector">{EXPLAIN.effectsChart}</Explained></SectionTitle>
              {result.effects ? <SectorEffectsChart data={sectorEffectPoints(result)} /> : <div className="text-sm text-muted-foreground">Add S&amp;P 500 sector weights to see allocation and selection.</div>}
            </Card>
            <Card className="p-4">
              <SectionTitle><Explained label={`Fund vs ${INDEX_LABEL}`}>{EXPLAIN.cumulativeChart}</Explained></SectionTitle>
              <CumulativeActiveChart
                portfolioLabel="Owl Fund"
                benchmarkLabel={INDEX_LABEL}
                data={result.cumulative.map((c, i) => ({ date: c.date, portfolio: c.portfolio * 100, benchmark: spxSeries[i] === null ? null : spxSeries[i] * 100 }))}
              />
            </Card>
          </div>

          <SectionTitle aside={BPS_NOTE}>Sectors</SectionTitle>
          <div className="mb-6"><SectorTable result={result} breakdownQuery={transparency ? { basePath: "/attribution", period: period.key, from, to } : undefined} /></div>

          {showAll ? (
            <>
              <SectionTitle aside={<Link href={`/attribution${queryString}`} className="hover:underline">Show top and bottom 5</Link>}>All holdings by contribution</SectionTitle>
              <div className="mb-6"><ContributorsTable rows={result.holdings} teams={teams} /></div>
            </>
          ) : (
            <div className="mb-6 grid gap-4 lg:grid-cols-2">
              <div>
                <SectionTitle><Explained label="Top contributors">{EXPLAIN.contributors}</Explained></SectionTitle>
                <ContributorsTable rows={top} teams={teams} />
              </div>
              <div>
                <SectionTitle aside={<Link href={`/attribution${queryString}&all=1`} className="hover:underline">Show all {result.holdings.length}</Link>}>Bottom contributors</SectionTitle>
                <ContributorsTable rows={bottom} teams={teams} />
              </div>
            </div>
          )}

          <SectionTitle><Explained label="Teams">{EXPLAIN.teams}</Explained></SectionTitle>
          <div className="mb-6"><TeamTable rows={result.teams} teams={teams} cashContribution={result.cashContribution} query={queryString} /></div>

          <p className="text-xs text-muted-foreground">
            Headline comparison is against the S&amp;P 500 index on a price-return basis, the same as the major-movement rule. Allocation and selection are
            Brinson-Fachler by GICS sector, daily, Carino-linked, against a sector benchmark of saved S&amp;P 500 sector weights applied to Select Sector SPDR total returns
            {loaded.weightSets.length ? ` (weights as of ${fmtDate(loaded.weightSets.at(-1)!.asOf)})` : ""}. Fund dividends reinvest on the ex-date.
            {transparency && " Transparency mode is on: expand a sector row to see the daily working and the stored rows behind it."}
          </p>
        </>
      )}
    </>
  );
}
