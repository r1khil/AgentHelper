import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/holdings", () => ({ listPendingProposals: vi.fn() }));
vi.mock("@/lib/providers/yahoo", () => ({}));
vi.mock("@/lib/providers/finnhub", () => ({}));
vi.mock("@/lib/drive/auth", () => ({ DriveNotConnected: Error, driveConfigured: () => true }));
vi.mock("@/lib/drive/read", () => ({ searchFullText: vi.fn() }));
vi.mock("@/lib/drive/index", () => ({
  driveStatus: async () => ({ configured: true, connected: true, rootFolderId: "root" }),
  listHoldingFiles: vi.fn(),
  searchIndex: vi.fn(),
}));
vi.mock("@/lib/documents/search", () => ({ searchChunks: vi.fn() }));
vi.mock("@/lib/documents/index", () => ({ getDocument: vi.fn(), listHoldingFilings: vi.fn(async () => []) }));
vi.mock("@/lib/documents/adapters", () => ({ getDocumentText: vi.fn() }));
vi.mock("@/lib/documents/find", () => ({ searchFilings: vi.fn(async () => []) }));
vi.mock("@/lib/web/tavily", () => ({ tavilyConfigured: () => false, searchWeb: vi.fn(), extractPage: vi.fn() }));
vi.mock("@/lib/agent/embeddings", () => ({ embeddingConfigured: () => true }));
vi.mock("@/lib/providers/edgar", async (original) => ({
  ...(await original<object>()),
  tickerToCik: async () => ({ cik: "123", name: "Example Company" }),
  getFilingText: vi.fn(),
  listFilings: vi.fn(),
  listFilingDocuments: vi.fn(),
  getCompanyFacts: vi.fn(),
}));
vi.mock("@/lib/agent/financials", () => ({
  resolveKeyFinancials: () => ({
    rows: [{ accession: "0000123-26-000001", form: "10-Q", filed: "2026-09-10", end: "2026-08-02", values: { revenue: { value: 100, concept: "Revenues" } } }],
    metrics: [],
    missing: [],
    notes: [],
  }),
  searchConcepts: vi.fn(),
}));
vi.mock("@/lib/agent/memory/store", () => ({ MARKET_FACT_TTL_DAYS: 90, rememberMemory: vi.fn(async () => ({ id: "m1", merged: false })), searchMemories: vi.fn(async () => []) }));
import { rememberMemory } from "@/lib/agent/memory/store";
import { getFilingText, listFilings, listFilingDocuments } from "@/lib/providers/edgar";
import { searchIndex } from "@/lib/drive/index";
import { getDocument } from "@/lib/documents/index";
import { getDocumentText } from "@/lib/documents/adapters";
import { searchChunks } from "@/lib/documents/search";
import { makeTools, type ToolResult } from "./tools";
import { collectSources } from "./citations";
import { resolveSource } from "./source-resolution";

const url = "https://www.sec.gov/Archives/edgar/data/123/000012326000001/quarter.htm";
const meta = {
  id: "file_123",
  name: "Internal transcript",
  docDate: "2026-09-10",
  modifiedTime: new Date("2026-09-19"),
  kind: "earnings_update",
  path: "AXP/Internal transcript.pdf",
  webViewLink: "https://drive.google.com/file/d/file_123/view",
};
const doc = { id: "file_123", kind: "drive", title: "Internal transcript", url: meta.webViewLink, version: "2026-09-19T00:00:00.000Z", publishedAt: meta.modifiedTime, docDate: "2026-09-10", form: null, sectionNote: null };
const hitMeta = { id: "file_123", kind: "drive", title: "Internal transcript", form: null, url: meta.webViewLink, publisher: "Analyst Drive", publishedAt: meta.modifiedTime, docDate: "2026-09-10", ticker: "AXP", holdingId: "h1", name: meta.name, driveKind: "earnings_update", path: meta.path, mimeType: "application/pdf", modifiedTime: meta.modifiedTime, webViewLink: meta.webViewLink, documentHeading: null };
const run = (tools: ReturnType<typeof makeTools>, name: keyof ReturnType<typeof makeTools>, args: unknown) =>
  (tools[name]!.execute as (args: unknown, options: unknown) => Promise<ToolResult<unknown>>)(args, { toolCallId: "test", messages: [] });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listFilings).mockResolvedValue([{ accession: "0000123-26-000001", form: "10-Q", filedAt: "2026-09-10", primaryDocument: "quarter.htm", url }] as never);
  vi.mocked(getFilingText).mockResolvedValue("Revenue grew 8%. Margins improved.");
  vi.mocked(getDocument).mockResolvedValue(doc as never);
  vi.mocked(getDocumentText).mockResolvedValue({ doc, text: "Opening remarks. Revenue grew 8%. Questions." } as never);
  vi.mocked(searchIndex).mockResolvedValue([meta] as never);
});

