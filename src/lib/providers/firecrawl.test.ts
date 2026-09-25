import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ returning: vi.fn(), insert: vi.fn() }));
vi.mock("@/db/client", () => {
  const chain = { values: () => chain, onConflictDoUpdate: () => chain, returning: () => store.returning() };
  return { db: { insert: (t: unknown) => (store.insert(t), chain) } };
});
vi.mock("./cache", () => ({ cached: async (_k: string, _t: number, fn: () => unknown) => fn() }));
const limiter = vi.hoisted(() => ({
  spaced: vi.fn((_h: string, _ms: number, fn: () => Promise<unknown>) => fn()),
  retry: vi.fn(async (fn: () => Promise<unknown>, attempts = 3) => {
    let err: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        err = e;
      }
    }
    throw err;
  }),
}));
vi.mock("./limiter", () => limiter);

import { WebFetchError } from "@/lib/agent/web";
import { creditKey, FIRECRAWL_MONTHLY_CAP, FirecrawlBudgetError, firecrawlCanHelp, looksUnrendered, markdownToText, readWithFirecrawlFallback, reserveCredit, scrapeFirecrawl } from "./firecrawl";

/** A one-page PDF whose only text is `text`, with a correct xref table. */
function minimalPdf(text: string): string {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1").toString("base64");
}

const ARTICLE = `# Acme raises guidance\n\n![logo](https://cdn.example/logo.png)\n\nAcme Corp raised its full-year revenue outlook on Tuesday, citing [strong demand](https://example.com/demand_(2026)) in its industrial segment. ${"The company said margins expanded as input costs eased. ".repeat(12)}`;
const ok = (markdown: string, metadata: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: true, data: { markdown, metadata: { title: "Acme raises guidance", url: "https://news.example.com/acme", statusCode: 200, ...metadata } } }), { status: 200 });
const err = (status: number, error = "nope") => new Response(JSON.stringify({ success: false, error }), { status });

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.FIRECRAWL_API_KEY = "fc-test";
  store.returning.mockResolvedValue([{ value: "12" }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FIRECRAWL_API_KEY;
});

describe("scrapeFirecrawl", () => {
  it("pins every request to one credit and maps the page", async () => {
    fetchMock.mockResolvedValue(ok(ARTICLE));
    const page = await scrapeFirecrawl(new URL("https://news.example.com/acme"));
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(init.headers.Authorization).toBe("Bearer fc-test");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ url: "https://news.example.com/acme", formats: ["markdown"], onlyMainContent: true, proxy: "basic", parsers: [], blockAds: true, timeout: 20000 });
    expect(limiter.spaced.mock.calls[0][1]).toBeGreaterThanOrEqual(6000);
    expect(page.title).toBe("Acme raises guidance");
    expect(page.url).toBe("https://news.example.com/acme");
    expect(page.text).toContain("citing strong demand in its industrial segment");
    expect(page.text).not.toContain("logo.png");
  });
  it("fails when the page itself answered with an error status", async () => {
    fetchMock.mockResolvedValue(ok("Forbidden", { statusCode: 403 }));
    await expect(scrapeFirecrawl(new URL("https://news.example.com/acme"))).rejects.toThrow("HTTP 403 to Firecrawl");
  });
  it("retries once on 429 and treats 402 as a spent budget", async () => {
    fetchMock.mockResolvedValueOnce(err(429)).mockResolvedValueOnce(ok(ARTICLE));
    expect((await scrapeFirecrawl(new URL("https://news.example.com/acme"))).title).toBe("Acme raises guidance");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset().mockResolvedValue(err(402, "Insufficient credits"));
    await expect(scrapeFirecrawl(new URL("https://news.example.com/acme"))).rejects.toBeInstanceOf(FirecrawlBudgetError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reads a PDF returned as base64 (parsing off) with unpdf", async () => {
    fetchMock.mockResolvedValue(ok(minimalPdf("Net revenue rose 12 percent"), { contentType: "application/pdf", title: undefined }));
    const page = await scrapeFirecrawl(new URL("https://ir.example.com/q3.pdf"));
    expect(page.text).toContain("Net revenue rose 12 percent");
  });
  it("refuses a final URL the guard would refuse", async () => {
    fetchMock.mockResolvedValue(ok(ARTICLE, { url: "https://www.sec.gov/Archives/edgar/data/1/x.htm" }));
    await expect(scrapeFirecrawl(new URL("https://news.example.com/acme"))).rejects.toThrow("read_filing");
  });
});

describe("reserveCredit", () => {
  it("counts per UTC month in app_settings", async () => {
    expect(creditKey(new Date("2026-09-30T23:59:00Z"))).toBe("firecrawl_credits:2026-09");
    expect(await reserveCredit()).toBe(12);
  });
  it("stops at the cap and fails closed when the counter is unreachable", async () => {
    store.returning.mockResolvedValue([]);
    await expect(reserveCredit()).rejects.toThrow(`${FIRECRAWL_MONTHLY_CAP} pages is used up`);
    store.returning.mockRejectedValue(new Error("connection refused"));
    await expect(reserveCredit()).rejects.toBeInstanceOf(FirecrawlBudgetError);
  });
});

