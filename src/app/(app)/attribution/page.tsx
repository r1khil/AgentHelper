import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { rangeControlClass, RangeControlGroup } from "@/components/charts/primitives";
import { ActiveReturnCard } from "@/components/app/attribution/active-return-card";
import { ContributorsTable, type TeamLookup } from "@/components/app/attribution/contributors-table";
import { CumulativeActiveChart } from "@/components/app/attribution/cumulative-active-chart";
import { DataNoticesButton } from "@/components/app/attribution/data-quality-notice";
import { EffectsWaterfall } from "@/components/app/attribution/effects-waterfall";
import { EXPLAIN } from "@/components/app/attribution/explainers";
import { BPS_NOTE, fmtBps, fmtBpsShort, fmtSigned } from "@/components/app/attribution/format";
import { HoldingsColumn } from "@/components/app/attribution/holdings-columns";
import { Explained } from "@/components/app/attribution/info-tip";
import { PeriodSelector } from "@/components/app/attribution/period-selector";
import { SectorEffectsList } from "@/components/app/attribution/sector-effects-list";
import { SectorTable } from "@/components/app/attribution/sector-table";
import { TeamTable } from "@/components/app/attribution/team-table";
import { computeAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries } from "@/lib/attribution/load";
import { PERIOD_LABELS } from "@/lib/attribution/periods";
import { bucketLabel, INDEX_LABEL } from "@/lib/attribution/sectors";
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

