import type { Metadata } from "next";
import { MovementsView } from "@/components/app/movements/movements-view";
import { loadMovementsView } from "../_load";

export const metadata: Metadata = { title: "Movement" };

export default async function MovementPage({ params }: { params: Promise<{ team: string; id: string }> }) {
  const { team: slug, id } = await params;
  const { scope, items, selected } = await loadMovementsView(slug, id);
  return <MovementsView scope={{ slug: scope.slug, label: scope.team?.name ?? "Whole fund" }} items={items} selected={selected} />;
}