describe("firecrawlCanHelp / looksUnrendered", () => {
  it("fires only on failures a rendering reader can fix", () => {
    expect(firecrawlCanHelp(new WebFetchError("The page returned HTTP 403", 403))).toBe(true);
    expect(firecrawlCanHelp(new WebFetchError("The page returned HTTP 429", 429))).toBe(true);
    expect(firecrawlCanHelp(new WebFetchError("Not a readable page (content type application/pdf)", 200, "application/pdf"))).toBe(true);
    expect(firecrawlCanHelp(new Error("The page could not be read: failed to fetch"))).toBe(true);
    expect(firecrawlCanHelp(new WebFetchError("The page returned HTTP 404", 404))).toBe(false);
    expect(firecrawlCanHelp(new WebFetchError("The page returned HTTP 401", 401))).toBe(false);
    expect(firecrawlCanHelp(new WebFetchError("Not a readable page (content type image/png)", 200, "image/png"))).toBe(false);
    expect(firecrawlCanHelp(new Error("The page did not respond within 8s"))).toBe(false);
    expect(firecrawlCanHelp(new Error("Web search provider rate limit reached (Tavily 429); try again in a minute"))).toBe(false);
  });
  it("spots empty shells and challenge pages", () => {
    expect(looksUnrendered("Loading...")).toBe(true);
    expect(looksUnrendered(`Just a moment... Checking your browser before accessing the site. ${"x".repeat(400)}`)).toBe(true);
    expect(looksUnrendered(markdownToText(ARTICLE))).toBe(false);
  });
});

describe("readWithFirecrawlFallback", () => {
  const url = new URL("https://news.example.com/acme");
  const good = { url: url.href, title: "Direct", text: markdownToText(ARTICLE), fetchedAt: "2026-09-25T00:00:00Z" };

  it("is exactly the primary read without a key", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    await expect(readWithFirecrawlFallback(url, async () => Promise.reject(new WebFetchError("The page returned HTTP 403", 403)), "direct")).rejects.toThrow(/^The page returned HTTP 403$/);
    expect(await readWithFirecrawlFallback(url, async () => ({ ...good, text: "Loading..." }), "direct")).toMatchObject({ text: "Loading...", fetchedVia: "direct" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.insert).not.toHaveBeenCalled();
  });
  it("leaves successful pages and unfixable errors alone", async () => {
    expect(await readWithFirecrawlFallback(url, async () => good, "tavily")).toMatchObject({ title: "Direct", fetchedVia: "tavily" });
    await expect(readWithFirecrawlFallback(url, async () => Promise.reject(new WebFetchError("The page returned HTTP 404", 404)), "direct")).rejects.toThrow(/^The page returned HTTP 404$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reads a bot-blocked page through Firecrawl", async () => {
    fetchMock.mockResolvedValue(ok(ARTICLE));
    const page = await readWithFirecrawlFallback(url, async () => Promise.reject(new WebFetchError("The page returned HTTP 403", 403)), "direct");
    expect(page).toMatchObject({ title: "Acme raises guidance", fetchedVia: "firecrawl" });
    expect(store.insert).toHaveBeenCalledTimes(1);
  });
  it("keeps the original error, with a note, once the month's budget is spent", async () => {
    store.returning.mockResolvedValue([]);
    await expect(readWithFirecrawlFallback(url, async () => Promise.reject(new WebFetchError("The page returned HTTP 403", 403)), "direct")).rejects.toThrow(/^The page returned HTTP 403\. The backup reader \(Firecrawl\) was not tried: .*used up/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reports both failures when Firecrawl cannot read it either", async () => {
    fetchMock.mockResolvedValue(err(400, "Unsupported URL"));
    await expect(readWithFirecrawlFallback(url, async () => Promise.reject(new WebFetchError("The page returned HTTP 403", 403)), "direct")).rejects.toThrow("also failed: Firecrawl could not read the page (HTTP 400): Unsupported URL");
  });
  it("renders a JavaScript shell, but not a paywalled teaser", async () => {
    fetchMock.mockResolvedValue(ok(ARTICLE));
    expect(await readWithFirecrawlFallback(url, async () => ({ ...good, text: "You need to enable JavaScript to run this app." }), "direct")).toMatchObject({ fetchedVia: "firecrawl" });
    fetchMock.mockClear();
    const teaser = { ...good, url: "https://www.wsj.com/business/acme", text: "Acme raised guidance." };
    expect(await readWithFirecrawlFallback(new URL(teaser.url), async () => teaser, "tavily")).toMatchObject({ fetchedVia: "tavily" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps a thin page when Firecrawl fails, noting a spent budget", async () => {
    fetchMock.mockResolvedValue(err(500));
    expect(await readWithFirecrawlFallback(url, async () => ({ ...good, text: "Loading..." }), "direct")).toMatchObject({ text: "Loading...", fetchedVia: "direct" });
    store.returning.mockResolvedValue([]);
    const kept = await readWithFirecrawlFallback(url, async () => ({ ...good, text: "Loading..." }), "direct");
    expect(kept.fallbackNote).toMatch(/not tried/);
  });
});