describe("retrieval citation metadata", () => {
  it("carries filing title/date and distinct passage ids through tool outputs and saved messages", async () => {
    const tools = makeTools({ teamId: "team", userId: "user" });
    await run(tools, "get_filings", { ticker: "EX", limit: 5 });
    const a = await run(tools, "read_filing", { url, offset: 0, maxChars: 15 });
    const b = await run(tools, "read_filing", { url, offset: 16, maxChars: 30 });
    expect(a.sources[0]).toMatchObject({ title: "Example Company 10-Q filed 2026-09-10", publishedAt: "2026-09-10", excerpt: "Revenue grew 8%", location: { offset: 0 } });
    expect(a.sources[0].id).not.toBe(b.sources[0].id);
    const saved = JSON.parse(
      JSON.stringify([{ id: "a", role: "assistant", parts: [a, b].map((output, i) => ({ type: "tool-read_filing", toolCallId: String(i), state: "output-available", output })) }]),
    );
    const sources = collectSources(saved);
    expect(sources.size).toBe(2);
    expect(resolveSource(sources.get(a.sources[0].id))).toMatchObject({ kind: "external" });
  });
  it("preserves earnings-release titles from exhibit retrieval", async () => {
    const tools = makeTools({ teamId: "team", userId: "user" });
    vi.mocked(listFilingDocuments).mockResolvedValue([{ name: "release.htm", description: "Quarterly earnings release", type: "EX-99.1", url }]);
    await run(tools, "list_filing_documents", { ticker: "EX", accession: "0000123-26-000001" });
    const result = await run(tools, "read_filing", { url, offset: 0, maxChars: 500 });
    expect(result.sources[0]).toMatchObject({ title: "Example Company — Quarterly earnings release", sourceType: "Earnings release", url });
  });
  it("resolves XBRL citations to primary filing documents", async () => {
    const result = await run(makeTools({ teamId: "team", userId: "user" }), "get_key_financials", { ticker: "EX", periodKind: "quarter", periods: 1 });
    expect(result.sources[0].url).toBe(url);
  });
  it("preserves internal document identity, publication date and supporting excerpts", async () => {
    const tools = makeTools({ teamId: "team", userId: "user" });
    const result = await run(tools, "read_document", { documentId: meta.id, offset: 17, maxChars: 16 });
    expect(result.sources[0]).toMatchObject({ documentId: meta.id, publishedAt: "2026-09-10", sourceType: "earnings update", excerpt: "Revenue grew 8%.", location: { offset: 17, text: "Revenue grew 8%." } });
    expect(resolveSource(result.sources[0])).toEqual({ kind: "document", documentId: meta.id });
    expect(result.data).toMatchObject({ documentId: meta.id, kind: "drive", name: meta.name, documentType: "Earnings transcript" });
  });
  it("assigns distinct sources to multiple retrieved passages in the same document", async () => {
    vi.mocked(searchChunks).mockResolvedValue([
      { documentId: meta.id, seq: 0, section: null, text: "Revenue grew 8%.", score: 0.9, via: "hybrid", meta: hitMeta },
      { documentId: meta.id, seq: 1, section: null, text: "Margins improved.", score: 0.8, via: "text", meta: hitMeta },
    ] as never);
    const result = await run(makeTools({ teamId: "team", userId: "user" }), "search_documents", { query: "results", limit: 6 });
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].id).not.toBe(result.sources[1].id);
    expect(result.sources.map((s) => s.excerpt)).toEqual(["Revenue grew 8%.", "Margins improved."]);
    expect(resolveSource(result.sources[0])).toEqual({ kind: "document", documentId: meta.id });
  });
  it("cites indexed filing passages by document id with the Item and a sec.gov link", async () => {
    const filingUrl = "https://www.sec.gov/Archives/edgar/data/123/000012326000002/annual.htm";
    const filingMeta = { ...hitMeta, id: "6f2b7a1e-1111-4111-8111-222222222222", kind: "filing", title: "Example Company 10-K filed 2026-02-10", form: "10-K", url: filingUrl, publisher: "SEC EDGAR", publishedAt: new Date("2026-02-10T12:00:00Z"), docDate: "2025-12-31", name: "Example Company 10-K filed 2026-02-10", driveKind: null, path: null, mimeType: null, modifiedTime: null, webViewLink: null };
    vi.mocked(searchChunks).mockResolvedValue([{ documentId: filingMeta.id, seq: 3, section: "Item 1A", text: "Credit losses may rise.", score: 0.7, via: "vector", meta: filingMeta }] as never);
    const result = await run(makeTools({ teamId: "team", userId: "user" }), "search_documents", { query: "credit losses", kind: "filing", limit: 6 });
    expect(result.sources[0]).toMatchObject({ documentId: filingMeta.id, url: filingUrl, publisher: "SEC EDGAR", publishedAt: "2026-02-10", sourceType: "SEC filing", location: { section: "Item 1A", text: "Credit losses may rise." } });
    expect(resolveSource(result.sources[0])).toEqual({ kind: "document", documentId: filingMeta.id });
    expect(result.data).toMatchObject({ passages: [{ form: "10-K", section: "Item 1A", filedAt: "2026-02-10" }] });
  });
});

