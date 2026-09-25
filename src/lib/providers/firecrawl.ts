import { sql } from "drizzle-orm";
import { safeWebUrl, WebFetchError } from "@/lib/agent/web";
import { capText } from "@/lib/drive/text";
import { looksPaywalled } from "@/lib/web/sources";
import { cached } from "./cache";
import { retry, spaced } from "./limiter";

/**
 * Firecrawl (firecrawl.dev) as a backup page reader for read_url: it renders JavaScript and gets past most bot
 * walls. Free plan only: 1,000 credits a month, no card, 10 scrapes a minute. Every request is pinned to one
 * credit: markdown only, basic proxy (never enhanced), and PDF parsing off (parsing bills a credit per page; with
 * `parsers: []` a PDF comes back as base64 for a flat credit and is read here with unpdf).
 */
export const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
/** Stop short of the free plan's 1,000 so a counting slip never reaches the provider's hard cap. */
export const FIRECRAWL_MONTHLY_CAP = 900;
/** 10 scrapes a minute on the free plan; 6.5s apart leaves headroom. */
export const FIRECRAWL_MIN_INTERVAL_MS = 6500;
export const FIRECRAWL_TIMEOUT_MS = 20_000;
export const FIRECRAWL_PAGE_CACHE_SECONDS = 86_400;
export const FIRECRAWL_MAX_CHARS = 200_000;
/** Below this much text a page most likely needed JavaScript or showed a challenge. */
export const THIN_PAGE_CHARS = 300;

const HOST = "api.firecrawl.dev";

export function firecrawlConfigured() {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

export type ReadPage = { url: string; title: string | null; text: string; fetchedAt: string; truncated?: boolean };
export type FetchedVia = "tavily" | "direct" | "firecrawl";

/** The month's credits are spent (or the counter could not be reached, which is treated the same way). */
export class FirecrawlBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirecrawlBudgetError";
  }
}

/** 429 and 5xx are worth one more try; anything else is final. */
class TransientError extends Error {}

/** app_settings key holding this month's count, e.g. firecrawl_credits:2026-09 (UTC months). */
export function creditKey(at = new Date()) {
  return `firecrawl_credits:${at.toISOString().slice(0, 7)}`;
}

/**
 * Take one credit from this month's budget: a single upsert that adds one only while the count is under the cap,
 * so concurrent requests cannot overshoot it. No row back means the cap was reached. Fails closed.
 */
export async function reserveCredit(at = new Date()): Promise<number> {
  let row: { value: string } | undefined;
  try {
    const { db } = await import("@/db/client");
    const { appSettings } = await import("@/db/schema");
    [row] = await db
      .insert(appSettings)
      .values({ key: creditKey(at), value: "1" })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: sql`(${appSettings.value}::int + 1)::text`, updatedAt: new Date() }, setWhere: sql`${appSettings.value}::int < ${FIRECRAWL_MONTHLY_CAP}` })
      .returning({ value: appSettings.value });
  } catch (e) {
    throw new FirecrawlBudgetError(`the credit counter could not be updated (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!row) throw new FirecrawlBudgetError(`this month's free-plan budget of ${FIRECRAWL_MONTHLY_CAP} pages is used up`);
  return Number(row.value);
}

/** This month's count, read only (for the smoke script and diagnostics). */
export async function creditsUsed(at = new Date()): Promise<number> {
  const { db } = await import("@/db/client");
  const { appSettings } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, creditKey(at))).limit(1);
  return row ? Number(row.value) : 0;
}

/** Markdown to the plain-ish text the rest of read_url expects: images dropped, links reduced to their text. */
export function markdownToText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\((?:[^()]|\([^)]*\))*\)/g, "")
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type ScrapeResponse = {
  success?: boolean;
  error?: string;
  data?: { markdown?: string; metadata?: { title?: string | string[]; url?: string; sourceURL?: string; statusCode?: number; contentType?: string; error?: string } };
};

const PDF_BASE64 = /^(?:data:application\/pdf;base64,)?(JVBERi0[A-Za-z0-9+/=\s]*)$/;

async function pdfText(base64: string): Promise<string> {
  const { extractText } = await import("unpdf");
  const r = await extractText(new Uint8Array(Buffer.from(base64.replace(/\s+/g, ""), "base64")), { mergePages: true });
  return r.text;
}

