import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { driveConnection, driveFiles, holdingProposals, holdings, jobRuns } from "@/db/schema";
import { embedTexts, embeddingConfigured, embeddingModelId } from "@/lib/agent/embeddings";
import { DriveNotConnected, driveConfigured, loadConnection } from "@/lib/drive/auth";
import { chunkHeader, chunkText } from "@/lib/drive/chunk";
import { getFileText, type DriveFileMeta } from "@/lib/drive/index";
import { ingestNeeds, isIngestible, pickIngestCandidates, type IngestConfig } from "@/lib/drive/ingest-plan";
import { proposalEligibility } from "@/lib/drive/proposals";
import { replaceFileChunks } from "@/lib/drive/search";
import { SUMMARY_VERSION, isEmptySummary, type DocSummary } from "@/lib/drive/summary";
import { summarizeDocument } from "@/lib/drive/summarize";

export type IngestResult = {
  status: "ok" | "skipped" | "failed";
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

const DEFAULT_BUDGET_MS = 200_000;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 6 * 3600_000;
/** A run older than this is assumed dead (function killed) and its lock is ignored. */
const INGEST_LOCK_STALE_MS = 6 * 60_000;

/** Atomically claim the ingest lock unless a run started recently. */
async function claimIngestLock(): Promise<boolean> {
  const claimed = await db
    .update(driveConnection)
    .set({ ingestStartedAt: new Date() })
    .where(and(eq(driveConnection.id, 1), or(isNull(driveConnection.ingestStartedAt), lt(driveConnection.ingestStartedAt, new Date(Date.now() - INGEST_LOCK_STALE_MS)))))
    .returning({ id: driveConnection.id });
  return claimed.length > 0;
}

async function releaseIngestLock() {
  await db.update(driveConnection).set({ ingestStartedAt: null }).where(eq(driveConnection.id, 1)).catch(() => undefined);
}

function maxFilesDefault() {
  const n = Number(process.env.DRIVE_INGEST_MAX_FILES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15;
}

function ingestConfig(): IngestConfig {
  const on = embeddingConfigured();
  return { summaryVersion: SUMMARY_VERSION, embedEnabled: on, embedModel: on ? embeddingModelId() : null };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Work through files that still need text, a summary, or embeddings, newest first, until the budget or the file cap
 * runs out. Resumable: every step records what version it covered, so the next run picks up where this one stopped.
 * One run at a time across the deployment (a second caller gets "skipped: already running"). Records a job_runs row
 * ("drive_ingest"). Never touches Drive beyond reading file content.
 */
export async function runDriveIngest(opts: { reason: string; budgetMs?: number; maxFiles?: number; fileIds?: string[] }): Promise<IngestResult> {
  const started = Date.now();
  const result: IngestResult = { status: "ok", considered: 0, textExtracted: 0, summarized: 0, embedded: 0, proposals: 0, failed: [], remaining: 0, elapsedMs: 0 };
  const done = (r: IngestResult) => ({ ...r, elapsedMs: Date.now() - started });
  if (!driveConfigured()) return done({ ...result, status: "skipped", reason: "not configured" });
  if (!process.env.OPENROUTER_API_KEY) return done({ ...result, status: "skipped", reason: "OPENROUTER_API_KEY not configured" });
  const conn = await loadConnection();
  if (!conn?.rootFolderId) return done({ ...result, status: "skipped", reason: "not connected" });
  if (conn.lastError?.startsWith("reconnect:")) return done({ ...result, status: "skipped", reason: "needs reconnect" });

  if (!(await claimIngestLock())) return done({ ...result, status: "skipped", reason: "already running" });
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = started + budgetMs;
  const cfg = ingestConfig();
  const [jobRow] = await db.insert(jobRuns).values({ job: "drive_ingest", summary: { reason: opts.reason } }).returning({ id: jobRuns.id });
  try {
    const where = opts.fileIds
      ? opts.fileIds.length
        ? inArray(driveFiles.id, opts.fileIds)
        : sql`false`
      : and(eq(driveFiles.isFolder, false), isNotNull(driveFiles.holdingId));
    const rows = await db.select().from(driveFiles).where(where);
    const { picked, remaining } = pickIngestCandidates(rows, cfg, { max: opts.maxFiles ?? maxFilesDefault(), now: new Date(), retryAfterMs: RETRY_AFTER_MS, maxAttempts: MAX_ATTEMPTS });
    result.remaining = remaining;
    for (const row of picked) {
      if (Date.now() > deadline) {
        result.remaining += 1;
        continue;
      }
      result.considered += 1;
      await ingestOne(row.id, cfg, result);
    }
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: { ...done(result), reason: opts.reason, failed: result.failed.slice(0, 20) } }).where(eq(jobRuns.id, jobRow.id));
    return done(result);
  } catch (e) {
    const message = msg(e);
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: { ...done(result), error: message, reason: opts.reason } }).where(eq(jobRuns.id, jobRow.id));
    return done({ ...result, status: "failed", reason: message });
  } finally {
    await releaseIngestLock();
  }
}

/** Ingest one file now (upload route, webhook). Skips quietly when nothing is needed. Never throws. */
export async function ingestFile(fileId: string, opts: { reason: string }): Promise<void> {
  try {
    if (!driveConfigured() || !process.env.OPENROUTER_API_KEY) return;
    const result: IngestResult = { status: "ok", considered: 1, textExtracted: 0, summarized: 0, embedded: 0, proposals: 0, failed: [], remaining: 0, elapsedMs: 0 };
    await ingestOne(fileId, ingestConfig(), result);
    if (result.failed.length) console.warn(`[drive] ingest (${opts.reason}) had failures`, result.failed);
  } catch (e) {
    console.warn(`[drive] ingest (${opts.reason}) failed`, e);
  }
}

