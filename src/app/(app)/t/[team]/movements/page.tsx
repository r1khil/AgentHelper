import type { Metadata } from "next";
import { PageHead } from "@/components/app/page-head";
import { EmptyState } from "@/components/app/empty-state";
import { MovementsView } from "@/components/app/movements/movements-view";
import { loadMovementsView } from "./_load";

export const metadata: Metadata = { title: "Write-ups" };

/**
 * Every movement write-up in the scope, the most pressing one open. Each holding's own write-ups are on its page (the
 * Write-ups tab); this is the whole list, for leads chasing their teams, reached from there ("All write-ups").
 */
export default async function MovementsPage({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const { scope, items, selected } = await loadMovementsView(slug, null);
  if (items.length === 0) {
    return (
      <>
        <PageHead crumbs={[{ label: "Portfolio", href: `/t/${scope.slug}` }, { label: "Write-ups" }]} asof={scope.team?.name ?? "Whole fund"} tabs={false} />
        <EmptyState title="No write-ups yet" hoot="sleepy">
          The close check runs every trading day. Qualifying moves appear here with evidence attached, for anyone on the team to write up.
        </EmptyState>
      </>
    );
  }
  return <MovementsView list scope={{ slug: scope.slug, label: scope.team?.name ?? "Whole fund" }} items={items} selected={selected} />;
}
