import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { ActiveReturnCard } from "@/components/app/attribution/active-return-card";
import { ContributorsTable, type TeamLookup } from "@/components/app/attribution/contributors-table";
import { CumulativeActiveChart } from "@/components/app/attribution/cumulative-active-chart";
import { DataNoticesButton } from "@/components/app/attribution/data-quality-notice";
import { EffectsWaterfall } from "@/components/app/attribution/effects-waterfall";
import { EXPLAIN } from "@/components/app/attribution/explainers";
import { Explained } from "@/components/app/attribution/info-tip";
import { PeriodSelector } from "@/components/app/attribution/period-selector";
import { SectorEffectsList } from "@/components/app/attribution/sector-effects-list";
import { SectorTable } from "@/components/app/attribution/sector-table";
import { computeTeamAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { PERIOD_LABELS } from "@/lib/attribution/periods";
import { bucketLabel, ETF_BY_SECTOR, SECTOR_LABELS } from "@/lib/attribution/sectors";
import { periodFromQuery, qualityNotices, sectorEffectPoints } from "@/lib/attribution/view";
import { canManageTeam, isFundWide, transparencyEnabled } from "@/lib/auth";
import { BPS_NOTE, fmtBps, fmtBpsShort, fmtSigned, fmtWeight } from "@/components/app/attribution/format";
import { fmtDate } from "@/lib/format";
import { loadTeam } from "@/lib/teams";
import { FUND_SCOPE_SLUG } from "@/lib/constants";

export const metadata: Metadata = { title: "Attribution" };

export default async function TeamAttributionPage({ params, searchParams }: PageProps<"/t/[team]/attribution">) {
  const slug = (await params).team;
  // The fund-wide view of attribution already has its own page.
  if (slug === FUND_SCOPE_SLUG) redirect("/attribution");
  const { team, user } = await loadTeam(slug);
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
  const leader = result.effects ? [...result.sectors].sort((a, b) => b.selection + b.interaction - (a.selection + a.interaction))[0] : undefined;

  return (
    <>
      <PageHeader
        title="Attribution"
        description={`${team.name} vs ${sectors.length ? sectors.map((s) => SECTOR_LABELS[s]).join(", ") : "—"} (${benchmarkName}) · ${PERIOD_LABELS[period.key]} · ${fmtDate(period.start)} close through ${fmtDate(period.end)} · ${result.days} trading ${result.days === 1 ? "day" : "days"}`}
        actions={<DataNoticesButton notices={notices} />}
      />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <PeriodSelector basePath={base} active={period.key} from={from} to={to} inception={loaded.inception} latest={loaded.latest} />
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: "var(--series-1)" }} aria-hidden />{team.name}</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: "var(--series-2)" }} aria-hidden />Sector benchmark</span>
          <span>Prices as of {fmtDate(loaded.latest)} close</span>
        </div>
      </div>

      {result.days === 0 ? (
        <EmptyState title={result.holdings.length || period.start === period.end ? "No completed trading days in this period" : "No positions in this period"}>
          Results cover sessions after the {fmtDate(period.start)} close in which the team held a position.
        </EmptyState>
      ) : (
        <>
          <section aria-label="Headline" className="mb-4 grid gap-4 lg:grid-cols-12">
            <ActiveReturnCard
              title="Active return vs sector benchmark"
              chip={`${fmtWeight(result.avgFundWeight)} of the Fund · ${fmtBps(result.fundContribution, 0)} to the Fund`}
              active={result.activeReturn}
              explain={EXPLAIN.active}
              comparison="the sector benchmark"
              bars={[
                { label: team.name, value: result.portfolioReturn, color: "var(--series-1)" },
                { label: "Sector benchmark", value: result.benchmarkReturn, color: "var(--series-2)" },
              ]}
            />
            <EffectsWaterfall
              title="Where it came from · vs sector benchmark"
              aside={
                result.benchmarkReturn !== null && result.activeReturn !== null ? (
                  <>
                    <Explained label="Sector benchmark">{EXPLAIN.teamBenchmark}</Explained> returned{" "}
                    <span className="tnum font-semibold text-foreground">{fmtSigned(result.benchmarkReturn)}</span> · {team.name} {fmtBps(result.activeReturn, 0)} against it
                  </>
                ) : undefined
              }
              items={
                result.effects && selection !== null
                  ? [
                      { label: "Selection", value: selection, explain: EXPLAIN.teamSelection, hint: leader && leader.selection + leader.interaction > 0 ? `Led by ${bucketLabel(leader.key)} ${fmtBpsShort(leader.selection + leader.interaction)}` : "Picks vs sector ETF" },
                      { label: "Allocation", value: result.effects.allocation, explain: EXPLAIN.teamAllocation, hint: "Mix across team sectors" },
                    ]
                  : []
              }
              total={
                result.effects && result.activeReturn !== null
                  ? { label: "Active vs sector benchmark", value: result.activeReturn, explain: EXPLAIN.teamBenchmark, hint: "Brinson-Fachler, daily, Carino-linked" }
                  : null
              }
              empty="No benchmark for this period."
            />
          </section>

          <section aria-label="Charts" className="mb-6 grid gap-4 lg:grid-cols-12">
            <Card className="p-4 lg:col-span-8">
              <SectionTitle><Explained label={`Cumulative return, ${team.name} vs sector benchmark`}>{EXPLAIN.cumulativeChart}</Explained></SectionTitle>
              <CumulativeActiveChart
                portfolioLabel={team.name}
                benchmarkLabel={benchmarkName}
                data={result.cumulative.map((c) => ({ date: c.date, portfolio: c.portfolio * 100, benchmark: c.benchmark === null ? null : c.benchmark * 100 }))}
              />
            </Card>
            <Card className="p-4 lg:col-span-4">
              <SectionTitle aside="bps"><Explained label="Total effect by sector">{EXPLAIN.effectsChart}</Explained></SectionTitle>
              {result.effects ? <SectorEffectsList data={sectorEffectPoints(result)} /> : <div className="text-sm text-muted-foreground">No benchmark for this period.</div>}
            </Card>
          </section>

          <SectionTitle aside={BPS_NOTE}>Sectors</SectionTitle>
          <div className="mb-6"><SectorTable result={result} breakdownQuery={transparency ? { basePath: base, team: team.slug, period: period.key, from, to } : undefined} /></div>

          <SectionTitle><Explained label="Holdings by contribution">{EXPLAIN.contributors}</Explained></SectionTitle>
          <div className="mb-6"><ContributorsTable rows={result.holdings} teams={teams} showTeam={false} /></div>

          <details className="rounded-xl bg-muted/40 ring-1 ring-foreground/10">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">How this is calculated</summary>
            <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
              The team&apos;s holdings are scaled to 100% and compared with the S&amp;P 500 weights of its sectors, using Select Sector SPDR total returns. Weights and
              contributions here are shares of the team&apos;s capital; Contribution to Fund is in points of the whole Fund&apos;s return.
              {transparency && " Transparency mode is on: expand a sector row to see the daily working and the stored rows behind it."}
            </p>
          </details>
        </>
      )}
    </>
  );
}
