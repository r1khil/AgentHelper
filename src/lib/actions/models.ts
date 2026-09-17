"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { holdings, modelMappings, modelProposals, modelWrites, models, teams } from "@/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { readWorkbook } from "@/lib/excel/read";
import { patchXlsx } from "@/lib/excel/patch";
import { downloadModelFile, uploadModelFile } from "@/lib/storage";
import { getCompanyFacts, listConcepts } from "@/lib/providers/edgar";
import { buildProposals, reportedPeriodEnds, suggestConcepts, type ConceptSuggestion } from "@/lib/models/proposals";

async function loadModel(modelId: string) {
  const [row] = await db.select({ m: models, h: holdings, slug: teams.slug }).from(models).innerJoin(holdings, eq(holdings.id, models.holdingId)).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(models.id, modelId)).limit(1);
  if (!row) throw new Error("Model not found");
  const user = await requireTeamAccess(row.h.teamId);
  return { ...row, user, path: `/t/${row.slug}/models/${row.m.id}` };
}

export async function uploadModel(fd: FormData) {
  const holdingId = String(fd.get("holdingId") ?? "");
  const file = fd.get("file");
  const [h] = await db.select({ h: holdings, slug: teams.slug }).from(holdings).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(holdings.id, holdingId)).limit(1);
  if (!h) return;
  const user = await requireTeamAccess(h.h.teamId);
  if (!(file instanceof File) || !file.name) redirect(`/t/${h.slug}/models?error=Choose+an+.xlsx+file`);
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) redirect(`/t/${h.slug}/models?error=Only+.xlsx+or+.xlsm+files`);
  if (file.size > 50 * 1024 * 1024) redirect(`/t/${h.slug}/models?error=File+is+larger+than+50MB`);
  const buffer = Buffer.from(await file.arrayBuffer());
  let sheets;
  try {
    sheets = (await readWorkbook(buffer)).sheets;
  } catch (e) {
    redirect(`/t/${h.slug}/models?error=${encodeURIComponent(`Could not read workbook: ${e instanceof Error ? e.message : String(e)}`)}`);
  }
  const existing = await db.select({ version: models.version }).from(models).where(eq(models.holdingId, holdingId));
  const version = existing.length ? Math.max(...existing.map((v) => v.version)) + 1 : 1;
  const path = `${holdingId}/v${version}-${Date.now()}.${file.name.toLowerCase().endsWith(".xlsm") ? "xlsm" : "xlsx"}`;
  await uploadModelFile(path, buffer, file.type || undefined);
  const [m] = await db.insert(models).values({ holdingId, version, storagePath: path, fileName: file.name, sheets, uploadedBy: user.id }).returning({ id: models.id });
  revalidatePath(`/t/${h.slug}/models`);
  redirect(`/t/${h.slug}/models/${m.id}`);
}

