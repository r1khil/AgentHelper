import type { Metadata } from "next";
import { requireOnboardedUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { PageHead } from "@/components/app/page-head";
import { ChangesTab } from "@/components/app/screener/changes-tab";
import { LookTab } from "@/components/app/screener/look-tab";
import { PitchesTab } from "@/components/app/screener/pitches-tab";
import { TeamMenu } from "@/components/app/screener/team-menu";
import { WatchlistTab } from "@/components/app/screener/watchlist-tab";
import { loadChanges, loadLook, loadPitches, loadWatchlist, screenerScope } from "./load";
import { parseScreenerQuery, SCREENER_TABS, screenerHref } from "./types";

export const metadata: Metadata = { title: "Screener" };

/**
 * The Screener: what the monthly whole-market screen found for each team (Worth a look), what changed in the filings
 * of the fund's holdings and watchlist (Filing changes), each pitch's estimates and kill criteria (Pitches), and the
 * names teams follow without owning (Watchlist). One company's tear sheet, reverse DCF and bear case are at
 * /screener/<ticker>. Numbers come from code over SEC data; Hoot only writes cited prose.
 */
export default async function ScreenerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, sp] = await Promise.all([requireOnboardedUser(), searchParams]);
  const q = parseScreenerQuery(sp);
  const scope = await screenerScope(user, q);
  const tabs = SCREENER_TABS.map((t) => ({ key: t.key, label: t.label, href: screenerHref(q, { tab: t.key }), active: t.key === q.tab }));
  const where = scope.team?.name ?? "Whole fund";
  const actions = (
    <TeamMenu
      team={scope.team && { slug: scope.team.slug, name: scope.team.name }}
      teams={scope.teams.map((t) => ({ slug: t.slug, name: t.name }))}
      hrefs={{ all: screenerHref(q, { team: "all" }), bySlug: Object.fromEntries(scope.teams.map((t) => [t.slug, screenerHref(q, { team: t.slug })])) }}
    />
  );
  const head = (asof: string, items = tabs) => <PageHead crumbs={[{ label: "Screener" }]} asof={asof} actions={actions} tabs={items} />;

  if (q.tab === "changes") {
    const data = await loadChanges(scope, q.showAll);
    return (
      <>
        {head(where, tabs.map((t) => (t.key === "changes" && data.toMark ? { ...t, count: data.toMark, hot: true } : t)))}
        <ChangesTab q={q} scope={scope} data={data} />
      </>
    );
  }
  if (q.tab === "pitches") {
    const data = await loadPitches(scope);
    return (
      <>
        {head(where)}
        <PitchesTab q={q} scope={scope} data={data} />
      </>
    );
  }
  if (q.tab === "watchlist") {
    const data = await loadWatchlist(scope);
    return (
      <>
        {head(where)}
        <WatchlistTab q={q} scope={scope} data={data} />
      </>
    );
  }
  const data = await loadLook(scope, q.track);
  const asof = data.screen ? `${where}. Screen of ${fmtDate(data.screen.run.runDate)}` : where;
  return (
    <>
      {head(asof)}
      <LookTab q={q} scope={scope} data={data} />
    </>
  );
}