function Legend({ asOf }: { asOf: string }) {
  const items = [
    { label: "Owl Fund", color: "var(--series-1)" },
    { label: `${INDEX_LABEL} price`, color: "var(--muted-foreground)" },
    { label: "Sector benchmark", color: "var(--series-2)" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full" style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
      <span>Prices as of {fmtDate(asOf)} close</span>
    </div>
  );
}

export default async function AttributionPage({ searchParams }: PageProps<"/attribution">) {
  const user = await requireRole("exec", "admin");
  const [query, loaded, teamList] = await Promise.all([searchParams, loadAttributionSeries(), listAccessibleTeams(user)]);
  const teams: TeamLookup = new Map(teamList.map((t) => [t.id, { name: t.name, slug: t.slug }]));

  if (!loaded.inception) {
    return (
      <>
        <PageHeader title="Fund attribution" description="vs S&P 500 sector benchmark" actions={ledgerButton} />
        <EmptyState title="No trades recorded" action={<Button nativeButton={false} size="sm" render={<Link href="/attribution/ledger" />}>Open ledger</Button>}>
          Attribution is calculated from the trade ledger. Record the Fund&apos;s positions and cash to begin.
        </EmptyState>
      </>
    );
  }
  if (!loaded.latest) {
    return (
      <>
        <PageHeader title="Fund attribution" description="vs S&P 500 sector benchmark" actions={ledgerButton} />
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

  // Cash sits in `sectors` as its own bucket when the Fund held any; its allocation is the cash drag.
  const cashRow = result.sectors.find((s) => s.key === "cash");
  const leader = result.effects ? [...result.sectors].filter((s) => s.key !== "cash").sort((a, b) => b.selection - a.selection)[0] : undefined;

  return (
    <>
      <PageHeader
        title="Fund attribution"
        description={`${PERIOD_LABELS[period.key]} · ${fmtDate(period.start)} close through ${fmtDate(period.end)} · ${result.days} trading ${result.days === 1 ? "day" : "days"}`}
        actions={<><DataNoticesButton notices={notices} />{ledgerButton}</>}
      />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PeriodSelector basePath="/attribution" active={period.key} from={from} to={to} inception={loaded.inception} latest={loaded.latest} />
        <Legend asOf={loaded.latest} />
      </div>

      {result.days === 0 ? (
        <EmptyState title="No completed trading days in this period">
          The ledger opens at the {fmtDate(loaded.inception)} close. Results appear after the next session&apos;s closing prices load.
        </EmptyState>
      ) : (
        <>
          <section aria-label="Headline" className="mb-4 grid gap-4 lg:grid-cols-12">
            <ActiveReturnCard
              title={`Active return vs ${INDEX_LABEL}`}
              chip="Price return"
              active={active}
              explain={EXPLAIN.active}
              comparison="the index"
              bars={[
                { label: "Owl Fund", value: result.portfolioReturn, color: "var(--series-1)" },
                { label: INDEX_LABEL, value: spx, color: "var(--muted-foreground)" },
              ]}
            />
            <EffectsWaterfall
              title="Where it came from · vs sector benchmark"
              aside={
                result.benchmarkReturn !== null && result.activeReturn !== null ? (
                  <>
                    <Explained label="Sector benchmark">{EXPLAIN.benchmark}</Explained> returned{" "}
                    <span className="tnum font-semibold text-foreground">{fmtSigned(result.benchmarkReturn)}</span> · Fund {fmtBps(result.activeReturn, 0)} against it
                  </>
                ) : undefined
              }
              items={
                result.effects
                  ? [
                      {
                        label: "Allocation",
                        value: result.effects.allocation,
                        explain: EXPLAIN.allocation,
                        hint: cashRow ? `Cash drag ${fmtBpsShort(cashRow.allocation)} · sectors ${fmtBpsShort(result.effects.allocation - cashRow.allocation)}` : undefined,
                      },
                      {
                        label: "Selection",
                        value: result.effects.selection,
                        explain: EXPLAIN.selection,
                        hint: leader && leader.selection > 0 ? `Led by ${bucketLabel(leader.key)} ${fmtBpsShort(leader.selection)}` : undefined,
                      },
                      { label: "Interaction", value: result.effects.interaction, explain: EXPLAIN.interaction, hint: "Weight × pick" },
                    ]
                  : []
              }
              total={
                result.effects && result.activeReturn !== null
                  ? { label: "Active vs sector benchmark", value: result.activeReturn, explain: EXPLAIN.benchmark, hint: "Brinson-Fachler, daily, Carino-linked" }
                  : null
              }
              empty={<>Add S&amp;P 500 sector weights to see allocation and selection.</>}
            />
          </section>

          <section aria-label="Charts" className="mb-6 grid gap-4 lg:grid-cols-12">
            <Card className="p-4 lg:col-span-8">
              <SectionTitle><Explained label={`Cumulative return, Fund vs ${INDEX_LABEL}`}>{EXPLAIN.cumulativeChart}</Explained></SectionTitle>
              <CumulativeActiveChart
                portfolioLabel="Owl Fund"
                benchmarkLabel={INDEX_LABEL}
                data={result.cumulative.map((c, i) => ({ date: c.date, portfolio: c.portfolio * 100, benchmark: spxSeries[i] === null ? null : spxSeries[i] * 100 }))}
              />
            </Card>
            <Card className="p-4 lg:col-span-4">
              <SectionTitle aside="bps"><Explained label="Total effect by sector">{EXPLAIN.effectsChart}</Explained></SectionTitle>
              {result.effects ? <SectorEffectsList data={sectorEffectPoints(result)} /> : <div className="text-sm text-muted-foreground">Add S&amp;P 500 sector weights to see allocation and selection.</div>}
            </Card>
          </section>

          <SectionTitle aside={BPS_NOTE}>Sectors</SectionTitle>
          <div className="mb-6"><SectorTable result={result} breakdownQuery={transparency ? { basePath: "/attribution", period: period.key, from, to } : undefined} /></div>

          <section aria-label="Holdings and teams" className="mb-6 grid gap-4 lg:grid-cols-12">
            <Card className="gap-3 p-4 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold"><Explained label="Holdings by contribution">{EXPLAIN.contributors}</Explained></h2>
                <RangeControlGroup label="Holdings view">
                  <Link href={`/attribution${queryString}`} aria-current={showAll ? undefined : "true"} className={rangeControlClass(!showAll)}>Top &amp; bottom 5</Link>
                  <Link href={`/attribution${queryString}&all=1`} aria-current={showAll ? "true" : undefined} className={rangeControlClass(showAll)}>All {result.holdings.length}</Link>
                </RangeControlGroup>
              </div>
              {showAll ? (
                <ContributorsTable rows={result.holdings} teams={teams} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
                  <HoldingsColumn rows={top} teams={teams} caption="Team · avg weight" />
                  <HoldingsColumn rows={bottom} teams={teams} caption="Team · avg weight" />
                </div>
              )}
            </Card>
            <Card className="gap-3 p-4 lg:col-span-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold"><Explained label="Teams">{EXPLAIN.teams}</Explained></h2>
                <span className="text-xs text-muted-foreground">Contribution to Fund, bps</span>
              </div>
              <TeamTable rows={result.teams} teams={teams} cashContribution={result.cashContribution} cashWeight={cashRow?.avgPortfolioWeight} query={queryString} />
            </Card>
          </section>

          <details className="rounded-xl bg-muted/40 ring-1 ring-foreground/10">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">How this is calculated</summary>
            <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
              Headline comparison is against the S&amp;P 500 index on a price-return basis, the same as the major-movement rule. Allocation and selection are
              Brinson-Fachler by GICS sector, daily, Carino-linked, against a sector benchmark of saved S&amp;P 500 sector weights applied to Select Sector SPDR total returns
              {loaded.weightSets.length ? ` (weights as of ${fmtDate(loaded.weightSets.at(-1)!.asOf)})` : ""}. Fund dividends reinvest on the ex-date.
              {transparency && " Transparency mode is on: expand a sector row to see the daily working and the stored rows behind it."}
            </p>
          </details>
        </>
      )}
    </>
  );
}
