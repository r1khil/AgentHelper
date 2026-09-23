import { tavily, type TavilyClient } from "@tavily/core";
import { cached } from "@/lib/providers/cache";
import { capText } from "@/lib/drive/text";
import { ESTABLISHED_DOMAINS, isQuotePage, LOW_QUALITY_DOMAINS, pageTier, PRIMARY_DOMAINS, rankByReliability, type SourceTier } from "@/lib/web/sources";

/**
 * Web search and page reading through Tavily (tavily.com). Tavily fetches the page, so the app never requests
 * arbitrary URLs itself and needs no SSRF guard or HTML parser. Free plan: 1,000 credits/month; a basic search
 * costs 1 credit, a basic extract 1 credit per 5 URLs, advanced extract 2 per 5.
 */
export const SEARCH_QUERY_CHARS = 400;
export const SEARCH_CACHE_SECONDS = 3600;
export const PAGE_CACHE_SECONDS = 86_400;
export const PAGE_MAX_CHARS = 200_000;

export type WebTopic = "general" | "news" | "finance";
export type WebTimeRange = "day" | "week" | "month" | "year";
export type WebSearchHit = { title: string; url: string; snippet: string; publishedAt?: string; score: number; tier: SourceTier };
/** Results fetched per search before re-ranking; a basic search costs one credit regardless of count. */
export const SEARCH_POOL = 15;
export type WebPageText = { url: string; title: string | null; text: string; fetchedAt: string };

export function tavilyConfigured() {
  return Boolean(process.env.TAVILY_API_KEY);
}

let client: TavilyClient | null = null;
function getClient(): TavilyClient {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("Web search is not configured (TAVILY_API_KEY)");
  return (client ??= tavily({ apiKey }));
}

/** For tests: forget the lazily built client. */
export function resetTavilyClient() {
  client = null;
}

/** Tavily's HTTP errors carry a status; 429 is the request rate cap and 432 the monthly credit cap. */
function explain(e: unknown): Error {
  const status = (e as { status?: number; response?: { status?: number } })?.status ?? (e as { response?: { status?: number } })?.response?.status;
  const text = e instanceof Error ? e.message : String(e);
  if (status === 429 || /\b429\b|rate limit/i.test(text)) return new Error("Web search provider rate limit reached (Tavily 429); try again in a minute");
  if (status === 432 || /\b432\b|usage limit|credit/i.test(text)) return new Error("Web search monthly credit limit reached (Tavily 432); web tools resume next month or after a plan upgrade");
  if (status === 401 || /\b401\b|unauthorized|invalid api key/i.test(text)) return new Error("Web search provider rejected the API key (Tavily 401)");
  return e instanceof Error ? e : new Error(text);
}

/** Only public http(s) pages; the rest is refused before any credit is spent. */
export function acceptWebUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs can be read");
  if (url.username || url.password) throw new Error("URLs with credentials are refused");
  if (url.hostname === "www.sec.gov" && url.pathname.startsWith("/Archives/")) throw new Error("SEC filings are read with read_filing, which keeps the item structure");
  url.hash = "";
  return url;
}

/**
 * Web search, one credit per call (searchDepth pinned to basic; advanced costs two). Cached for an hour.
 *
 * Without `domains`, Tavily is asked to prefer primary and established sources and to exclude low-quality ones;
 * a wider pool drops stock-quote pages and syndicated low-quality articles, is filtered for relevance (the preference pads results with off-topic pages from trusted sites),
 * ranked by relevance plus a reliability bonus, and trimmed to `limit`. When no primary or established result survives,
 * a second search restricted to those sites is merged in (one more credit). With `domains`, results are restricted to those sites.
 */
