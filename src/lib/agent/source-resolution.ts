import type { Source } from "@/lib/providers/types";

/** Only actual external URLs can become anchors. Missing/relative URLs never mean chat. */
export function externalUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function documentId(source: Source): string | null {
  if (source.documentId && /^[\w-]+$/.test(source.documentId)) return source.documentId;
  // Compatibility with already persisted Drive tool results.
  if (!source.id.startsWith("drive-")) return null;
  const href = externalUrl(source.url);
  if (!href) return null;
  const url = new URL(href);
  if (!["drive.google.com", "docs.google.com"].includes(url.hostname)) return null;
  return url.pathname.match(/\/d\/([\w-]+)/)?.[1] ?? null;
}

export function sourceType(source: Source): string {
  if (source.sourceType) return source.sourceType;
  if (/transcript/i.test(source.title)) return "Transcript";
  if (/release|ex-?99/i.test(source.title)) return "Earnings release";
  if (/presentation|slides|\.pptx/i.test(source.title)) return "Presentation";
  if (source.id.startsWith("xbrl-")) return "XBRL financial data";
  if (source.id.startsWith("mcp-")) return "External tool";
  if (source.id.startsWith("web-")) return "Web page";
  if (/SEC/.test(source.publisher)) return "SEC filing";
  if (documentId(source)) return "Internal document";
  return "External source";
}

export type SourceTarget = { kind: "external"; href: string } | { kind: "document"; documentId: string } | { kind: "unavailable"; reason: string };

export function resolveSource(source?: Source): SourceTarget {
  if (!source) return { kind: "unavailable", reason: "This source was not retrieved in this conversation." };
  const id = documentId(source);
  if (id) return { kind: "document", documentId: id };
  const href = externalUrl(source.url);
  if (!href) return { kind: "unavailable", reason: "No document or valid source URL is available." };
  const url = new URL(href);
  const loc = source.location;
  // Browser-supported locators degrade to the original document when unsupported.
  if (loc?.page && Number.isInteger(loc.page) && loc.page > 0 && /\.pdf$/i.test(url.pathname)) {
    url.hash = `page=${loc.page}`;
  } else if (loc?.text?.trim() && !url.hash.includes(":~:text=")) {
    url.hash += `:~:text=${encodeURIComponent(loc.text.trim().replace(/\s+/g, " ").slice(0, 240)).replace(/-/g, "%2D")}`;
  }
  return { kind: "external", href: url.href };
}

/** Recover metadata from old tool outputs without fabricating missing passages/dates. */
export function enrichLegacySource(source: Source, data: unknown): Source {
  const out = { ...source };
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rows = [d, ...(Array.isArray(d.passages) ? d.passages : []), ...(Array.isArray(d.items) ? d.items : [])];
  const row = rows.find((r) => r && r.sourceId === source.id && (typeof r.text === "string" || typeof r.summary === "string"));
  if (row) {
    const excerpt = String(row.text ?? row.summary)
      .trim()
      .slice(0, 360);
    out.excerpt ??= excerpt;
    out.location ??= { text: excerpt.slice(0, 180), ...(typeof row.offset === "number" ? { offset: row.offset } : {}), ...(row.item ? { section: `Item ${row.item}` } : {}) };
  }
  return out;
}

/** Match actual text, allowing whitespace changes between extraction versions. Never guess offsets. */
export function supportingRange(text: string, passage?: string): { start: number; end: number } | null {
  if (!passage?.trim()) return null;
  const pattern = passage
    .trim()
    .split(/\s+/)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern).exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}
