/**
 * Which parts of a filing are stored and embedded, and how stored text is split back into labeled sections.
 * Pure module (no DB, no network) so the ingest job and tests share one definition.
 */
import { extractItem } from "@/lib/providers/edgar";
import { chunkText, MAX_CHUNKS_PER_FILE, type Chunk } from "@/lib/drive/chunk";

/** Items kept per form, in priority order (MD&A and risk factors first so the chunk cap favors them). */
export const FILING_ITEMS: Record<string, string[]> = {
  "10-K": ["7", "1A", "1", "7A"],
  "10-Q": ["2", "1A", "3"],
};

/** Chunks any one section may take, so a huge MD&A cannot crowd out the risk factors. */
export const MAX_CHUNKS_PER_SECTION = 80;

const SECTION_MARK = /^## (Item [^\n]+)$/m;

export type Section = { label: string | null; text: string };

/** Base form without amendment suffix: "10-K/A" → "10-K". */
export function baseForm(form: string | null | undefined): string {
  return (form ?? "").toUpperCase().replace(/\/A$/, "");
}

/** Whether a filing is stored as extracted Item sections (true) or as its whole text (8-K, exhibits). */
export function usesItemSections(form: string | null | undefined): boolean {
  return baseForm(form) in FILING_ITEMS;
}

/**
 * The text we keep for a 10-K/10-Q: the listed Items, each under a "## Item X" heading. Returns null when none of
 * the items could be found (an unusual layout), so the caller can fall back to the whole text.
 */
export function filingSectionsText(form: string, fullText: string): { text: string; found: string[] } | null {
  const items = FILING_ITEMS[baseForm(form)];
  if (!items) return null;
  const parts: string[] = [];
  const found: string[] = [];
  for (const item of items) {
    const body = extractItem(fullText, item);
    if (!body) continue;
    found.push(`Item ${item}`);
    parts.push(`## Item ${item}\n\n${body.trim()}`);
  }
  return parts.length ? { text: parts.join("\n\n"), found } : null;
}

/** Split stored text on "## Item X" headings; text without markers is one unlabeled section. */
export function splitSections(text: string): Section[] {
  if (!SECTION_MARK.test(text)) return [{ label: null, text }];
  const out: Section[] = [];
  const re = /^## (Item [^\n]+)$/gm;
  let m: RegExpExecArray | null;
  let last: { label: string; start: number } | null = null;
  while ((m = re.exec(text))) {
    if (last) out.push({ label: last.label, text: text.slice(last.start, m.index).trim() });
    last = { label: m[1].trim(), start: m.index + m[0].length };
  }
  if (last) out.push({ label: last.label, text: text.slice(last.start).trim() });
  return out.filter((s) => s.text);
}

export type SectionChunk = Chunk & { section: string | null };

/** Chunks for embedding: per section for filings stored as Items, plain for everything else; capped and re-sequenced. */
export function chunkDocument(kind: "drive" | "filing" | "web", text: string, opts: { max?: number } = {}): SectionChunk[] {
  const max = opts.max ?? MAX_CHUNKS_PER_FILE;
  if (kind !== "filing") return chunkText(text, { max }).map((c) => ({ ...c, section: null }));
  const out: SectionChunk[] = [];
  for (const s of splitSections(text)) {
    // Labeled Items share the cap; a whole document (8-K, exhibit, or a filing without headings) may use all of it.
    const room = Math.min(s.label ? MAX_CHUNKS_PER_SECTION : max, max - out.length);
    if (room <= 0) break;
    for (const c of chunkText(s.text, { max: room })) out.push({ ...c, seq: out.length, section: s.label });
  }
  return out;
}
