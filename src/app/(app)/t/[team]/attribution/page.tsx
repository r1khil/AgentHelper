import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { TeamAttributionView } from "@/components/app/attribution/attribution-views";
import type { TeamLookup } from "@/components/app/attribution/contributors-table";
import { TODAY_KEY } from "@/components/app/attribution/period-selector";
import { TodayView } from "@/components/app/daily/today-view";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { computeTeamAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { loadLiveSnapshot } from "@/lib/attribution/live-load";
import { ETF_BY_SECTOR, SECTOR_LABELS } from "@/lib/attribution/sectors";
import { periodFromQuery, qualityNotices, sectorEffectPoints } from "@/lib/attribution/view";
import { canManageTeam, isFundWide, transparencyEnabled } from "@/lib/auth";
import { loadTeam } from "@/lib/teams";
import { FUND_SCOPE_SLUG } from "@/lib/constants";

export const metadata: Metadata = { title: "Performance" };

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
  const benchmarkSectors = sectors.length ? sectors.map((s) => SECTOR_LABELS[s]).join(", ") : "—";

  if (!loaded.inception || !loaded.latest) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState title={loaded.inception ? "Price history is still loading" : "No trades recorded"}>
          {loaded.inception ? "Closing prices load after each ledger change and every weeknight." : canEdit ? <Link href="/attribution/ledger" className="underline underline-offset-2">Open the ledger</Link> : "An exec records the Fund's trades in the ledger."}
        </EmptyState>
      </div>
    );
  }

  // Today: the team's live session, the old Daily page. Same page, same period buttons.
  const asked = Array.isArray(query.period) ? query.period[0] : query.period;
  if (asked === TODAY_KEY) {
    const snapshot = await loadLiveSnapshot({ team: { id: team.id, name: team.name, slug: team.slug, sectors } });
    if (!snapshot) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <EmptyState title="Nothing to show yet">Today&apos;s performance starts once the ledger has positions and their closing prices have loaded.</EmptyState>
        </div>
      );
    }
    const closed = periodFromQuery({ period: "1d" }, { inception: loaded.inception, latest: loaded.latest });
    const notices = qualityNotices(loaded, closed.period, { canEdit }).filter((n) => n.word === "Stale" || n.text.startsWith("No S&P 500 sector weights"));
    if (!sectors.length) notices.unshift({ text: "No GICS sectors are assigned to this team, so it has no benchmark.", href: canEdit ? "/attribution/ledger?tab=securities" : undefined, action: "Assign sectors" });
    return (
      <TodayView
        initial={snapshot}
        scope={{ kind: "team", slug: team.slug, name: team.name, benchmarkName, benchmarkSectors }}
        teams={[[team.id, { name: team.name, slug: team.slug }]]}
        period={{ basePath: base, inception: loaded.inception, latest: loaded.latest }}
        notices={notices}
      />
    );
  }

  const { period, queryString, from, to } = periodFromQuery(query, { inception: loaded.inception, latest: loaded.latest });
  const result = computeTeamAttribution(loaded.series, period, team.id, sectors);
  const teams: TeamLookup = new Map([[team.id, { name: team.name, slug: team.slug }]]);
  const teamTickers = new Set(result.holdings.map((h) => h.ticker));
  const notices = qualityNotices(loaded, period, { canEdit }).filter((n) => !n.text.startsWith("No sector set") || [...teamTickers].some((t) => n.text.includes(t)));
  if (!sectors.length) notices.unshift({ text: "No GICS sectors are assigned to this team, so it has no benchmark.", href: canEdit ? "/attribution/ledger?tab=securities" : undefined, action: "Assign sectors" });

  return (
    <>
      <PageContextPublisher value={{ kind: "attribution", path: base, title: `${team.name} attribution`, scope: "team", team: team.slug, period: period.key, from, to, start: period.start, end: period.end }} />
      <TeamAttributionView
        view={{ basePath: base, period, from, to, queryString, inception: loaded.inception, latest: loaded.latest }}
        teamName={team.name}
        teamSlug={team.slug}
        benchmarkName={benchmarkName}
        benchmarkSectors={benchmarkSectors}
        result={result}
        teams={teams}
        notices={notices}
        transparency={transparencyEnabled(user)}
        sectorEffects={sectorEffectPoints(result)}
      />
    </>
  );
}
