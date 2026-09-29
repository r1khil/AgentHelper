import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { FundAttributionView, TeamAttributionView } from "@/components/app/attribution/attribution-views";
import { LEDGER_HREF } from "@/components/app/attribution/attribution-panels";
import type { TeamLookup } from "@/components/app/attribution/contributors-table";
import { TodayView } from "@/components/app/daily/today-view";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { computeAttribution, computeTeamAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { TODAY_KEY } from "@/lib/attribution/periods";
import { loadLiveSnapshot } from "@/lib/attribution/live-load";
import { ETF_BY_SECTOR, INDEX_LABEL, SECTOR_LABELS } from "@/lib/attribution/sectors";
import { indexCumulative, indexReturn, periodFromQuery, qualityNotices, sectorEffectPoints } from "@/lib/attribution/view";
import { canManageTeam, isFundWide, listAccessibleTeams, transparencyEnabled } from "@/lib/auth";
import { loadScope } from "@/lib/teams";

export const metadata: Metadata = { title: "Performance" };

/** Before there is anything to attribute: the empty state, and the ledger one click away. */
function NotYet({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <EmptyState title={title} action={action}>
      {children}
    </EmptyState>
  );
}

/**
 * Portfolio, Performance: where the return came from over `?period=` (1D to since the ledger opened, or a custom
 * range), and `?period=today`, the live session (what Daily was). The fund for execs and admins, a team's sleeve
 * against its own sectors for its leads too.
 */
export default async function PerformancePage({ params, searchParams }: PageProps<"/t/[team]/performance">) {
  const slug = (await params).team;
  const scope = await loadScope(slug);
  const { user } = scope;
  const team = scope.kind === "team" ? scope.team : null;
  // Position sizes and P&L are for leads and fund-wide roles.
  if (team && !canManageTeam(user, team.id)) redirect(`/t/${team.slug}`);

  const [query, loaded, sectorMap, teamList] = await Promise.all([searchParams, loadAttributionSeries(), loadTeamSectors(), listAccessibleTeams(user)]);
  const base = `/t/${slug}/performance`;
  const canEdit = isFundWide(user);
  const transparency = transparencyEnabled(user);

  if (!loaded.inception) {
    return (
      <NotYet title="No trades recorded" action={canEdit ? <Button nativeButton={false} size="sm" render={<Link href={LEDGER_HREF} />}>Open ledger</Button> : undefined}>
        {canEdit ? "Performance is calculated from the trade ledger. Record the Fund's positions and cash to begin." : "An exec records the Fund's trades in the ledger."}
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

  const sectors = team ? (sectorMap.get(team.id) ?? []) : [];
  const benchmarkName = sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "no sectors assigned";
  const benchmarkSectors = sectors.length ? sectors.map((s) => SECTOR_LABELS[s]).join(", ") : "—";
  const noSectors = { text: "No GICS sectors are assigned to this team, so it has no benchmark.", href: canEdit ? `${LEDGER_HREF}?tab=securities` : undefined, action: "Assign sectors" };

  // Today: the live session, the old Daily page. Same view, same period buttons.
  const asked = Array.isArray(query.period) ? query.period[0] : query.period;
  if (asked === TODAY_KEY) {
    const snapshot = await loadLiveSnapshot(team ? { team: { id: team.id, name: team.name, slug: team.slug, sectors } } : {});
    if (!snapshot) return <NotYet title="Nothing to show yet">Today&apos;s performance starts once the ledger has positions and their closing prices have loaded.</NotYet>;
    const closed = periodFromQuery({ period: "1d" }, { inception: loaded.inception, latest: loaded.latest });
    // The live numbers use the same saved sector weights, so a stale set is worth a word here too.
    const notices = qualityNotices(loaded, closed.period, { canEdit }).filter((n) => n.word === "Stale" || n.text.startsWith("No S&P 500 sector weights"));
    if (team && !sectors.length) notices.unshift(noSectors);
    return (
      <TodayView
        initial={snapshot}
        scope={team ? { kind: "team", slug: team.slug, name: team.name, benchmarkName, benchmarkSectors } : { kind: "fund" }}
        teams={team ? [[team.id, { name: team.name, slug: team.slug }]] : teamList.map((t) => [t.id, { name: t.name, slug: t.slug }])}
        period={{ basePath: base, inception: loaded.inception, latest: loaded.latest }}
        notices={notices}
      />
    );
  }

  const { period, queryString, from, to } = periodFromQuery(query, { inception: loaded.inception, latest: loaded.latest });
  const view = { basePath: base, period, from, to, queryString, inception: loaded.inception, latest: loaded.latest };

  if (!team) {
    const result = computeAttribution(loaded.series, period);
    const notices = qualityNotices(loaded, period, { canEdit: true });
    const spx = indexReturn(loaded, period);
    if (spx === null && result.days > 0) notices.push({ text: `${INDEX_LABEL} index closes for this period have not been stored yet. The headline comparison appears after the next price run.` });
    const teams: TeamLookup = new Map(teamList.map((t) => [t.id, { name: t.name, slug: t.slug }]));
    return (
      <>
        <PageContextPublisher value={{ kind: "attribution", path: base, title: "Fund attribution", scope: "fund", period: period.key, from, to, start: period.start, end: period.end }} />
        <FundAttributionView
          view={view}
          result={result}
          spx={spx}
          spxSeries={indexCumulative(loaded, period, result.cumulative.map((c) => c.date))}
          teams={teams}
          notices={notices}
          showAll={query.all === "1"}
          transparency={transparency}
          weightsAsOf={loaded.weightSets.at(-1)?.asOf}
        />
      </>
    );
  }

  const result = computeTeamAttribution(loaded.series, period, team.id, sectors);
  const teamTickers = new Set(result.holdings.map((h) => h.ticker));
  const notices = qualityNotices(loaded, period, { canEdit }).filter((n) => !n.text.startsWith("No sector set") || [...teamTickers].some((t) => n.text.includes(t)));
  if (!sectors.length) notices.unshift(noSectors);
  return (
    <>
      <PageContextPublisher value={{ kind: "attribution", path: base, title: `${team.name} attribution`, scope: "team", team: team.slug, period: period.key, from, to, start: period.start, end: period.end }} />
      <TeamAttributionView
        view={view}
        teamName={team.name}
        teamSlug={team.slug}
        benchmarkName={benchmarkName}
        benchmarkSectors={benchmarkSectors}
        result={result}
        teams={new Map([[team.id, { name: team.name, slug: team.slug }]])}
        notices={notices}
        transparency={transparency}
        sectorEffects={sectorEffectPoints(result)}
      />
    </>
  );
}