const mappingSchema = z.object({
  modelId: z.string().uuid(),
  sheet: z.string().min(1),
  rowRef: z.coerce.number().int().min(1),
  labelInModel: z.string().trim().min(1).max(200),
  concept: z.string().trim().min(1).max(200),
  taxonomy: z.string().default("us-gaap"),
  unit: z.string().min(1).max(40),
  scale: z.coerce.number().positive(),
  sign: z.coerce.number().refine((v) => v === 1 || v === -1),
  periodType: z.enum(["quarterly", "annual"]),
  anchorColumn: z.string().max(4).optional(),
  rationale: z.string().trim().min(10).max(4000),
  periodColumns: z.record(z.string(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export type SaveMappingResult = { ok: true; mappingId: string } | { ok: false; error: string };

export async function saveMapping(input: unknown): Promise<SaveMappingResult> {
  const parsed = mappingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const d = parsed.data;
  if (!Object.keys(d.periodColumns).length) return { ok: false, error: "Map at least one period column" };
  const r = await loadModel(d.modelId);
  const [row] = await db
    .insert(modelMappings)
    .values({ modelId: d.modelId, sheet: d.sheet, rowRef: d.rowRef, labelInModel: d.labelInModel, concept: d.concept, taxonomy: d.taxonomy, unit: d.unit, scale: Math.round(d.scale), sign: d.sign, periodType: d.periodType, periodColumns: d.periodColumns, anchorColumn: d.anchorColumn ?? null, rationale: d.rationale, createdBy: r.user.id })
    .returning({ id: modelMappings.id });
  revalidatePath(r.path);
  return { ok: true, mappingId: row.id };
}

export async function deleteMapping(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const [m] = await db.select().from(modelMappings).where(eq(modelMappings.id, id)).limit(1);
  if (!m) return;
  const r = await loadModel(m.modelId);
  await db.delete(modelMappings).where(eq(modelMappings.id, id));
  revalidatePath(r.path);
}

export async function generateProposals(fd: FormData) {
  const modelId = String(fd.get("modelId") ?? "");
  const r = await loadModel(modelId);
  if (!r.h.cik) throw new Error("This holding has no SEC registrant; XBRL facts are unavailable");
  const facts = await getCompanyFacts(r.h.cik);
  const mappings = await db.select().from(modelMappings).where(eq(modelMappings.modelId, modelId));
  await db.transaction(async (tx) => {
    // Keep decisions already made; regenerate everything still open.
    const open = await tx.select({ id: modelProposals.id }).from(modelProposals).where(and(eq(modelProposals.modelId, modelId), inArray(modelProposals.status, ["proposed", "exception"])));
    if (open.length) await tx.delete(modelProposals).where(inArray(modelProposals.id, open.map((o) => o.id)));
    const decided = await tx.select({ mappingId: modelProposals.mappingId, periodEnd: modelProposals.periodEnd }).from(modelProposals).where(eq(modelProposals.modelId, modelId));
    const skip = new Set(decided.map((d) => `${d.mappingId}|${d.periodEnd}`));
    for (const m of mappings) {
      const proposals = buildProposals(facts, r.h.cik!, { concept: m.concept, taxonomy: m.taxonomy, unit: m.unit, scale: m.scale, sign: m.sign, periodType: m.periodType, periodColumns: m.periodColumns });
      for (const p of proposals) {
        if (skip.has(`${m.id}|${p.periodEnd}`)) continue;
        if (m.anchorColumn && p.column === m.anchorColumn) continue; // the student entered the anchor by hand
        await tx.insert(modelProposals).values({
          modelId,
          mappingId: m.id,
          periodEnd: p.periodEnd,
          cellRef: `${p.column}${m.rowRef}`,
          value: p.value?.toString() ?? null,
          unit: p.unit,
          reportedLabel: p.reportedLabel,
          fiscalPeriod: p.fiscalPeriod,
          sourceUrl: p.sourceUrl,
          accession: p.accession,
          filedAt: p.filedAt,
          derivation: p.derivation,
          status: p.status,
          exceptionReason: p.exceptionReason,
        });
      }
    }
  });
  revalidatePath(r.path);
}

export async function reviewProposal(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const decision = String(fd.get("decision") ?? "");
  const [p] = await db.select().from(modelProposals).where(eq(modelProposals.id, id)).limit(1);
  if (!p || !["approved", "rejected"].includes(decision)) return;
  const r = await loadModel(p.modelId);
  if (decision === "approved" && p.value === null) return;
  await db.update(modelProposals).set({ status: decision as "approved" | "rejected", reviewedBy: r.user.id, reviewedAt: new Date() }).where(eq(modelProposals.id, id));
  revalidatePath(r.path);
}

export async function approveAllProposed(fd: FormData) {
  const modelId = String(fd.get("modelId") ?? "");
  const r = await loadModel(modelId);
  await db.update(modelProposals).set({ status: "approved", reviewedBy: r.user.id, reviewedAt: new Date() }).where(and(eq(modelProposals.modelId, modelId), eq(modelProposals.status, "proposed")));
  revalidatePath(r.path);
}

export async function writeApproved(fd: FormData) {
  const modelId = String(fd.get("modelId") ?? "");
  const r = await loadModel(modelId);
  const approved = await db
    .select({ p: modelProposals, sheet: modelMappings.sheet })
    .from(modelProposals)
    .innerJoin(modelMappings, eq(modelMappings.id, modelProposals.mappingId))
    .where(and(eq(modelProposals.modelId, modelId), eq(modelProposals.status, "approved")));
  if (!approved.length) redirect(`${r.path}?error=Nothing+approved+to+write`);
  const original = await downloadModelFile(r.m.storagePath);
  let patched: Buffer;
  try {
    patched = await patchXlsx(original, approved.map(({ p, sheet }) => ({ sheet, ref: p.cellRef, value: Number(p.value) })));
  } catch (e) {
    redirect(`${r.path}?error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  const versions = await db.select({ version: models.version }).from(models).where(eq(models.holdingId, r.h.id));
  const version = Math.max(...versions.map((v) => v.version)) + 1;
  const ext = r.m.storagePath.endsWith(".xlsm") ? "xlsm" : "xlsx";
  const path = `${r.h.id}/v${version}-${Date.now()}.${ext}`;
  await uploadModelFile(path, patched, ext === "xlsm" ? "application/vnd.ms-excel.sheet.macroEnabled.12" : undefined);
  const sheets = (await readWorkbook(patched)).sheets;
  const [nm] = await db
    .insert(models)
    .values({ holdingId: r.h.id, version, parentId: r.m.id, storagePath: path, fileName: r.m.fileName.replace(/(\.xls[xm])$/i, `-v${version}$1`), sheets, uploadedBy: r.user.id })
    .returning({ id: models.id });
  await db.insert(modelWrites).values({ modelId: r.m.id, fromVersion: r.m.version, toVersion: version, proposalIds: approved.map((a) => a.p.id), writtenBy: r.user.id });
  // Carry mappings forward to the new version so the next quarter starts from them.
  const mappings = await db.select().from(modelMappings).where(eq(modelMappings.modelId, r.m.id));
  for (const m of mappings) {
    await db.insert(modelMappings).values({ ...m, id: undefined, modelId: nm.id, createdAt: undefined });
  }
  revalidatePath(`/t/${r.slug}/models`);
  redirect(`/t/${r.slug}/models/${nm.id}?ok=${encodeURIComponent(`Wrote ${approved.length} value${approved.length === 1 ? "" : "s"} into version ${version}`)}`);
}

// ---- helpers called from the client mapping editor ----

export async function searchConcepts(modelId: string, query: string): Promise<{ concept: string; label: string; units: string[]; count: number }[]> {
  const r = await loadModel(modelId);
  if (!r.h.cik) return [];
  const facts = await getCompanyFacts(r.h.cik);
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!q.length) return [];
  return listConcepts(facts)
    .filter((c) => q.every((w) => (c.concept + " " + c.label).toLowerCase().includes(w)))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((c) => ({ concept: c.concept, label: c.label, units: c.units, count: c.count }));
}

export async function suggestFromValue(modelId: string, periodEnd: string, value: number): Promise<ConceptSuggestion[]> {
  const r = await loadModel(modelId);
  if (!r.h.cik) return [];
  const facts = await getCompanyFacts(r.h.cik);
  return suggestConcepts(facts, periodEnd, value);
}

export async function periodEndsFor(modelId: string, concept: string, unit: string, periodType: "quarterly" | "annual"): Promise<string[]> {
  const r = await loadModel(modelId);
  if (!r.h.cik) return [];
  const facts = await getCompanyFacts(r.h.cik);
  return reportedPeriodEnds(facts, concept, unit, periodType).slice(0, 24);
}
