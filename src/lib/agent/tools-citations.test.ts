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
  getFileText: vi.fn(),
  listHoldingFiles: vi.fn(),
  searchIndex: vi.fn(),
}));
vi.mock("@/lib/drive/search", () => ({ searchChunks: vi.fn() }));
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
import { getFilingText, listFilings, listFilingDocuments } from "@/lib/providers/edgar";
import { getFileText } from "@/lib/drive/index";
import { searchChunks } from "@/lib/drive/search";
import { makeTools, type ToolResult } from "./tools";
import { collectSources } from "./citations";
import { resolveSource } from "./source-resolution";

const url = "https://www.sec.gov/Archives/edgar/data/123/000012326000001/quarter.htm";
const meta = {
  id: "file_123",
  name: "Internal transcript",
  docDate: "2026-09-10",
  modifiedTime: new Date("2026-09-19"),
  kind: "transcript",
  webViewLink: "https://drive.google.com/file/d/file_123/view",
};
const run = (tools: ReturnType<typeof makeTools>, name: keyof ReturnType<typeof makeTools>, args: unknown) =>
  (tools[name].execute as (args: unknown, options: unknown) => Promise<ToolResult<unknown>>)(args, { toolCallId: "test", messages: [] });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listFilings).mockResolvedValue([{ accession: "0000123-26-000001", form: "10-Q", filedAt: "2026-09-10", primaryDocument: "quarter.htm", url }] as never);
  vi.mocked(getFilingText).mockResolvedValue("Revenue grew 8%. Margins improved.");
  vi.mocked(getFileText).mockResolvedValue({ meta, text: "Opening remarks. Revenue grew 8%. Questions." } as never);
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
    const result = await run(tools, "read_drive_file", { fileId: meta.id, offset: 17, maxChars: 16 });
    expect(result.sources[0]).toMatchObject({ documentId: meta.id, publishedAt: "2026-09-10", excerpt: "Revenue grew 8%.", location: { offset: 17, text: "Revenue grew 8%." } });
    expect(resolveSource(result.sources[0])).toEqual({ kind: "document", documentId: meta.id });
  });
  it("assigns distinct sources to multiple retrieved passages in the same document", async () => {
    vi.mocked(searchChunks).mockResolvedValue([
      { fileId: meta.id, seq: 0, text: "Revenue grew 8%.", meta },
      { fileId: meta.id, seq: 1, text: "Margins improved.", meta },
    ] as never);
    const result = await run(makeTools({ teamId: "team", userId: "user" }), "search_drive_text", { query: "results", limit: 6 });
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].id).not.toBe(result.sources[1].id);
    expect(result.sources.map((s) => s.excerpt)).toEqual(["Revenue grew 8%.", "Margins improved."]);
  });
});
