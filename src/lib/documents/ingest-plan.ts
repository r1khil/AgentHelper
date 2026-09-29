import type { DocumentKind } from "@/db/schema";
import { MAX_DOWNLOAD_BYTES, isExtractableMime } from "@/lib/drive/mime";
import { SUMMARY_VERSION, isFailedSummary, type DocSummary } from "@/lib/drive/summary";

/** The columns the planner needs for any corpus row; Drive rows also carry their file facts. Pure module, no DB. */
export type IngestRow = {
  id: string;
  kind: DocumentKind;
  holdingId: string | null;
  /** Freshness key: Drive modifiedTime ISO, filing accession. */
  version: string;
  publishedAt: Date | null;
  textFor: string | null;
  textError: string | null;
  summaryFor: string | null;
  summaryVersion: number | null;
  summaryError: string | null;
  summary: DocSummary | null;
  embedModel: string | null;
  embedFor: string | null;
  ingestAttempts: number;
  ingestAttemptedAt: Date | null;
  /** Present for kind "drive" (null when the index row is gone). */
  drive?: { name: string; mimeType: string; isFolder: boolean; size: number | null } | null;
};

/** summaryEnabled false (the default since 2026-09-29) never writes new Drive summaries; existing ones are kept. */
export type IngestConfig = { summaryVersion?: number; summaryEnabled?: boolean; embedModel: string | null; embedEnabled: boolean };
export type IngestNeeds = { text: boolean; summary: boolean; embed: boolean };

/** Only Drive documents get the structured summary; its prompt is about theses and ratings, not filings. */
export function summaryApplies(kind: DocumentKind): boolean {
  return kind === "drive";
}

/** Whether a row can be ingested at all: matched to a holding, and for Drive files a real file of a type we parse, not oversized. */
export function isIngestible(row: IngestRow): boolean {
  if (!row.holdingId) return false;
  if (row.kind === "drive") {
    const d = row.drive;
    if (!d || d.isFolder) return false;
    if (d.size !== null && d.size > MAX_DOWNLOAD_BYTES) return false;
    return isExtractableMime(d.mimeType, d.name);
  }
  return row.kind === "filing";
}

/**
 * What still has to happen for this version of the document. A step is fresh when its `*_for` equals the row's
 * version; embeddings are also stale when the model changed, so a model switch requeues the whole corpus. A failed
 * summary (summary_error, or a failed parse stored as a summary by older code) stays due; the attempt cap in
 * pickIngestCandidates bounds the retries.
 */
export function ingestNeeds(row: IngestRow, cfg: IngestConfig): IngestNeeds {
  const textFresh = row.textFor === row.version;
  if (textFresh && row.textError) return { text: false, summary: false, embed: false };
  const version = cfg.summaryVersion ?? SUMMARY_VERSION;
  const summaryFresh = !cfg.summaryEnabled || !summaryApplies(row.kind) || (row.summaryFor === row.version && row.summaryVersion === version && !row.summaryError && !isFailedSummary(row.summary));
  const embedFresh = !cfg.embedEnabled || (row.embedFor === row.version && row.embedModel === cfg.embedModel);
  const summary = !summaryFresh;
  const embed = !embedFresh;
  return { text: !textFresh || summary || embed, summary, embed };
}

/**
 * Provider hiccups (EDGAR or OpenRouter 5xx, rate limits, dropped connections) are not facts about the document:
 * the step stays unrecorded so the next run retries it, instead of stamping the version as failed.
 */
export function isTransientIngestError(message: string): boolean {
  return /rate limited|EDGAR 5\d\d|returned 5\d\d|fetch failed|ECONN|ETIMEDOUT|socket hang up/i.test(message);
}

/** The shape of a run result the job_runs summary needs; the full type lives in the server-only job module. */
export type IngestRunOutcome = { status: string; reason?: string; failed: unknown[] };

/**
 * The job_runs summary for an ingest run. `reason` stays the trigger ("admin", "reembed", "morning"), which the
 * Admin table and queries key on; the message a run stopped with (the 429 text, for instance) goes under `stopped`
 * instead of being overwritten by the trigger.
 */
export function ingestRunSummary<T extends IngestRunOutcome>(result: T, opts: { reason: string; kinds: readonly string[] }): Omit<T, "reason"> & { reason: string; kinds: readonly string[]; stopped?: string } {
  const { reason: stopped, ...rest } = result;
  return { ...rest, reason: opts.reason, kinds: opts.kinds, failed: result.failed.slice(0, 20), ...(stopped ? { stopped } : {}) };
}

export function needsAnything(n: IngestNeeds): boolean {
  return n.text || n.summary || n.embed;
}

export type PickOptions = { max: number; now: Date; retryAfterMs: number; maxAttempts: number };

/** Rows worth working on now, newest first; poison rows (attempt cap) and recently failed ones are skipped. */
export function pickIngestCandidates(rows: IngestRow[], cfg: IngestConfig, opts: PickOptions): { picked: IngestRow[]; remaining: number } {
  const eligible = rows.filter((r) => {
    if (!isIngestible(r)) return false;
    if (!needsAnything(ingestNeeds(r, cfg))) return false;
    if (r.ingestAttempts >= opts.maxAttempts) return false;
    if (r.ingestAttempts > 0 && r.ingestAttemptedAt && opts.now.getTime() - r.ingestAttemptedAt.getTime() < opts.retryAfterMs) return false;
    return true;
  });
  eligible.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return { picked: eligible.slice(0, Math.max(0, opts.max)), remaining: Math.max(0, eligible.length - opts.max) };
}
