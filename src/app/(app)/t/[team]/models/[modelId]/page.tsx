import type { Metadata } from "next";
import { ModelsView } from "@/components/app/models/models-view";
import { loadModelsView } from "../_load";

export const metadata: Metadata = { title: "Model" };

export default async function ModelPage({
  params,
  searchParams,
}: {
  params: Promise<{ team: string; modelId: string }>;
  searchParams: Promise<{ ok?: string; error?: string; tab?: string }>;
}) {
  const { team: slug, modelId } = await params;
  const { ok, error, tab } = await searchParams;
  const { scope, items, uploadTargets, selected, selectedHoldingId } = await loadModelsView({ slug, modelId, tab, ok, error });
  return <ModelsView scope={{ slug: scope.slug, label: scope.team?.name ?? "Whole fund" }} items={items} uploadTargets={uploadTargets} selected={selected} selectedHoldingId={selectedHoldingId} />;
}
