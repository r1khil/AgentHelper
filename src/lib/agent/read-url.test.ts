import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({ returning: vi.fn() }));
vi.mock("@/db/client", () => {
  const chain = { values: () => chain, onConflictDoUpdate: () => chain, returning: () => store.returning() };
  return { db: { insert: () => chain } };
});
vi.mock("@/lib/providers/cache", () => ({ cached: async (_k: string, _t: number, fn: () => unknown) => fn() }));
vi.mock("@/lib/providers/limiter", () => ({ spaced: (_h: string, _ms: number, fn: () => unknown) => fn(), retry: (fn: () => unknown) => fn() }));
vi.mock("@/lib/holdings", () => ({ listPendingProposals: vi.fn() }));
vi.mock("@/lib/providers/yahoo", () => ({}));
vi.mock("@/lib/providers/finnhub", () => ({}));
vi.mock("@/lib/drive/auth", () => ({ DriveNotConnected: Error, driveConfigured: () => true }));
vi.mock("@/lib/drive/read", () => ({ searchFullText: vi.fn() }));
vi.mock("@/lib/drive/index", () => ({ driveStatus: vi.fn(), listHoldingFiles: vi.fn(), searchIndex: vi.fn() }));
vi.mock("@/lib/documents/search", () => ({ searchChunks: vi.fn() }));
vi.mock("@/lib/documents/index", () => ({ getDocument: vi.fn(), listHoldingFilings: vi.fn(async () => []) }));
vi.mock("@/lib/documents/adapters", () => ({ getDocumentText: vi.fn() }));
vi.mock("@/lib/documents/find", () => ({ searchFilings: vi.fn(async () => []) }));
vi.mock("@/lib/web/tavily", () => ({ tavilyConfigured: () => false, searchWeb: vi.fn(), extractPage: vi.fn() }));
vi.mock("@/lib/agent/embeddings", () => ({ embeddingConfigured: () => true }));
import { makeTools, type ToolResult } from "./tools";

const readUrl = (args: unknown) => (makeTools({ teamId: "team", userId: "user" }).read_url.execute as (a: unknown, o: unknown) => Promise<ToolResult<Record<string, unknown> | null>>)(args, { toolCallId: "t", messages: [] });
const ARTICLE = `Acme Corp raised its full-year revenue outlook on Tuesday. ${"Margins expanded as input costs eased. ".repeat(20)}`;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.FIRECRAWL_API_KEY = "fc-test";
  store.returning.mockResolvedValue([{ value: "1" }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FIRECRAWL_API_KEY;
});

describe("read_url with the Firecrawl fallback", () => {
  it("runs the SSRF guard before anything is fetched or counted", async () => {
    for (const url of ["http://169.254.169.254/latest/meta-data", "https://www.sec.gov/Archives/edgar/data/1/x.htm"]) {
      const r = await readUrl({ url, offset: 0, maxChars: 8000 });
      expect(r.error).toBeTruthy();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.returning).not.toHaveBeenCalled();
  });
  it("falls back on a bot block and keeps the usual result shape", async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      if (String(input).startsWith("https://api.firecrawl.dev/")) return new Response(JSON.stringify({ success: true, data: { markdown: ARTICLE, metadata: { title: "Acme raises guidance", url: "https://www.reuters.com/business/acme", statusCode: 200 } } }));
      return new Response("blocked", { status: 403, headers: { "content-type": "text/html" } });
    });
    const r = await readUrl({ url: "https://www.reuters.com/business/acme", offset: 0, maxChars: 8000 });
    expect(r.error).toBeUndefined();
    expect(r.data).toMatchObject({ url: "https://www.reuters.com/business/acme", title: "Acme raises guidance", reliability: "established", fetchedVia: "firecrawl", offset: 0, hasMore: false });
    expect(r.sources[0]).toMatchObject({ sourceType: "Web page", publisher: "reuters.com" });
  });
  it("leaves a direct read untouched", async () => {
    fetchMock.mockResolvedValue(new Response(`<html><title>Acme</title><body><p>${ARTICLE}</p></body></html>`, { headers: { "content-type": "text/html" } }));
    const r = await readUrl({ url: "https://www.reuters.com/business/acme", offset: 0, maxChars: 8000 });
    expect(r.data).not.toHaveProperty("fetchedVia");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
