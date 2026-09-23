import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ search: vi.fn(), extract: vi.fn() }));
vi.mock("@tavily/core", () => ({ tavily: () => ({ search: sdk.search, extract: sdk.extract }) }));
vi.mock("@/lib/providers/cache", () => ({ cached: (_k: string, _ttl: number, fn: () => unknown) => fn() }));

import { acceptWebUrl, extractPage, resetTavilyClient, searchWeb } from "./tavily";

beforeEach(() => {
  vi.clearAllMocks();
  resetTavilyClient();
  process.env.TAVILY_API_KEY = "tvly-test";
});
afterEach(() => {
  delete process.env.TAVILY_API_KEY;
});

describe("searchWeb", () => {
  it("maps results, pins basic depth, and caps the result count", async () => {
    sdk.search.mockResolvedValue({ results: [{ title: "T", url: "https://x.example/a", content: "snippet", score: 0.9, publishedDate: "2026-09-20" }] });
    const hits = await searchWeb({ query: "  american express q2 results ", topic: "finance", timeRange: "week", limit: 25 });
    expect(hits).toEqual([{ title: "T", url: "https://x.example/a", snippet: "snippet", publishedAt: "2026-09-20", score: 0.9, tier: "other" }]);
    expect(sdk.search).toHaveBeenCalledWith("american express q2 results", expect.objectContaining({ searchDepth: "basic", topic: "finance", timeRange: "week", maxResults: 15, includeRawContent: false }));
  });
  it("prefers reliable domains, drops low-quality ones, and ranks primary then established first", async () => {
    const hit = (url: string, score: number) => ({ title: url, url, content: "s", score });
    sdk.search.mockResolvedValue({
      results: [hit("https://blog.example/a", 0.99), hit("https://www.reddit.com/r/stocks/x", 0.98), hit("https://www.reuters.com/markets/a", 0.7), hit("https://investor.apple.com/news/a", 0.5), hit("https://www.sec.gov/news/press", 0.4), hit("https://other.example/b", 0.9)],
    });
    const hits = await searchWeb({ query: "apple buyback", limit: 4 });
    expect(hits.map((h) => [h.url, h.tier])).toEqual([
      ["https://investor.apple.com/news/a", "primary"],
      ["https://www.sec.gov/news/press", "primary"],
      ["https://www.reuters.com/markets/a", "established"],
      ["https://blog.example/a", "other"],
    ]);
    const opts = sdk.search.mock.calls[0][1];
    expect(opts.includeDomainsMode).toBe("prefer");
    expect(opts.includeDomains).toEqual(expect.arrayContaining(["sec.gov", "reuters.com"]));
    expect(opts.excludeDomains).toEqual(expect.arrayContaining(["reddit.com", "seekingalpha.com"]));
  });
  it("restricts to the given domains, normalized", async () => {
    sdk.search.mockResolvedValue({ results: [] });
    await searchWeb({ query: "q3 release", domains: ["https://www.Investor.Apple.com/news", "reuters.com", "  "] });
    const opts = sdk.search.mock.calls[0][1];
    expect(opts).toMatchObject({ includeDomains: ["investor.apple.com", "reuters.com"], includeDomainsMode: "restrict" });
    expect(opts.excludeDomains).toBeUndefined();
  });
  it("turns Tavily limits into readable errors", async () => {
    sdk.search.mockRejectedValue(Object.assign(new Error("Request failed with status code 432"), { status: 432 }));
    await expect(searchWeb({ query: "x" })).rejects.toThrow(/credit limit/);
    sdk.search.mockRejectedValue(new Error("429 Too Many Requests"));
    await expect(searchWeb({ query: "x" })).rejects.toThrow(/rate limit/);
  });
  it("fails clearly without a key", async () => {
    delete process.env.TAVILY_API_KEY;
    await expect(searchWeb({ query: "x" })).rejects.toThrow(/TAVILY_API_KEY/);
  });
});

describe("extractPage", () => {
  it("returns basic extraction when it works", async () => {
    sdk.extract.mockResolvedValue({ results: [{ url: "https://x.example/a", title: "Page", rawContent: "Body text" }], failedResults: [] });
    const p = await extractPage("https://x.example/a#frag");
    expect(p).toMatchObject({ url: "https://x.example/a", title: "Page", text: "Body text" });
    expect(sdk.extract).toHaveBeenCalledTimes(1);
    expect(sdk.extract).toHaveBeenCalledWith(["https://x.example/a"], { extractDepth: "basic", format: "text" });
  });
  it("retries once with advanced extraction when the URL is in failedResults", async () => {
    sdk.extract
      .mockResolvedValueOnce({ results: [], failedResults: [{ url: "https://x.example/a", error: "js required" }] })
      .mockResolvedValueOnce({ results: [{ url: "https://x.example/a", title: null, rawContent: "Rendered" }], failedResults: [] });
    const p = await extractPage("https://x.example/a");
    expect(p.text).toBe("Rendered");
    expect(sdk.extract).toHaveBeenNthCalledWith(2, ["https://x.example/a"], { extractDepth: "advanced", format: "text" });
  });
  it("throws with the failure reason when both attempts fail", async () => {
    sdk.extract.mockResolvedValue({ results: [], failedResults: [{ url: "https://x.example/a", error: "403 Forbidden" }] });
    await expect(extractPage("https://x.example/a")).rejects.toThrow(/403 Forbidden/);
    expect(sdk.extract).toHaveBeenCalledTimes(2);
  });
  it("rejects non-http URLs and EDGAR archives before spending a credit", async () => {
    await expect(extractPage("ftp://x.example/a")).rejects.toThrow(/http/);
    await expect(extractPage("not a url")).rejects.toThrow(/valid URL/);
    await expect(extractPage("https://www.sec.gov/Archives/edgar/data/1/x.htm")).rejects.toThrow(/read_filing/);
    expect(sdk.extract).not.toHaveBeenCalled();
    expect(() => acceptWebUrl("https://user:pw@x.example/")).toThrow(/credentials/);
    expect(acceptWebUrl("https://x.example/a#top").href).toBe("https://x.example/a");
  });
});
