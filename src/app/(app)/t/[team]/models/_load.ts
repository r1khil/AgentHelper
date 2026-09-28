import "server-only";
import { notFound } from "next/navigation";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { modelMappings, modelProposals, profiles } from "@/db/schema";
import { loadScope } from "@/lib/teams";
import { holdingHref } from "@/lib/scope";
import { getModel, listMappings, listModelVersions, listProposals, listTeamModels } from "@/lib/models";
import type { WorkbookInfo } from "@/lib/excel/read";
import type { ModelDetailData, ModelListItem, ModelTab, UploadTarget } from "@/components/app/models/types";

const TABS: ModelTab[] = ["proposals", "mappings", "map"];

/**
 * The models master–detail for a scope. `modelId` comes from /models/[modelId]; without it the first model with
 * proposals waiting is selected, or nothing.
 */
export async function loadModelsView({ slug, modelId, tab, ok, error }: { slug: string; modelId: string | null; tab?: string; ok?: string; error?: string }) {
  const scope = await loadScope(slug);
  const rows = await listTeamModels(scope.teamIds);
  const latestIds = rows.flatMap((r) => (r.latest ? [r.latest.m.id] : []));
  const [statusCounts, mappingCounts] = latestIds.length
    ? await Promise.all([
        db
          .select({ modelId: modelProposals.modelId, status: modelProposals.status, n: count() })
          .from(modelProposals)
          .where(inArray(modelProposals.modelId, latestIds))
          .groupBy(modelProposals.modelId, modelProposals.status),
        db.select({ modelId: modelMappings.modelId, n: count() }).from(modelMappings).where(inArray(modelMappings.modelId, latestIds)).groupBy(modelMappings.modelId),
      ])
    : [[], []];
  const statusN = (id: string, s: string) => statusCounts.find((c) => c.modelId === id && c.status === s)?.n ?? 0;

  const items: ModelListItem[] = rows.map(({ holding: h, latest, versions }) => ({
    holdingId: h.id,
    ticker: h.ticker,
    companyName: h.companyName,
    teamName: scope.kind === "fund" ? (scope.teamById.get(h.teamId)?.name ?? null) : null,
    model: latest
      ? {
          id: latest.m.id,
          href: `/t/${scope.slug}/models/${latest.m.id}`,
          fileName: latest.m.fileName,
          version: latest.m.version,
          versions,
          uploader: latest.uploader,
          createdAt: latest.m.createdAt,
          proposed: statusN(latest.m.id, "proposed"),
          approved: statusN(latest.m.id, "approved"),
          exceptions: statusN(latest.m.id, "exception"),
          mappings: mappingCounts.find((c) => c.modelId === latest.m.id)?.n ?? 0,
        }
      : null,
  }));
  const uploadTargets: UploadTarget[] = rows.map(({ holding: h, latest }) => ({ id: h.id, ticker: h.ticker, companyName: h.companyName, hasModel: !!latest }));

  const id = modelId ?? items.find((i) => i.model && i.model.proposed > 0)?.model?.id ?? null;
  if (!id) return { scope, items, uploadTargets, selected: null, selectedHoldingId: null };

  const row = await getModel(id);
  if (!row || !scope.teamById.has(row.h.teamId)) notFound();
  const { m, h } = row;
  const team = scope.teamById.get(h.teamId)!;
  const [mappings, proposals, versions, uploader] = await Promise.all([
    listMappings(m.id),
    listProposals(m.id),
    listModelVersions(h.id),
    m.uploadedBy ? db.select({ name: profiles.fullName }).from(profiles).where(eq(profiles.id, m.uploadedBy)).limit(1) : Promise.resolve([]),
  ]);
  const href = `/t/${scope.slug}/models/${m.id}`;
  const selected: ModelDetailData = {
    id: m.id,
    ticker: h.ticker,
    companyName: h.companyName,
    holdingHref: holdingHref(scope.slug, team.slug, h.ticker),
    fileName: m.fileName,
    version: m.version,
    nextVersion: Math.max(m.version, ...versions.map((v) => v.version)) + 1,
    uploader: uploader[0]?.name ?? null,
    createdAt: m.createdAt,
    cik: h.cik,
    versions: [...versions].sort((a, b) => a.version - b.version).map((v) => ({ id: v.id, version: v.version, href: `/t/${scope.slug}/models/${v.id}` })),
    downloadHref: `/api/models/${m.id}/download`,
    href,
    tab: TABS.includes(tab as ModelTab) ? (tab as ModelTab) : mappings.length ? "proposals" : "map",
    mappings: mappings.map((mm) => ({
      id: mm.id,
      labelInModel: mm.labelInModel,
      sheet: mm.sheet,
      rowRef: mm.rowRef,
      concept: mm.concept,
      unit: mm.unit,
      scale: mm.scale,
      sign: mm.sign,
      periodType: mm.periodType,
      periodColumns: mm.periodColumns,
      rationale: mm.rationale,
    })),
    proposals: proposals.map(({ p, mapping, reviewer }) => ({
      id: p.id,
      label: mapping.labelInModel,
      sheet: mapping.sheet,
      cellRef: p.cellRef,
      concept: mapping.concept,
      taxonomy: mapping.taxonomy,
      periodEnd: p.periodEnd,
      fiscalPeriod: p.fiscalPeriod,
      value: p.value === null ? null : Number(p.value),
      reportedLabel: p.reportedLabel,
      derivation: p.derivation,
      exceptionReason: p.exceptionReason,
      sourceUrl: p.sourceUrl,
      accession: p.accession,
      filedAt: p.filedAt,
      status: p.status,
      reviewer,
    })),
    workbook: { sheets: (m.sheets as WorkbookInfo["sheets"]) ?? [] },
    ok: ok ?? null,
    error: error ?? null,
  };
  return { scope, items, uploadTargets, selected, selectedHoldingId: h.id };
}
