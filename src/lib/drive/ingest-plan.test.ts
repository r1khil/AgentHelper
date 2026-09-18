import { describe, expect, it } from "vitest";
import { ingestNeeds, isIngestible, pickIngestCandidates, type IngestRow } from "./ingest-plan";
import { SUMMARY_VERSION } from "./summary";

const t1 = new Date("2025-01-01T00:00:00Z");
const t2 = new Date("2025-02-01T00:00:00Z");

function row(over: Partial<IngestRow> = {}): IngestRow {
  return {
    id: "f1",
    name: "AXP Initiating Coverage.pdf",
    mimeType: "application/pdf",
    isFolder: false,
    holdingId: "h1",
    kind: "initiating_coverage",
    size: 1000,
    modifiedTime: t1,
    textModifiedTime: null,
    textError: null,
    summaryModifiedTime: null,
    summaryVersion: null,
    summaryError: null,
    embedModifiedTime: null,
    embedModel: null,
    ingestAttempts: 0,
    ingestAttemptedAt: null,
    ...over,
  };
}

const cfg = { embedModel: "openai/text-embedding-3-small", embedEnabled: true };

describe("isIngestible", () => {
  it("rejects folders, unmatched files, unsupported types, and oversized files", () => {
    expect(isIngestible(row())).toBe(true);
    expect(isIngestible(row({ isFolder: true }))).toBe(false);
    expect(isIngestible(row({ holdingId: null }))).toBe(false);
    expect(isIngestible(row({ mimeType: "image/png", name: "chart.png" }))).toBe(false);
    expect(isIngestible(row({ size: 30 * 1024 * 1024 }))).toBe(false);
    expect(isIngestible(row({ mimeType: "application/octet-stream", name: "notes.docx" }))).toBe(true);
    expect(isIngestible(row({ mimeType: "application/vnd.google-apps.document" }))).toBe(true);
  });
});

describe("ingestNeeds", () => {
  it("needs everything for a brand-new file", () => {
    expect(ingestNeeds(row(), cfg)).toEqual({ text: true, summary: true, embed: true });
  });

  it("needs nothing when every step matches the current version", () => {
    const r = row({ textModifiedTime: t1, summaryModifiedTime: t1, summaryVersion: SUMMARY_VERSION, embedModifiedTime: t1, embedModel: cfg.embedModel });
    expect(ingestNeeds(r, cfg)).toEqual({ text: false, summary: false, embed: false });
  });

  it("needs nothing when extraction failed for this version", () => {
    expect(ingestNeeds(row({ textModifiedTime: t1, textError: "unsupported: x" }), cfg)).toEqual({ text: false, summary: false, embed: false });
  });

  it("re-extracts and redoes everything when the file changed", () => {
    const r = row({ modifiedTime: t2, textModifiedTime: t1, textError: "old", summaryModifiedTime: t1, summaryVersion: SUMMARY_VERSION, embedModifiedTime: t1, embedModel: cfg.embedModel });
    expect(ingestNeeds(r, cfg)).toEqual({ text: true, summary: true, embed: true });
  });

  it("re-summarizes on a version bump or a stored error, keeps a fresh embedding", () => {
    const base = row({ textModifiedTime: t1, summaryModifiedTime: t1, summaryVersion: SUMMARY_VERSION, embedModifiedTime: t1, embedModel: cfg.embedModel });
    expect(ingestNeeds({ ...base, summaryVersion: SUMMARY_VERSION - 1 }, cfg)).toEqual({ text: true, summary: true, embed: false });
    expect(ingestNeeds({ ...base, summaryError: "boom" }, cfg)).toEqual({ text: true, summary: true, embed: false });
  });

  it("re-embeds when the embedding model changed, and skips embedding when disabled", () => {
    const base = row({ textModifiedTime: t1, summaryModifiedTime: t1, summaryVersion: SUMMARY_VERSION, embedModifiedTime: t1, embedModel: "other" });
    expect(ingestNeeds(base, cfg)).toEqual({ text: true, summary: false, embed: true });
    expect(ingestNeeds(base, { ...cfg, embedEnabled: false, embedModel: null })).toEqual({ text: false, summary: false, embed: false });
  });
});

describe("pickIngestCandidates", () => {
  const now = new Date("2025-03-01T12:00:00Z");
  const opts = { max: 2, now, retryAfterMs: 3600_000, maxAttempts: 3 };

  it("orders newest first and reports the remainder", () => {
    const rows = [row({ id: "old", modifiedTime: t1 }), row({ id: "new", modifiedTime: t2 }), row({ id: "mid", modifiedTime: new Date("2025-01-15T00:00:00Z") })];
    const { picked, remaining } = pickIngestCandidates(rows, cfg, opts);
    expect(picked.map((r) => r.id)).toEqual(["new", "mid"]);
    expect(remaining).toBe(1);
  });

  it("skips done files, poison files, and recent failures", () => {
    const done = row({ id: "done", textModifiedTime: t1, summaryModifiedTime: t1, summaryVersion: SUMMARY_VERSION, embedModifiedTime: t1, embedModel: cfg.embedModel });
    const poison = row({ id: "poison", ingestAttempts: 3 });
    const recent = row({ id: "recent", ingestAttempts: 1, ingestAttemptedAt: new Date(now.getTime() - 60_000) });
    const retry = row({ id: "retry", ingestAttempts: 1, ingestAttemptedAt: new Date(now.getTime() - 2 * 3600_000) });
    const { picked, remaining } = pickIngestCandidates([done, poison, recent, retry], cfg, opts);
    expect(picked.map((r) => r.id)).toEqual(["retry"]);
    expect(remaining).toBe(0);
  });
});
