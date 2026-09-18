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
import { deleteModelFile, downloadModelFile, moveModelFile, signModelUpload, uploadModelFile } from "@/lib/storage";
import { MAX_MODEL_BYTES, parseStagedModelPath, stagedModelPath, validateModelFile } from "@/lib/models/upload";
import { mirrorModelToDrive } from "@/lib/drive/mirror";
import { getCompanyFacts, listConcepts } from "@/lib/providers/edgar";
import { buildProposals, reportedPeriodEnds, suggestConcepts, type ConceptSuggestion } from "@/lib/models/proposals";

async function loadModel(modelId: string) {
  const [row] = await db.select({ m: models, h: holdings, slug: teams.slug }).from(models).innerJoin(holdings, eq(holdings.id, models.holdingId)).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(models.id, modelId)).limit(1);
  if (!row) throw new Error("Model not found");
  const user = await requireTeamAccess(row.h.teamId);
  return { ...row, user, path: `/t/${row.slug}/models/${row.m.id}` };
}

async function loadHolding(holdingId: string) {
  const [row] = await db.select({ h: holdings, slug: teams.slug }).from(holdings).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(holdings.id, holdingId)).limit(1);
  if (!row) return null;
  const user = await requireTeamAccess(row.h.teamId);
  return { ...row, user };
}

// ---- model upload: sign → browser PUTs to the bucket → finalize (see components/app/models/upload-model-form.tsx) ----

export type UploadUrlResult = { ok: true; path: string; token: string } | { ok: false; error: string };
export type FinalizeUploadResult = { ok: false; error: string };

const uploadUrlSchema = z.object({ holdingId: z.string().uuid(), fileName: z.string().trim().min(1).max(255), size: z.number().int().nonnegative() });
const finalizeSchema = z.object({ holdingId: z.string().uuid(), path: z.string().min(1).max(200), fileName: z.string().trim().min(1).max(255) });

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function createModelUploadUrl(input: unknown): Promise<UploadUrlResult> {
  const parsed = uploadUrlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose an .xlsx file" };
  const { holdingId, fileName, size } = parsed.data;
  const check = validateModelFile(fileName, size);
  if (!check.ok) return check;
  const h = await loadHolding(holdingId);
  if (!h) return { ok: false, error: "Holding not found" };
  try {
    return { ok: true, ...(await signModelUpload(stagedModelPath(holdingId, check.ext))) };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

/** Reads the staged workbook, moves it to its versioned path and records the model row; redirects to the new model. */
export async function finalizeModelUpload(input: unknown): Promise<FinalizeUploadResult> {
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Upload details were incomplete" };
  const { holdingId, path, fileName } = parsed.data;
  const staged = parseStagedModelPath(path, holdingId);
  if (!staged) return { ok: false, error: "Unrecognised upload" };
  const h = await loadHolding(holdingId);
  if (!h) return { ok: false, error: "Holding not found" };
  let buffer: Buffer;
  try {
    buffer = await downloadModelFile(path);
  } catch (e) {
    return { ok: false, error: `Upload did not complete: ${errMsg(e)}` };
  }
  const fail = async (error: string): Promise<FinalizeUploadResult> => {
    await deleteModelFile(path).catch(() => {});
    return { ok: false, error };
  };
  if (buffer.length > MAX_MODEL_BYTES) return fail("File is larger than 50MB");
  let sheets;
  try {
    sheets = (await readWorkbook(buffer)).sheets;
  } catch (e) {
    return fail(`Could not read workbook: ${errMsg(e)}`);
  }
  const existing = await db.select({ version: models.version }).from(models).where(eq(models.holdingId, holdingId));
  const version = existing.length ? Math.max(...existing.map((v) => v.version)) + 1 : 1;
  const finalPath = `${holdingId}/v${version}-${Date.now()}.${staged.ext}`;
  await moveModelFile(path, finalPath);
  const [m] = await db.insert(models).values({ holdingId, version, storagePath: finalPath, fileName, sheets, uploadedBy: h.user.id }).returning({ id: models.id });
  await mirrorModel({ holdingId, buffer, ext: staged.ext, uploadedBy: h.user.id });
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
  await mirrorModel({ holdingId: r.h.id, buffer: patched, ext, uploadedBy: r.user.id });
  // Carry mappings forward to the new version so the next quarter starts from them.
  const mappings = await db.select().from(modelMappings).where(eq(modelMappings.modelId, r.m.id));
  for (const m of mappings) {
    await db.insert(modelMappings).values({ ...m, id: undefined, modelId: nm.id, createdAt: undefined });
  }
  revalidatePath(`/t/${r.slug}/models`);
  redirect(`/t/${r.slug}/models/${nm.id}?ok=${encodeURIComponent(`Wrote ${approved.length} value${approved.length === 1 ? "" : "s"} into version ${version}`)}`);
}

/** Best-effort copy to the Fund's Drive; a Drive problem never blocks the model flow. */
async function mirrorModel(p: { holdingId: string; buffer: Buffer; ext: "xlsx" | "xlsm"; uploadedBy: string }) {
  try {
    await mirrorModelToDrive(p);
  } catch (e) {
    console.warn("[drive] model mirror failed", e instanceof Error ? e.message : e);
  }
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
