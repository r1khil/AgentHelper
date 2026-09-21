import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { documents, driveFiles, holdingProposals, holdings, jobRuns, type DocumentKind, type DocumentRow, type DriveDocKind } from "@/db/schema";
import { RateLimited, embedTexts, embeddingConfigured } from "@/lib/agent/embeddings";
import { embeddingModelId } from "@/lib/agent/retrieval-models";
import { DriveNotConnected, driveConfigured, loadConnection } from "@/lib/drive/auth";
import { chunkHeader } from "@/lib/drive/chunk";
import { getDocumentText } from "@/lib/documents/adapters";
import { ingestNeeds, isIngestible, isTransientIngestError, pickIngestCandidates, type IngestConfig, type IngestRow } from "@/lib/documents/ingest-plan";
import { chunkDocument } from "@/lib/documents/sections";
import { requeueOversizedEmbeds } from "@/lib/documents/index";
import { replaceChunks } from "@/lib/documents/search";
import { proposalEligibility } from "@/lib/drive/proposals";
import { SUMMARY_VERSION, isEmptySummary, type DocSummary } from "@/lib/drive/summary";
import { summarizeDocument } from "@/lib/drive/summarize";
import { claimJobLock, releaseJobLock } from "./lock";

export type IngestResult = {
  status: "ok" | "skipped" | "failed" | "rate_limited";
  reason?: string;
  considered: number;
  textExtracted: number;
  summarized: number;
  embedded: number;
  proposals: number;
  failed: { id: string; step: string; error: string }[];
  remaining: number;
  elapsedMs: number;
};

export type IngestOptions = { reason: string; budgetMs?: number; maxDocs?: number; documentIds?: string[]; kinds?: DocumentKind[] };

const DEFAULT_BUDGET_MS = 200_000;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 6 * 3600_000;
/** A run older than this is assumed dead (function killed) and its lock is ignored. */
const INGEST_LOCK_STALE_MS = 6 * 60_000;
const LOCK = "ingest";

function maxDocsDefault() {
  const n = Number(process.env.DRIVE_INGEST_MAX_FILES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15;
}

async function ingestConfig(): Promise<IngestConfig> {
  const on = embeddingConfigured();
  return { summaryVersion: SUMMARY_VERSION, embedEnabled: on, embedModel: on ? await embeddingModelId() : null };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Whether Drive rows can be read right now (configured, connected, not awaiting a reconnect). */
async function driveReadable(): Promise<boolean> {
  if (!driveConfigured()) return false;
  const conn = await loadConnection();
  return Boolean(conn?.rootFolderId) && !conn?.lastError?.startsWith("reconnect:");
}

type Candidate = DocumentRow & { drive: IngestRow["drive"] };

async function loadCandidates(opts: IngestOptions, driveOn: boolean): Promise<Candidate[]> {
  const kinds = (opts.kinds ?? ["drive", "filing"]).filter((k) => k !== "drive" || driveOn);
  if (!kinds.length) return [];
  const where = opts.documentIds ? (opts.documentIds.length ? and(inArray(documents.id, opts.documentIds), inArray(documents.kind, kinds)) : sql`false`) : and(isNotNull(documents.holdingId), inArray(documents.kind, kinds));
  const rows = await db.select({ doc: documents, drive: { name: driveFiles.name, mimeType: driveFiles.mimeType, isFolder: driveFiles.isFolder, size: driveFiles.size } }).from(documents).leftJoin(driveFiles, eq(driveFiles.documentId, documents.id)).where(where);
  return rows.map((r) => ({ ...r.doc, drive: r.doc.kind === "drive" ? (r.drive && r.drive.name !== null ? r.drive : null) : undefined }));
}

const toPlan = (c: Candidate): IngestRow => ({ ...c, drive: c.drive });

/**
 * Work through corpus rows that still need text, a summary, or embeddings, newest first, until the budget or the
 * document cap runs out. Resumable: every step records what version it covered, so the next run picks up where this
 * one stopped. One run at a time across the deployment (a second caller gets "skipped: already running"). Records
 * a job_runs row ("ingest"). Stops at once when OpenRouter rate limits the embedding model; the row stays queued.
 */
export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const started = Date.now();
  const result: IngestResult = { status: "ok", considered: 0, textExtracted: 0, summarized: 0, embedded: 0, proposals: 0, failed: [], remaining: 0, elapsedMs: 0 };
  const done = (r: IngestResult) => ({ ...r, elapsedMs: Date.now() - started });
  if (!process.env.OPENROUTER_API_KEY) return done({ ...result, status: "skipped", reason: "OPENROUTER_API_KEY not configured" });
  const driveOn = await driveReadable();
  const kinds = opts.kinds ?? ["drive", "filing"];
  if (kinds.every((k) => k === "drive") && !driveOn) return done({ ...result, status: "skipped", reason: driveConfigured() ? "Drive not connected" : "Drive not configured" });

  if (!(await claimJobLock(LOCK, INGEST_LOCK_STALE_MS))) return done({ ...result, status: "skipped", reason: "already running" });
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = started + budgetMs;
  const cfg = await ingestConfig();
  const [jobRow] = await db.insert(jobRuns).values({ job: "ingest", summary: { reason: opts.reason, kinds } }).returning({ id: jobRuns.id });
  try {
    await requeueOversizedEmbeds();
    const rows = await loadCandidates(opts, driveOn);
    const { picked, remaining } = pickIngestCandidates(rows.map(toPlan), cfg, { max: opts.maxDocs ?? maxDocsDefault(), now: new Date(), retryAfterMs: RETRY_AFTER_MS, maxAttempts: MAX_ATTEMPTS });
    result.remaining = remaining;
    for (const row of picked) {
      if (Date.now() > deadline || result.status === "rate_limited") {
        result.remaining += 1;
        continue;
      }
      result.considered += 1;
      await ingestOne(row.id, cfg, result);
    }
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: result.status !== "rate_limited", summary: { ...done(result), reason: opts.reason, kinds, failed: result.failed.slice(0, 20) } }).where(eq(jobRuns.id, jobRow.id));
    return done(result);
  } catch (e) {
    const message = msg(e);
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: { ...done(result), error: message, reason: opts.reason } }).where(eq(jobRuns.id, jobRow.id));
    return done({ ...result, status: "failed", reason: message });
  } finally {
    await releaseJobLock(LOCK);
  }
}

