import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { ContributorsTable, type TeamLookup } from "@/components/app/attribution/contributors-table";
import { CumulativeActiveChart } from "@/components/app/attribution/cumulative-active-chart";
import { DataQualityNotices } from "@/components/app/attribution/data-quality-notice";
import { EXPLAIN } from "@/components/app/attribution/explainers";
import { Explained } from "@/components/app/attribution/info-tip";
import { PeriodSelector } from "@/components/app/attribution/period-selector";
import { SectorEffectsChart } from "@/components/app/attribution/sector-effects-chart";
import { SectorTable } from "@/components/app/attribution/sector-table";
import { StatTile } from "@/components/app/attribution/stat-tile";
import { computeTeamAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { ETF_BY_SECTOR, SECTOR_LABELS } from "@/lib/attribution/sectors";
import { periodFromQuery, qualityNotices, sectorEffectPoints } from "@/lib/attribution/view";
import { canManageTeam, isFundWide, transparencyEnabled } from "@/lib/auth";
import { BPS_NOTE } from "@/components/app/attribution/format";
import { fmtDate } from "@/lib/format";
import { loadTeam } from "@/lib/teams";

export const metadata: Metadata = { title: "Attribution" };

export default async function TeamAttributionPage({ params, searchParams }: PageProps<"/t/[team]/attribution">) {
  const { team, user } = await loadTeam((await params).team);
  // Position sizes and P&L are for leads and fund-wide roles.
  if (!canManageTeam(user, team.id)) redirect(`/t/${team.slug}`);

  const [query, loaded, sectorMap] = await Promise.all([searchParams, loadAttributionSeries(), loadTeamSectors()]);
  const base = `/t/${team.slug}/attribution`;
  const canEdit = isFundWide(user);
  const sectors = sectorMap.get(team.id) ?? [];
  const benchmarkName = sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "no sectors assigned";

  if (!loaded.inception || !loaded.latest) {
    return (
      <>
        <PageHeader title="Attribution" description={team.name} />
        <EmptyState title={loaded.inception ? "Price history is still loading" : "No trades recorded"}>
          {loaded.inception ? "Closing prices load after each ledger change and every weeknight." : canEdit ? <Link href="/attribution/ledger" className="underline underline-offset-2">Open the ledger</Link> : "An exec records the Fund's trades in the ledger."}
        </EmptyState>
      </>
    );
  }

  const { period, from, to } = periodFromQuery(query, { inception: loaded.inception, latest: loaded.latest });
  const result = computeTeamAttribution(loaded.series, period, team.id, sectors);
  const teams: TeamLookup = new Map([[team.id, { name: team.name, slug: team.slug }]]);
  const teamTickers = new Set(result.holdings.map((h) => h.ticker));
  const notices = qualityNotices(loaded, period, { canEdit }).filter((n) => !n.text.startsWith("No sector set") || [...teamTickers].some((t) => n.text.includes(t)));
  if (!sectors.length) notices.unshift({ text: "No GICS sectors are assigned to this team, so it has no benchmark.", href: canEdit ? "/attribution/ledger?tab=securities" : undefined, action: "Assign sectors" });
  const selection = result.effects ? result.effects.selection + result.effects.interaction : null;
  const transparency = transparencyEnabled(user);

  return (
    <>
      <PageHeader
        title="Attribution"
        description={`${team.name} vs ${sectors.length ? sectors.map((s) => SECTOR_LABELS[s]).join(", ") : "—"} (${benchmarkName}) · ${fmtDate(period.start)} close through ${fmtDate(period.end)}`}
      />
      <div className="mb-4">
        <PeriodSelector basePath={base} active={period.key} from={from} to={to} inception={loaded.inception} latest={loaded.latest} />
      </div>
      <DataQualityNotices notices={notices} />

      {result.days === 0 ? (
        <EmptyState title={result.holdings.length || period.start === period.end ? "No completed trading days in this period" : "No positions in this period"}>
          Results cover sessions after the {fmtDate(period.start)} close in which the team held a position.
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Team return" value={result.portfolioReturn} explain={EXPLAIN.teamReturn} />
            <StatTile label="Sector benchmark" value={result.benchmarkReturn} explain={EXPLAIN.teamBenchmark} />
            <StatTile label="Active return" value={result.activeReturn} unit="bps" emphasis explain={EXPLAIN.active} />
            <StatTile label="Selection" value={selection} unit="bps" hint="Picks vs sector ETF" explain={EXPLAIN.teamSelection} />
            <StatTile label="Allocation" value={result.effects?.allocation ?? null} unit="bps" hint="Mix across team sectors" explain={EXPLAIN.teamAllocation} />
            <StatTile label="Contribution to Fund" value={result.fundContribution} unit="bps" hint={`${(result.avgFundWeight * 100).toFixed(1)}% of the Fund`} explain={EXPLAIN.fundContribution} />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <SectionTitle><Explained label="Effects by sector">{EXPLAIN.effectsChart}</Explained></SectionTitle>
              {result.effects ? <SectorEffectsChart data={sectorEffectPoints(result)} /> : <div className="text-sm text-muted-foreground">No benchmark for this period.</div>}
            </Card>
            <Card className="p-4">
              <SectionTitle><Explained label="Team vs sector benchmark">{EXPLAIN.cumulativeChart}</Explained></SectionTitle>
              <CumulativeActiveChart
                portfolioLabel={team.name}
                benchmarkLabel={benchmarkName}
                data={result.cumulative.map((c) => ({ date: c.date, portfolio: c.portfolio * 100, benchmark: c.benchmark === null ? null : c.benchmark * 100 }))}
              />
            </Card>
          </div>

          <SectionTitle aside={BPS_NOTE}>Sectors</SectionTitle>
          <div className="mb-6"><SectorTable result={result} breakdownQuery={transparency ? { basePath: base, team: team.slug, period: period.key, from, to } : undefined} /></div>

          <SectionTitle><Explained label="Holdings by contribution">{EXPLAIN.contributors}</Explained></SectionTitle>
          <div className="mb-6"><ContributorsTable rows={result.holdings} teams={teams} showTeam={false} /></div>

          <p className="text-xs text-muted-foreground">
            The team&apos;s holdings are scaled to 100% and compared with the S&amp;P 500 weights of its sectors, using Select Sector SPDR total returns. Weights and
            contributions here are shares of the team&apos;s capital; Contribution to Fund is in points of the whole Fund&apos;s return.
            {transparency && " Transparency mode is on: expand a sector row to see the daily working and the stored rows behind it."}
          </p>
        </>
      )}
    </>
  );
}