const g = globalThis as unknown as { __driveIngestCheckedAt?: number };

/**
 * Cheap gate for request paths: at most one check per 5 minutes per process, a small claimed batch when there is
 * anything to do. Callers run it inside `after()` so it never delays a response. Never throws.
 */
export async function ensureDriveIngested() {
  if (!driveConfigured() || !process.env.OPENROUTER_API_KEY) return;
  if (g.__driveIngestCheckedAt && Date.now() - g.__driveIngestCheckedAt < 5 * 60_000) return;
  g.__driveIngestCheckedAt = Date.now();
  try {
    await runDriveIngest({ reason: "lazy", maxFiles: 3, budgetMs: 120_000 });
  } catch (e) {
    console.warn("[drive] lazy ingest failed", e);
  }
}

async function ingestOne(fileId: string, cfg: IngestConfig, result: IngestResult) {
  const [row] = await db.select().from(driveFiles).where(eq(driveFiles.id, fileId)).limit(1);
  if (!row || !isIngestible(row)) return;
  const needs = ingestNeeds(row, cfg);
  if (!needs.text && !needs.summary && !needs.embed) return;
  const fail = (step: string, e: unknown) => result.failed.push({ id: fileId, step, error: msg(e).slice(0, 300) });
  let ok = true;

  // 1. Text (cached on the row by getFileText; a stored textError means this version cannot be read).
  let meta: DriveFileMeta;
  let text: string;
  try {
    const r = await getFileText(fileId);
    meta = r.meta;
    text = r.text;
    if (!row.textModifiedTime || row.textModifiedTime.getTime() !== row.modifiedTime?.getTime()) result.textExtracted += 1;
  } catch (e) {
    if (e instanceof DriveNotConnected) throw e;
    fail("text", e);
    await bumpAttempts(fileId, false);
    return;
  }

  // 2. Summary.
  let summary: DocSummary | null = row.summary;
  if (needs.summary) {
    try {
      const s = await summarizeDocument(meta, text);
      summary = s.summary;
      await db
        .update(driveFiles)
        .set({ summary: s.summary, summaryModel: s.model, summaryVersion: SUMMARY_VERSION, summaryModifiedTime: row.modifiedTime, summaryError: null, summarizedAt: new Date(), docDate: s.summary.docDate })
        .where(eq(driveFiles.id, fileId));
      result.summarized += 1;
    } catch (e) {
      ok = false;
      fail("summary", e);
      await db.update(driveFiles).set({ summaryError: msg(e).slice(0, 500), summaryModifiedTime: row.modifiedTime }).where(eq(driveFiles.id, fileId));
    }
  }

  // 3. Embeddings.
  if (needs.embed && cfg.embedEnabled && cfg.embedModel) {
    try {
      const chunks = chunkText(text);
      const header = chunkHeader({ name: meta.name, ticker: meta.ticker, kind: meta.kind, docDate: summary?.docDate ?? null });
      const vectors = chunks.length ? await embedTexts(chunks.map((c) => `${header}\n${c.text}`)) : [];
      await replaceFileChunks(meta, chunks, vectors, cfg.embedModel);
      await db.update(driveFiles).set({ embedModel: cfg.embedModel, embedModifiedTime: row.modifiedTime, embedError: null, embeddedAt: new Date() }).where(eq(driveFiles.id, fileId));
      result.embedded += 1;
    } catch (e) {
      ok = false;
      fail("embed", e);
      await db.update(driveFiles).set({ embedError: msg(e).slice(0, 500), embedModifiedTime: row.modifiedTime }).where(eq(driveFiles.id, fileId));
    }
  }

  // 4. Thesis proposal (only from a fresh, non-empty summary).
  if (summary && !isEmptySummary(summary) && row.holdingId) {
    try {
      if (await maybeProposeThesis({ ...meta, holdingId: row.holdingId }, summary)) result.proposals += 1;
    } catch (e) {
      fail("proposal", e);
    }
  }

  await bumpAttempts(fileId, ok);
}

async function bumpAttempts(fileId: string, ok: boolean) {
  await db
    .update(driveFiles)
    .set(ok ? { ingestAttempts: 0, ingestAttemptedAt: new Date() } : { ingestAttempts: sql`${driveFiles.ingestAttempts} + 1`, ingestAttemptedAt: new Date() })
    .where(eq(driveFiles.id, fileId));
}

/** Propose the holding's thesis from an initiating coverage report when the holding has none. Returns true when a row was written. */
async function maybeProposeThesis(meta: DriveFileMeta & { holdingId: string }, summary: DocSummary): Promise<boolean> {
  if (meta.kind !== "initiating_coverage") return false;
  const [h] = await db.select({ thesis: holdings.thesis }).from(holdings).where(eq(holdings.id, meta.holdingId)).limit(1);
  if (!h) return false;
  const existing = await db
    .select({ id: holdingProposals.id, status: holdingProposals.status, sourceFileId: holdingProposals.sourceFileId, sourceModifiedTime: holdingProposals.sourceModifiedTime, proposed: holdingProposals.proposed })
    .from(holdingProposals)
    .where(and(eq(holdingProposals.holdingId, meta.holdingId), eq(holdingProposals.field, "thesis")));
  const d = proposalEligibility({ holdingThesis: h.thesis, fileKind: meta.kind, summaryThesis: summary.thesis, fileId: meta.id, fileModifiedTime: meta.modifiedTime, existing });
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