/** Ingest one document now (upload route, webhook). Skips quietly when nothing is needed. Never throws. */
export async function ingestDocument(documentId: string, opts: { reason: string }): Promise<void> {
  try {
    if (!process.env.OPENROUTER_API_KEY) return;
    const result: IngestResult = { status: "ok", considered: 1, textExtracted: 0, summarized: 0, embedded: 0, proposals: 0, failed: [], remaining: 0, elapsedMs: 0 };
    await ingestOne(documentId, await ingestConfig(), result);
    if (result.failed.length) console.warn(`[ingest] (${opts.reason}) had failures`, result.failed);
  } catch (e) {
    console.warn(`[ingest] (${opts.reason}) failed`, e);
  }
}

const g = globalThis as unknown as { __ingestCheckedAt?: number };

/**
 * Cheap gate for request paths: at most one check per 5 minutes per process, a small claimed batch when there is
 * anything to do. Callers run it inside `after()` so it never delays a response. Never throws.
 */
export async function ensureIngested() {
  if (!process.env.OPENROUTER_API_KEY) return;
  if (g.__ingestCheckedAt && Date.now() - g.__ingestCheckedAt < 5 * 60_000) return;
  g.__ingestCheckedAt = Date.now();
  try {
    await runIngest({ reason: "lazy", maxDocs: 3, budgetMs: 120_000 });
  } catch (e) {
    console.warn("[ingest] lazy run failed", e);
  }
}