describe("remember and the price target sheet", () => {
  const sheetSource = { id: "ptsheet-abc", title: "PT sheet: Price Targets", url: "https://docs.google.com/spreadsheets/d/F/edit", publisher: "Owl Fund Price Targets (execs' sheet)", sourceType: "PT sheet", retrievedAt: "2026-09-27" };

  it("saves nothing once the conversation has used the sheet", async () => {
    const tools = makeTools({ teamId: "team", userId: "user", memoryBlocked: () => true });
    const r = await run(tools, "remember", { kind: "lesson", scope: "team", body: "Use find_documents before search_documents.", sourceIds: [] });
    expect(r.error).toMatch(/price target sheet/);
    expect(rememberMemory).not.toHaveBeenCalled();
  });

  it("refuses a fact that cites the sheet", async () => {
    const tools = makeTools({ teamId: "team", userId: "user", sources: [sheetSource] });
    const r = await run(tools, "remember", { kind: "fact", scope: "team", body: "AMZN's price target is $271 per the PT sheet.", sourceIds: ["ptsheet-abc"] });
    expect(r.error).toMatch(/never saved/);
    expect(rememberMemory).not.toHaveBeenCalled();
  });

  it("still saves ordinary lessons", async () => {
    const tools = makeTools({ teamId: "team", userId: "user", memoryBlocked: () => false });
    const r = await run(tools, "remember", { kind: "lesson", scope: "team", body: "Use find_documents before search_documents.", sourceIds: [] });
    expect(r.error).toBeUndefined();
    expect(rememberMemory).toHaveBeenCalledOnce();
  });
});
