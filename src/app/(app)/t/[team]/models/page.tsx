import type { Metadata } from "next";
import Link from "next/link";
import { loadScope } from "@/lib/teams";
import { listTeamModels } from "@/lib/models";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Card } from "@/components/ui/card";
import { UploadModelForm } from "@/components/app/models/upload-model-form";

export const metadata: Metadata = { title: "Models" };

export default async function ModelsPage({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<{ error?: string }> }) {
  const { team: slug } = await params;
  const { error } = await searchParams;
  const scope = await loadScope(slug);
  const rows = await listTeamModels(scope.teamIds);
  return (
    <>
      <PageHeader title="Model historicals" description="Upload a model, map its line items to reported XBRL concepts once, and the agent proposes the other periods with a source for every number. You approve; formulas are never touched." />
      {error && <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
      {rows.length === 0 ? (
        <EmptyState title="No holdings yet" hoot="wave">Add holdings first; each one can carry a model.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {rows.map(({ holding, latest, versions }) => (
            <Card key={holding.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-32">
                <div className="font-semibold">{holding.ticker}</div>
                <div className="text-xs text-muted-foreground">
                  {holding.companyName}
                  {scope.kind === "fund" && ` · ${scope.teamById.get(holding.teamId)?.name}`}
                </div>
              </div>
              <div className="min-w-0 flex-1 text-sm">
                {latest ? (
                  <>
                    <Link href={`/t/${scope.teamById.get(holding.teamId)?.slug}/models/${latest.m.id}`} className="font-medium hover:underline">
                      {latest.m.fileName}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      v{latest.m.version} · {versions} version{versions === 1 ? "" : "s"} · uploaded by {latest.uploader ?? "unknown"} {relativeTime(latest.m.createdAt)}
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground">No model uploaded.</span>
                )}
              </div>
              <UploadModelForm holdingId={holding.id} hasModel={!!latest} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
