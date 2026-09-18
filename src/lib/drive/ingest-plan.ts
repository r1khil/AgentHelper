import type { DriveDocKind } from "@/db/schema";
import { MAX_DOWNLOAD_BYTES, isExtractableMime } from "./mime";
import { SUMMARY_VERSION } from "./summary";

/** The columns the planner needs; a full DriveFileMeta satisfies it. Pure module, no DB. */
export type IngestRow = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  holdingId: string | null;
  kind: DriveDocKind | null;
  size: number | null;
  modifiedTime: Date | null;
  textModifiedTime: Date | null;
  textError: string | null;
  summaryModifiedTime: Date | null;
  summaryVersion: number | null;
  summaryError: string | null;
  embedModifiedTime: Date | null;
  embedModel: string | null;
  ingestAttempts: number;
  ingestAttemptedAt: Date | null;
};

export type IngestConfig = { summaryVersion?: number; embedModel: string | null; embedEnabled: boolean };
export type IngestNeeds = { text: boolean; summary: boolean; embed: boolean };

const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? -1) === (b?.getTime() ?? -2);

/** Whether a file can be ingested at all: a real file, matched to a holding, of a type we parse, not oversized. */
export function isIngestible(row: IngestRow): boolean {
  if (row.isFolder || !row.holdingId) return false;
  if (row.size !== null && row.size > MAX_DOWNLOAD_BYTES) return false;
  return isExtractableMime(row.mimeType, row.name);
}

/**
 * What still has to happen for this version of the file. Mirrors the staleness rule in getFileText:
 * a step is fresh when its recorded modified time equals the file's current one.
 */
export function ingestNeeds(row: IngestRow, cfg: IngestConfig): IngestNeeds {
  const textFresh = same(row.textModifiedTime, row.modifiedTime);
  if (textFresh && row.textError) return { text: false, summary: false, embed: false };
  const version = cfg.summaryVersion ?? SUMMARY_VERSION;
  const summaryFresh = same(row.summaryModifiedTime, row.modifiedTime) && row.summaryVersion === version && !row.summaryError;
  const embedFresh = !cfg.embedEnabled || (same(row.embedModifiedTime, row.modifiedTime) && row.embedModel === cfg.embedModel);
  const summary = !summaryFresh;
  const embed = !embedFresh;
  return { text: !textFresh || summary || embed, summary, embed };
}

export function needsAnything(n: IngestNeeds): boolean {
  return n.text || n.summary || n.embed;
}

export type PickOptions = { max: number; now: Date; retryAfterMs: number; maxAttempts: number };

/** Files worth working on now, newest first; poison files (attempt cap) and recently failed ones are skipped. */
export function pickIngestCandidates(rows: IngestRow[], cfg: IngestConfig, opts: PickOptions): { picked: IngestRow[]; remaining: number } {
  const eligible = rows.filter((r) => {
    if (!isIngestible(r)) return false;
    if (!needsAnything(ingestNeeds(r, cfg))) return false;
    if (r.ingestAttempts >= opts.maxAttempts) return false;
    if (r.ingestAttempts > 0 && r.ingestAttemptedAt && opts.now.getTime() - r.ingestAttemptedAt.getTime() < opts.retryAfterMs) return false;
    return true;
  });
  eligible.sort((a, b) => (b.modifiedTime?.getTime() ?? 0) - (a.modifiedTime?.getTime() ?? 0));
  return { picked: eligible.slice(0, Math.max(0, opts.max)), remaining: Math.max(0, eligible.length - opts.max) };
}
