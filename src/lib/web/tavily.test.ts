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
      results: [hit("https://blog.example/a", 0.8), hit("https://www.reddit.com/r/stocks/x", 0.98), hit("https://www.reuters.com/markets/a", 0.75), hit("https://investor.apple.com/news/a", 0.7), hit("https://home.treasury.gov/payments", 0.03), hit("https://other.example/b", 0.4)],
    });
    const hits = await searchWeb({ query: "apple buyback", limit: 3 });
    expect(hits.map((h) => [h.url, h.tier])).toEqual([
      ["https://www.reuters.com/markets/a", "established"],
      ["https://investor.apple.com/news/a", "primary"],
      ["https://blog.example/a", "other"],
    ]);
    const opts = sdk.search.mock.calls[0][1];
    expect(opts.includeDomainsMode).toBe("prefer");
    expect(opts.includeDomains).toEqual(expect.arrayContaining(["sec.gov", "reuters.com"]));
    expect(opts.excludeDomains).toEqual(expect.arrayContaining(["reddit.com", "seekingalpha.com"]));
  });
  it("drops quote pages before setting the relevance floor, and syndicated low-quality reposts", async () => {
    // The AMZN search from production on 2026-09-23: the WSJ quote page scored 0.93 and raised the floor.
    const hit = (url: string, score: number, title = url) => ({ title, url, content: "s", score });
    sdk.search.mockResolvedValue({
      results: [
        hit("https://www.wsj.com/market-data/quotes/AMZN", 0.93),
        hit("https://www.marketwatch.com/investing/stock/amzn?countrycode=ch", 0.49),
        hit("https://www.cnbc.com/2026/09/23/cctv-script-23/09/26.html", 0.42, "CCTV Script 23/09/26 - CNBC"),
        hit("https://www.tradingview.com/news/benzinga:d85307743094b:0-what-s-going-on-with-amazon-stock-wednesday", 0.4),
        hit("https://www.marketwatch.com/livecoverage/stock-market-today", 0.31),
        hit("https://blog.example/amzn", 0.12),
      ],
    });
    const hits = await searchWeb({ query: "why is amazon down today", limit: 5 });
    expect(hits.map((h) => h.url)).toEqual(["https://www.cnbc.com/2026/09/23/cctv-script-23/09/26.html", "https://www.marketwatch.com/livecoverage/stock-market-today"]);
  });
  it("returns nothing when the whole pool is filler", async () => {
    // The AVGO search from production on 2026-09-23: every result was preferred-domain padding.
    const hit = (url: string, score: number) => ({ title: url, url, content: "s", score });
    sdk.search.mockResolvedValue({
      results: [hit("https://www.bloomberg.com/news/videos/2026-09-23/japan-pm-takaichi", 0.254), hit("https://www.bloomberg.com/news/videos/2026-09-23/xi-unlikely", 0.191), hit("https://www.bbc.com/southtoday", 0.139), hit("https://www.barrons.com/articles/anthropic-ipo-etf", 0.104)],
    });
    expect(await searchWeb({ query: "Broadcom AVGO stock decline today", limit: 10 })).toEqual([]);
  });
  it("runs one search restricted to trusted sites when none survive, and merges it in", async () => {
    // The GOOG search from production on 2026-09-23 kept only unrated sites.
    const hit = (url: string, score: number) => ({ title: url, url, content: "s", score });
    sdk.search
      .mockResolvedValueOnce({ results: [hit("https://www.tradingkey.com/news/goog", 0.91), hit("https://pluang.com/goog", 0.87), hit("https://www.fxleaders.com/goog", 0.64)] })
      .mockResolvedValueOnce({ results: [hit("https://www.cnbc.com/2026/09/23/alphabet.html", 0.7), hit("https://www.reuters.com/tech/alphabet", 0.5), hit("https://www.wsj.com/unrelated", 0.1), hit("https://www.tradingkey.com/news/goog", 0.91)] });
    const hits = await searchWeb({ query: "Alphabet stock drop", topic: "news", timeRange: "day", limit: 4 });
    expect(hits.map((h) => h.url)).toEqual(["https://www.tradingkey.com/news/goog", "https://pluang.com/goog", "https://www.cnbc.com/2026/09/23/alphabet.html", "https://www.fxleaders.com/goog"]);
    expect(sdk.search).toHaveBeenCalledTimes(2);
    expect(sdk.search.mock.calls[1][1]).toMatchObject({ includeDomainsMode: "restrict", topic: "news", timeRange: "day" });
    expect(sdk.search.mock.calls[1][1].includeDomains).toEqual(expect.arrayContaining(["reuters.com", "sec.gov"]));
  });
  it("skips the trusted-only search when a trusted result is already there, and survives its failure", async () => {
    const hit = (url: string, score: number) => ({ title: url, url, content: "s", score });
    sdk.search.mockResolvedValueOnce({ results: [hit("https://www.reuters.com/a", 0.6), hit("https://blog.example/a", 0.9)] });
    await searchWeb({ query: "one" });
    expect(sdk.search).toHaveBeenCalledTimes(1);
    sdk.search.mockReset();
    sdk.search.mockResolvedValueOnce({ results: [hit("https://blog.example/a", 0.9)] }).mockRejectedValueOnce(new Error("boom"));
    expect((await searchWeb({ query: "two" })).map((h) => h.url)).toEqual(["https://blog.example/a"]);
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
