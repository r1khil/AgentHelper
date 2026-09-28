import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { DailyView } from "@/components/app/daily/daily-view";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { loadLiveSnapshot } from "@/lib/attribution/live-load";
import { listAccessibleTeams, requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Daily performance" };

/** Today's return and its attribution while the market is open, refreshed every minute; the last session otherwise. */
export default async function DailyPage() {
  const user = await requireRole("exec", "admin");
  const [snapshot, teamList] = await Promise.all([loadLiveSnapshot({}), listAccessibleTeams(user)]);
  if (!snapshot) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState title="Nothing to show yet">Daily performance starts once the ledger has positions and their closing prices have loaded.</EmptyState>
      </div>
    );
  }
  return (
    <>
      <PageContextPublisher value={{ kind: "page", path: "/daily", title: "Daily performance" }} />
      <DailyView initial={snapshot} scope={{ kind: "fund" }} teams={teamList.map((t) => [t.id, { name: t.name, slug: t.slug }])} />
    </>
  );
}
