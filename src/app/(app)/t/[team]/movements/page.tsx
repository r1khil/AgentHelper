import type { Metadata } from "next";
import { EmptyState } from "@/components/app/empty-state";
import { MovementsView } from "@/components/app/movements/movements-view";
import { loadMovementsView } from "./_load";

export const metadata: Metadata = { title: "Movements" };

export default async function MovementsPage({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const { items, selected } = await loadMovementsView(slug, null);
  if (items.length === 0) {
    return (
      <EmptyState title="No movements yet" hoot="sleepy">
        The close check runs every trading day. Qualifying moves appear here with evidence attached and an owner assigned.
      </EmptyState>
    );
  }
  return <MovementsView items={items} selected={selected} />;
}
