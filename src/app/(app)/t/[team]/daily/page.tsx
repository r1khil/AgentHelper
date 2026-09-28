import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { DailyView } from "@/components/app/daily/daily-view";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { loadTeamSectors } from "@/lib/attribution/load";
import { loadLiveSnapshot } from "@/lib/attribution/live-load";
import { ETF_BY_SECTOR, SECTOR_LABELS } from "@/lib/attribution/sectors";
import { canManageTeam } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { loadTeam } from "@/lib/teams";

export const metadata: Metadata = { title: "Daily performance" };

export default async function TeamDailyPage({ params }: PageProps<"/t/[team]/daily">) {
  const slug = (await params).team;
  // The fund-wide view has its own page.
  if (slug === FUND_SCOPE_SLUG) redirect("/daily");
  const { team, user } = await loadTeam(slug);
  // Position sizes and P&L are for leads and fund-wide roles, as on Attribution.
  if (!canManageTeam(user, team.id)) redirect(`/t/${team.slug}`);

  const sectors = (await loadTeamSectors()).get(team.id) ?? [];
  const snapshot = await loadLiveSnapshot({ team: { id: team.id, name: team.name, slug: team.slug, sectors } });
  const path = `/t/${team.slug}/daily`;
  if (!snapshot) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState title="Nothing to show yet">Daily performance starts once the ledger has positions and their closing prices have loaded.</EmptyState>
      </div>
    );
  }
  return (
    <>
      <PageContextPublisher value={{ kind: "page", path, title: `${team.name} daily performance` }} />
      <DailyView
        initial={snapshot}
        scope={{
          kind: "team",
          slug: team.slug,
          name: team.name,
          benchmarkName: sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "no sectors assigned",
          benchmarkSectors: sectors.length ? sectors.map((s) => SECTOR_LABELS[s]).join(", ") : "—",
        }}
        teams={[[team.id, { name: team.name, slug: team.slug }]]}
      />
    </>
  );
}
