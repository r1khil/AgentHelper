import type { Metadata } from "next";
import { PageHead } from "@/components/app/page-head";
import { EmptyState } from "@/components/app/empty-state";
import { ModelsView } from "@/components/app/models/models-view";
import { loadModelsView } from "./_load";

export const metadata: Metadata = { title: "Models" };

export default async function ModelsPage({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<{ error?: string; tab?: string }> }) {
  const { team: slug } = await params;
  const { error, tab } = await searchParams;
  const { scope, items, uploadTargets, selected, selectedHoldingId } = await loadModelsView({ slug, modelId: null, tab, error });
  if (items.length === 0) {
    return (
      <>
        <PageHead crumbs={[{ label: "Models" }]} asof={scope.team?.name ?? "Whole fund"} tabs={false} />
        <EmptyState title="No holdings yet" hoot="wave">
          Add holdings first; each one can carry a model.
        </EmptyState>
      </>
    );
  }
  return (
    <ModelsView
      scope={{ slug: scope.slug, label: scope.team?.name ?? "Whole fund" }}
      items={items}
      uploadTargets={uploadTargets}
      selected={selected}
      selectedHoldingId={selectedHoldingId}
      error={selected ? null : (error ?? null)}
    />
  );
}