/** One scrape request. No budget or cache here: callers other than read_url (the smoke script) use it directly. */
async function scrapeOnce(url: URL, apiKey: string): Promise<ReadPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIRECRAWL_TIMEOUT_MS + 5000);
  let res: Response;
  try {
    res = await fetch(FIRECRAWL_SCRAPE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.href, formats: ["markdown"], onlyMainContent: true, proxy: "basic", parsers: [], blockAds: true, timeout: FIRECRAWL_TIMEOUT_MS }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`Firecrawl did not answer within ${(FIRECRAWL_TIMEOUT_MS + 5000) / 1000}s`);
    throw new TransientError(`Firecrawl could not be reached: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => ({}))) as ScrapeResponse;
  if (!res.ok || body.success === false) {
    const detail = body.error ? `: ${body.error.slice(0, 200)}` : "";
    if (res.status === 401) throw new Error("Firecrawl rejected the API key (401)");
    if (res.status === 402) throw new FirecrawlBudgetError("Firecrawl reports the free-plan credits are used up (402)");
    if (res.status === 408) throw new Error(`Firecrawl timed out loading the page (408)${detail}`);
    if (res.status === 429 || res.status >= 500) throw new TransientError(`Firecrawl error (HTTP ${res.status})${detail}`);
    throw new Error(`Firecrawl could not read the page (HTTP ${res.status})${detail}`);
  }
  const meta = body.data?.metadata ?? {};
  if (meta.statusCode && meta.statusCode >= 400) throw new Error(`The page returned HTTP ${meta.statusCode} to Firecrawl as well`);
  const final = meta.url || meta.sourceURL || url.href;
  const check = safeWebUrl(final);
  if (!check.ok) throw new Error(`Redirected to a refused address: ${check.reason}`);
  const markdown = body.data?.markdown ?? "";
  const pdf = markdown.trim().match(PDF_BASE64);
  let text: string;
  if (pdf) text = await pdfText(pdf[1]);
  else if (markdown.startsWith("%PDF")) throw new Error("Firecrawl returned the PDF in a form that could not be decoded");
  else text = markdownToText(markdown);
  if (!text.trim()) throw new Error("Firecrawl found no readable text on the page");
  const title = (Array.isArray(meta.title) ? meta.title[0] : meta.title)?.replace(/\s+/g, " ").trim() || null;
  return { url: check.url.href, title, text: capText(text, FIRECRAWL_MAX_CHARS), fetchedAt: new Date().toISOString(), truncated: text.length > FIRECRAWL_MAX_CHARS };
}

/** Scrape a page through Firecrawl, spaced for the free plan's rate limit, with one retry on 429/5xx. */
export async function scrapeFirecrawl(url: URL): Promise<ReadPage> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("Firecrawl is not configured (FIRECRAWL_API_KEY)");
  const r = await retry(async () => {
    try {
      return { page: await spaced(HOST, FIRECRAWL_MIN_INTERVAL_MS, () => scrapeOnce(url, apiKey)) };
    } catch (e) {
      if (e instanceof TransientError) throw e;
      return { fatal: e };
    }
  }, 2, 1500);
  if ("fatal" in r) throw r.fatal;
  return r.page;
}

/** read_url's backup: cached for a day like a Tavily read; a credit is taken only on a cache miss. */
export function readViaFirecrawl(url: URL): Promise<ReadPage> {
  return cached(`firecrawl:page:${url.href}`, FIRECRAWL_PAGE_CACHE_SECONDS, async () => {
    await reserveCredit();
    return scrapeFirecrawl(url);
  });
}

/**
 * Failures a rendering, bot-wall-aware reader can fix: a bot block (403, 429, 503 challenge, 999), a PDF the direct
 * fetch will not parse, or Tavily giving up on the page. Not 404s, logins, timeouts or refused redirects.
 */
export function firecrawlCanHelp(e: unknown): boolean {
  if (e instanceof WebFetchError) {
    if (e.contentType && /application\/pdf/i.test(e.contentType)) return true;
    return e.status === 403 || e.status === 429 || e.status === 503 || e.status === 999;
  }
  return e instanceof Error && /^The page could not be read:/.test(e.message);
}

const CHALLENGE = /enable javascript|javascript is (?:required|disabled)|checking your browser|just a moment\.\.\.|verify you are (?:a )?human|are you a robot|access denied/i;

/** Text that is near-empty, or short and reads like a JavaScript or bot challenge. */
export function looksUnrendered(text: string): boolean {
  const t = text.trim();
  return t.length < THIN_PAGE_CHARS || (t.length < 3000 && CHALLENGE.test(t));
}

/**
 * Read a page with `primary` (Tavily or the app's own fetch), falling back to Firecrawl when the primary read fails
 * in a way Firecrawl can fix or comes back near-empty. The URL must already have passed safeWebUrl. Without
 * FIRECRAWL_API_KEY this is exactly `primary`. When the month's budget is spent the original error stands, with a note.
 */
export async function readWithFirecrawlFallback(url: URL, primary: () => Promise<ReadPage>, primaryVia: Exclude<FetchedVia, "firecrawl">): Promise<ReadPage & { fetchedVia: FetchedVia; fallbackNote?: string }> {
  if (!firecrawlConfigured()) return { ...(await primary()), fetchedVia: primaryVia };
  let page: ReadPage;
  try {
    page = await primary();
  } catch (e) {
    if (!firecrawlCanHelp(e)) throw e;
    const original = e instanceof Error ? e.message : String(e);
    try {
      return { ...(await readViaFirecrawl(url)), fetchedVia: "firecrawl" };
    } catch (f) {
      const why = f instanceof Error ? f.message : String(f);
      throw new Error(f instanceof FirecrawlBudgetError ? `${original}. The backup reader (Firecrawl) was not tried: ${why}.` : `${original}. The backup reader (Firecrawl) also failed: ${why}`);
    }
  }
  if (!looksUnrendered(page.text) || looksPaywalled(page.url, page.text)) return { ...page, fetchedVia: primaryVia };
  try {
    const rendered = await readViaFirecrawl(url);
    if (rendered.text.trim().length > page.text.trim().length) return { ...rendered, fetchedVia: "firecrawl" };
  } catch (f) {
    if (f instanceof FirecrawlBudgetError) return { ...page, fetchedVia: primaryVia, fallbackNote: `This page looked like it needed JavaScript, but the backup reader (Firecrawl) was not tried: ${f.message}.` };
  }
  return { ...page, fetchedVia: primaryVia };
}