export async function searchWeb(p: { query: string; topic?: WebTopic; timeRange?: WebTimeRange; limit?: number; domains?: string[] }): Promise<WebSearchHit[]> {
  const query = p.query.trim().slice(0, SEARCH_QUERY_CHARS);
  if (!query) return [];
  const topic = effectiveTopic(p.topic, p.timeRange);
  const limit = Math.max(1, Math.min(p.limit ?? 5, 10));
  const domains = [...new Set((p.domains ?? []).map(normalizeDomain).filter(Boolean))].slice(0, 20).sort();
  const key = `web:search:v3:${topic}:${p.timeRange ?? "any"}:${limit}:${domains.join(",")}:${query.toLowerCase()}`;
  return cached(key, SEARCH_CACHE_SECONDS, async () => {
    const run = async (scope: Record<string, unknown>): Promise<WebSearchHit[]> => {
      try {
        const r = await getClient().search(query, { searchDepth: "basic", topic, timeRange: p.timeRange, maxResults: SEARCH_POOL, includeRawContent: false, includeAnswer: false, ...scope });
        // Quote pages go before the relevance floor is set: they score highest for "why did X move" and explain nothing.
        return (r.results ?? []).filter((x) => !isQuotePage(x.url)).map((x) => ({ title: x.title, url: x.url, snippet: x.content, publishedAt: x.publishedDate || undefined, score: x.score, tier: pageTier({ url: x.url, title: x.title, text: x.content }).tier }));
      } catch (e) {
        throw explain(e);
      }
    };
    if (domains.length) {
      // With an explicit site list the caller chose the sources; still drop off-topic padding.
      const hits = await run({ includeDomains: domains, includeDomainsMode: "restrict" });
      return rankByReliability(hits, (h) => (h.tier === "low" ? "other" : h.tier), (h) => h.score).slice(0, limit);
    }
    const trusted = [...PRIMARY_DOMAINS, ...ESTABLISHED_DOMAINS];
    let ranked = rankByReliability(await run({ includeDomains: trusted, includeDomainsMode: "prefer", excludeDomains: LOW_QUALITY_DOMAINS }), (h) => h.tier, (h) => h.score);
    if (!ranked.some(isTrusted)) {
      // Nothing trusted survived: one more credit for a search restricted to trusted sites, merged in. Hoot was told
      // to do this itself and did not, so the tool does it. A failure here keeps the first search's results.
      const extra = await run({ includeDomains: trusted, includeDomainsMode: "restrict" }).catch(() => []);
      const seen = new Set(ranked.map((h) => h.url));
      ranked = rankByReliability([...ranked, ...extra.filter((h) => !seen.has(h.url))], (h) => h.tier, (h) => h.score);
    }
    return ranked.slice(0, limit);
  });
}

/**
 * Tavily's "finance" topic returns company profile and quote pages. With a day or week window the question is about
 * recent events, which is "news"; Hoot kept choosing "finance" for "why did it move" despite its instructions.
 */
export function effectiveTopic(topic: WebTopic | undefined, timeRange: WebTimeRange | undefined): WebTopic {
  if (topic === "finance" && (timeRange === "day" || timeRange === "week")) return "news";
  return topic ?? "general";
}

const isTrusted = (h: WebSearchHit) => h.tier === "primary" || h.tier === "established";

/** "https://www.Example.com/path" → "example.com"; anything unparseable → "". */
function normalizeDomain(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  try {
    return new URL(s.includes("://") ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * A page as plain text. Basic extraction first; when Tavily reports the URL in failedResults (JS-heavy pages),
 * one retry with advanced extraction. Cached for a day.
 */
export async function extractPage(raw: string): Promise<WebPageText> {
  const url = acceptWebUrl(raw).href;
  return cached(`web:page:${url}`, PAGE_CACHE_SECONDS, async () => {
    const c = getClient();
    const attempt = async (extractDepth: "basic" | "advanced") => {
      try {
        return await c.extract([url], { extractDepth, format: "text" });
      } catch (e) {
        throw explain(e);
      }
    };
    let r = await attempt("basic");
    let hit = r.results?.find((x) => x.url === url) ?? r.results?.[0];
    if (!hit?.rawContent) {
      const failed = r.failedResults?.find((f) => f.url === url) ?? r.failedResults?.[0];
      r = await attempt("advanced");
      hit = r.results?.find((x) => x.url === url) ?? r.results?.[0];
      if (!hit?.rawContent) {
        const reason = r.failedResults?.[0]?.error ?? failed?.error ?? "no readable text";
        throw new Error(`The page could not be read: ${reason}`);
      }
    }
    return { url: hit.url || url, title: hit.title || null, text: capText(hit.rawContent, PAGE_MAX_CHARS), fetchedAt: new Date().toISOString() };
  });
}
