import { htmlToText } from "@/lib/providers/edgar";

export const WEB_TIMEOUT_MS = 8000;
export const WEB_MAX_BYTES = 200_000;

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;
const PRIVATE_IP = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** Only public http(s) pages may be fetched; the app itself, private networks and EDGAR archives (use read_filing) are refused. */
export function safeWebUrl(raw: string, appHost?: string | null): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "Only http(s) URLs can be read" };
  if (url.username || url.password) return { ok: false, reason: "URLs with credentials are refused" };
  const host = url.hostname.toLowerCase();
  const bare = host.replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST.test(host) || PRIVATE_IP.test(bare) || bare === "::1" || /^f[cd][0-9a-f]{2}:/i.test(bare) || /^fe80:/i.test(bare)) return { ok: false, reason: "Private or local addresses cannot be read" };
  if (appHost && host === appHost.toLowerCase()) return { ok: false, reason: "The workspace itself cannot be read as a web page" };
  if (host === "www.sec.gov" && url.pathname.startsWith("/Archives/")) return { ok: false, reason: "SEC filings are read with read_filing, which keeps the item structure" };
  return { ok: true, url };
}

export type WebPage = { url: string; finalUrl: string; title: string | null; text: string; truncated: boolean; contentType: string };

/** Fetch a public page as readable text: bounded time, bounded bytes, text content types only. */
export async function fetchWebPage(url: URL): Promise<WebPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; OwlsNestResearchAgent/1.0)", Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1" } });
    if (!res.ok) throw new Error(`The page returned HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) throw new Error(`Not a readable page (content type ${contentType || "unknown"})`);
    const final = new URL(res.url || url.href);
    const check = safeWebUrl(final.href);
    if (!check.ok) throw new Error(`Redirected to a refused address: ${check.reason}`);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          bytes += value.byteLength;
        }
        if (bytes >= WEB_MAX_BYTES) {
          truncated = true;
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
    const text = (/html/i.test(contentType) ? htmlToText(raw.replace(/<(nav|footer|header|aside|noscript|svg|form)[\s\S]*?<\/\1>/gi, "")) : raw.trim())
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#39;|&apos;/g, "'")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n");
    return { url: url.href, finalUrl: final.href, title, text, truncated, contentType };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`The page did not respond within ${WEB_TIMEOUT_MS / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function concat(chunks: Uint8Array[]) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}
