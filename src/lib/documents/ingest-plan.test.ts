import { describe, expect, it } from "vitest";
import { ingestNeeds, isIngestible, pickIngestCandidates, type IngestRow } from "./ingest-plan";
import { SUMMARY_VERSION } from "@/lib/drive/summary";

const t1 = new Date("2025-01-01T00:00:00Z");
const t2 = new Date("2025-02-01T00:00:00Z");
const v1 = t1.toISOString();
const v2 = t2.toISOString();

function row(over: Partial<IngestRow> = {}): IngestRow {
  return {
    id: "f1",
    kind: "drive",
    holdingId: "h1",
    version: v1,
    publishedAt: t1,
    textFor: null,
    textError: null,
    summaryFor: null,
    summaryVersion: null,
    summaryError: null,
    embedModel: null,
    embedFor: null,
    ingestAttempts: 0,
    ingestAttemptedAt: null,
    drive: { name: "AXP Initiating Coverage.pdf", mimeType: "application/pdf", isFolder: false, size: 1000 },
    ...over,
  };
}

function filing(over: Partial<IngestRow> = {}): IngestRow {
  return row({ id: "d1", kind: "filing", version: "0000004962-25-000010", drive: undefined, ...over });
}

const cfg = { embedModel: "nvidia/nemotron-3-embed-1b:free", embedEnabled: true };

describe("isIngestible", () => {
  it("rejects folders, unmatched files, unsupported types, and oversized files", () => {
    expect(isIngestible(row())).toBe(true);
    expect(isIngestible(row({ drive: { name: "x", mimeType: "application/pdf", isFolder: true, size: 1 } }))).toBe(false);
    expect(isIngestible(row({ holdingId: null }))).toBe(false);
    expect(isIngestible(row({ drive: { name: "chart.png", mimeType: "image/png", isFolder: false, size: 1 } }))).toBe(false);
    expect(isIngestible(row({ drive: { name: "x.pdf", mimeType: "application/pdf", isFolder: false, size: 30 * 1024 * 1024 } }))).toBe(false);
    expect(isIngestible(row({ drive: { name: "notes.docx", mimeType: "application/octet-stream", isFolder: false, size: 1 } }))).toBe(true);
    expect(isIngestible(row({ drive: { name: "doc", mimeType: "application/vnd.google-apps.document", isFolder: false, size: null } }))).toBe(true);
    expect(isIngestible(row({ drive: null }))).toBe(false);
  });
  it("accepts filings matched to a holding without any Drive facts", () => {
    expect(isIngestible(filing())).toBe(true);
    expect(isIngestible(filing({ holdingId: null }))).toBe(false);
  });
});

describe("ingestNeeds", () => {
  it("needs everything for a brand-new file", () => {
    expect(ingestNeeds(row(), cfg)).toEqual({ text: true, summary: true, embed: true });
  });

  it("needs nothing when every step matches the current version", () => {
    const r = row({ textFor: v1, summaryFor: v1, summaryVersion: SUMMARY_VERSION, embedFor: v1, embedModel: cfg.embedModel });
    expect(ingestNeeds(r, cfg)).toEqual({ text: false, summary: false, embed: false });
  });

  it("needs nothing when extraction failed for this version", () => {
    expect(ingestNeeds(row({ textFor: v1, textError: "unsupported: x" }), cfg)).toEqual({ text: false, summary: false, embed: false });
  });

  it("re-extracts and redoes everything when the file changed", () => {
    const r = row({ version: v2, textFor: v1, textError: "old", summaryFor: v1, summaryVersion: SUMMARY_VERSION, embedFor: v1, embedModel: cfg.embedModel });
    expect(ingestNeeds(r, cfg)).toEqual({ text: true, summary: true, embed: true });
  });

  it("re-summarizes on a version bump or a stored error, keeps a fresh embedding", () => {
    const base = row({ textFor: v1, summaryFor: v1, summaryVersion: SUMMARY_VERSION, embedFor: v1, embedModel: cfg.embedModel });
    expect(ingestNeeds({ ...base, summaryVersion: SUMMARY_VERSION - 1 }, cfg)).toEqual({ text: true, summary: true, embed: false });
    expect(ingestNeeds({ ...base, summaryError: "boom" }, cfg)).toEqual({ text: true, summary: true, embed: false });
  });

  it("re-embeds when the embedding model changed, and skips embedding when disabled", () => {
    const base = row({ textFor: v1, summaryFor: v1, summaryVersion: SUMMARY_VERSION, embedFor: v1, embedModel: "openai/text-embedding-3-small" });
    expect(ingestNeeds(base, cfg)).toEqual({ text: true, summary: false, embed: true });
    expect(ingestNeeds(base, { ...cfg, embedEnabled: false, embedModel: null })).toEqual({ text: false, summary: false, embed: false });
  });

  it("requeues the whole corpus when the admin switches models, including filings", () => {
    const done = filing({ textFor: "0000004962-25-000010", embedFor: "0000004962-25-000010", embedModel: cfg.embedModel });
    expect(ingestNeeds(done, cfg)).toEqual({ text: false, summary: false, embed: false });
    expect(ingestNeeds(done, { ...cfg, embedModel: "perplexity/pplx-embed-v1-0.6b" })).toEqual({ text: true, summary: false, embed: true });
  });

  it("never asks for a summary on a filing", () => {
    expect(ingestNeeds(filing(), cfg)).toEqual({ text: true, summary: false, embed: true });
    expect(ingestNeeds(filing({ textFor: "0000004962-25-000010", textError: "EDGAR 404" }), cfg)).toEqual({ text: false, summary: false, embed: false });
  });
});

describe("pickIngestCandidates", () => {
  const now = new Date("2025-03-01T12:00:00Z");
  const opts = { max: 2, now, retryAfterMs: 3600_000, maxAttempts: 3 };

  it("orders newest first across kinds and reports the remainder", () => {
    const rows = [row({ id: "old", publishedAt: t1 }), filing({ id: "new", publishedAt: t2 }), row({ id: "mid", publishedAt: new Date("2025-01-15T00:00:00Z") })];
    const { picked, remaining } = pickIngestCandidates(rows, cfg, opts);
    expect(picked.map((r) => r.id)).toEqual(["new", "mid"]);
    expect(remaining).toBe(1);
  });

  it("skips done files, poison files, and recent failures", () => {
    const done = row({ id: "done", textFor: v1, summaryFor: v1, summaryVersion: SUMMARY_VERSION, embedFor: v1, embedModel: cfg.embedModel });
    const poison = row({ id: "poison", ingestAttempts: 3 });
    const recent = row({ id: "recent", ingestAttempts: 1, ingestAttemptedAt: new Date(now.getTime() - 60_000) });
    const retry = row({ id: "retry", ingestAttempts: 1, ingestAttemptedAt: new Date(now.getTime() - 2 * 3600_000) });
    const { picked, remaining } = pickIngestCandidates([done, poison, recent, retry], cfg, opts);
    expect(picked.map((r) => r.id)).toEqual(["retry"]);
    expect(remaining).toBe(0);
  });
});
