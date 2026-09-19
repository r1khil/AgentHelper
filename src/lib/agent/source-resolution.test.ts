import { describe, expect, it } from "vitest";
import type { Source } from "@/lib/providers/types";
import { documentId, enrichLegacySource, externalUrl, resolveSource, supportingRange } from "./source-resolution";

const source: Source = { id: "sec-1", title: "Quarterly filing", publisher: "SEC EDGAR", retrievedAt: "2026-09-19", url: "https://www.sec.gov/Archives/filing.htm" };

describe("source resolution", () => {
  it("opens SEC, earnings release, transcript and presentation URLs without changing the document", () => {
    for (const url of [source.url!, "https://investors.example.com/earnings", "https://investors.example.com/transcript", "https://investors.example.com/deck.pdf"]) {
      expect(resolveSource({ ...source, url })).toEqual({ kind: "external", href: url });
    }
  });
  it("keeps page and passage locators on the real document URL", () => {
    expect(resolveSource({ ...source, url: "https://example.com/deck.pdf", location: { page: 4 } })).toEqual({ kind: "external", href: "https://example.com/deck.pdf#page=4" });
    expect(resolveSource({ ...source, url: "https://example.com/filing.htm#item2", location: { text: "Revenue\n grew 8%" } })).toEqual({
      kind: "external",
      href: "https://example.com/filing.htm#item2:~:text=Revenue%20grew%208%25",
    });
  });
  it("uses exact internal identity even without a URL and recovers legacy Drive identities", () => {
    expect(resolveSource({ ...source, documentId: "file_123", url: undefined })).toEqual({ kind: "document", documentId: "file_123" });
    for (const url of ["https://drive.google.com/file/d/file_123/view", "https://docs.google.com/document/d/file_123/edit"]) {
      expect(documentId({ ...source, id: "drive-1", url })).toBe("file_123");
    }
    expect(documentId({ ...source, id: "drive-1", url: "https://evil.example/d/file_123" })).toBeNull();
  });
  it("never turns missing or unsafe metadata into an empty/current-page anchor", () => {
    for (const url of [
      undefined,
      "",
      "src:sec-1",
      "doc-1",
      "#",
      "/t/it/agent",
      "//example.com",
      "javascript:alert(1)",
      "data:text/html,bad",
      "https://user:password@example.com",
    ]) {
      expect(externalUrl(url)).toBeNull();
      expect(resolveSource({ ...source, url }).kind).toBe("unavailable");
    }
    expect(resolveSource().kind).toBe("unavailable");
  });
  it("recovers the actual supporting passage from persisted tool data", () => {
    expect(enrichLegacySource(source, { sourceId: source.id, text: "Revenue grew 8%", item: "2", offset: 40 })).toMatchObject({
      excerpt: "Revenue grew 8%",
      location: { section: "Item 2", offset: 40, text: "Revenue grew 8%" },
    });
    expect(enrichLegacySource(source, { sourceId: "other", text: "Wrong passage" }).excerpt).toBeUndefined();
  });
  it("locates and highlights only matching passages, falling back for removed text", () => {
    const text = "Introduction. Revenue\n grew 8%. Ending.";
    const range = supportingRange(text, "Revenue grew 8%.")!;
    expect(text.slice(range.start, range.end)).toBe("Revenue\n grew 8%.");
    expect(supportingRange(text, "Revenue grew 20%.")).toBeNull();
    expect(supportingRange(text)).toBeNull();
    expect(supportingRange("EPS $2.10 (GAAP)", "$2.10 (GAAP)")).toEqual({ start: 4, end: 16 });
  });
});