async function ingestOne(documentId: string, cfg: IngestConfig, result: IngestResult) {
  const [row] = (await loadCandidates({ reason: "one", documentIds: [documentId] }, true)).slice(0, 1);
  if (!row || !isIngestible(toPlan(row))) return;
  const needs = ingestNeeds(toPlan(row), cfg);
  if (!needs.text && !needs.summary && !needs.embed) return;
  const fail = (step: string, e: unknown) => result.failed.push({ id: documentId, step, error: msg(e).slice(0, 300) });
  let ok = true;

  // 1. Text (cached on the row by the kind's adapter; a stored textError means this version cannot be read).
  let doc: DocumentRow;
  let text: string;
  try {
    const r = await getDocumentText(row);
    doc = r.doc;
    text = r.text;
    if (row.textFor !== row.version) result.textExtracted += 1;
  } catch (e) {
    if (e instanceof DriveNotConnected) throw e;
    fail("text", e);
    await bumpAttempts(documentId, false);
    return;
  }

  // 2. Summary (Drive documents only; the planner never asks for one on a filing).
  let summary: DocSummary | null = row.summary;
  if (needs.summary && row.drive) {
    try {
      const s = await summarizeDocument({ name: row.drive.name, kind: await driveKind(documentId), ticker: row.ticker, modifiedTime: row.publishedAt }, text);
      summary = s.summary;
      await db
        .update(documents)
        .set({ summary: s.summary, summaryModel: s.model, summaryVersion: SUMMARY_VERSION, summaryFor: row.version, summaryError: null, summarizedAt: new Date(), docDate: s.summary.docDate, updatedAt: new Date() })
        .where(eq(documents.id, documentId));
      result.summarized += 1;
    } catch (e) {
      ok = false;
      fail("summary", e);
      await db.update(documents).set({ summaryError: msg(e).slice(0, 500), summaryFor: row.version, updatedAt: new Date() }).where(eq(documents.id, documentId));
    }
  }

  // 3. Embeddings. A 429 stops the whole run: the free-model budget is shared with chat, so we wait, not retry.
  if (needs.embed && cfg.embedEnabled && cfg.embedModel) {
    try {
      const chunks = chunkDocument(row.kind, text);
      const header = chunkHeader({ name: row.title, ticker: row.ticker, kind: row.form ?? (row.drive ? (await driveKind(documentId)) : row.kind), docDate: summary?.docDate ?? row.docDate ?? row.publishedAt?.toISOString().slice(0, 10) ?? null });
      const model = cfg.embedModel;
      if (chunks.length) {
        const r = await embedTexts(chunks.map((c) => `${header}${c.section ? ` · ${c.section}` : ""}\n${c.text}`));
        if (r.model !== model) throw new Error(`Embedding model changed mid-run (${model} → ${r.model}); the next run re-embeds`);
        await replaceChunks(doc, chunks, r.vectors, model);
      } else {
        await replaceChunks(doc, [], [], model);
      }
      await db.update(documents).set({ embedModel: model, embedFor: row.version, embedError: null, embeddedAt: new Date(), updatedAt: new Date() }).where(eq(documents.id, documentId));
      result.embedded += 1;
    } catch (e) {
      if (e instanceof RateLimited) {
        result.status = "rate_limited";
        result.reason = e.message;
        result.remaining += 1;
        await db.update(documents).set({ ingestAttemptedAt: new Date(), updatedAt: new Date() }).where(eq(documents.id, documentId));
        return;
      }
      ok = false;
      fail("embed", e);
      // A provider 5xx or dropped connection says nothing about the document: leave embedFor unset so the next run retries.
      const transient = isTransientIngestError(msg(e));
      await db.update(documents).set({ embedError: msg(e).slice(0, 500), ...(transient ? {} : { embedFor: row.version }), updatedAt: new Date() }).where(eq(documents.id, documentId));
    }
  }

  // 4. Thesis proposal (only from a fresh, non-empty Drive summary).
  if (row.drive && summary && !isEmptySummary(summary) && row.holdingId) {
    try {
      if (await maybeProposeThesis({ id: row.id, name: row.drive.name, holdingId: row.holdingId, modifiedTime: row.publishedAt }, summary)) result.proposals += 1;
    } catch (e) {
      fail("proposal", e);
    }
  }

  await bumpAttempts(documentId, ok);
}

async function driveKind(fileId: string): Promise<DriveDocKind | null> {
  const [f] = await db.select({ kind: driveFiles.kind }).from(driveFiles).where(eq(driveFiles.id, fileId)).limit(1);
  return f?.kind ?? null;
}

async function bumpAttempts(documentId: string, ok: boolean) {
  await db
    .update(documents)
    .set(ok ? { ingestAttempts: 0, ingestAttemptedAt: new Date() } : { ingestAttempts: sql`${documents.ingestAttempts} + 1`, ingestAttemptedAt: new Date() })
    .where(eq(documents.id, documentId));
}

/** Propose the holding's thesis from an initiating coverage report when the holding has none. Returns true when a row was written. */
async function maybeProposeThesis(meta: { id: string; name: string; holdingId: string; modifiedTime: Date | null }, summary: DocSummary): Promise<boolean> {
  const kind = await driveKind(meta.id);
  if (kind !== "initiating_coverage") return false;
  const [h] = await db.select({ thesis: holdings.thesis }).from(holdings).where(eq(holdings.id, meta.holdingId)).limit(1);
  if (!h) return false;
  const existing = await db
    .select({ id: holdingProposals.id, status: holdingProposals.status, sourceFileId: holdingProposals.sourceFileId, sourceModifiedTime: holdingProposals.sourceModifiedTime, proposed: holdingProposals.proposed })
    .from(holdingProposals)
    .where(and(eq(holdingProposals.holdingId, meta.holdingId), eq(holdingProposals.field, "thesis")));
  const d = proposalEligibility({ holdingThesis: h.thesis, fileKind: kind, summaryThesis: summary.thesis, fileId: meta.id, fileModifiedTime: meta.modifiedTime, existing });
  if (d.action === "none") return false;
  const values = {
    proposed: summary.thesis!.trim(),
    rationale: `Extracted from ${meta.name}${summary.docDate ? ` dated ${summary.docDate}` : ""}.`,
    sourceFileId: meta.id,
    sourceFileName: meta.name,
    sourceModifiedTime: meta.modifiedTime,
  };
  if (d.action === "update" && d.pendingId) {
    await db.update(holdingProposals).set(values).where(eq(holdingProposals.id, d.pendingId));
    return true;
  }
  try {
    await db.insert(holdingProposals).values({ holdingId: meta.holdingId, field: "thesis", ...values });
    return true;
  } catch (e) {
    // The partial unique index allows one pending proposal per holding; a concurrent run got there first.
    if (msg(e).includes("holding_proposals_one_pending")) return false;
    throw e;
  }
}
