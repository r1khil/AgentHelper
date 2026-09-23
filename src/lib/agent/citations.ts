import type { UIMessage } from "ai";
import { enrichLegacySource } from "./source-resolution";
import { isToolPart } from "./turn";
import type { Source } from "@/lib/providers/types";

export const CITATION_RE = /\[src:\s*([A-Za-z0-9_\-]+(?:\s*,\s*(?:src:\s*)?[A-Za-z0-9_\-]+)*)\]/g;

/** Collect every Source returned by tool outputs across messages, keyed by id. */
export function collectSources(messages: UIMessage[]): Map<string, Source> {
  const map = new Map<string, Source>();
  for (const m of messages) {
    for (const p of m.parts) {
      if (isToolPart(p) && p.state === "output-available") {
        const out = (p as { output?: { sources?: Source[] } }).output;
        for (const s of Array.isArray(out?.sources) ? out.sources : []) {
          if (!s || typeof s.id !== "string") continue;
          // Keep the first retrieved evidence stable when later turns reuse an id.
          const enriched = enrichLegacySource(s, (out as { data?: unknown }).data);
          const existing = map.get(s.id);
          map.set(s.id, existing ? { ...enriched, ...existing, excerpt: existing.excerpt || enriched.excerpt, location: existing.location ?? enriched.location } : enriched);
        }
      }
    }
  }
  return map;
}

/**
 * Heuristic: lines (paragraphs, bullets) that state a number but carry no citation token.
 * Counted per line rather than per sentence because a bullet usually ends with one token that covers it.
 * Headings, table rows, bold labels, and bare markdown separators are skipped. Labeled as a heuristic in the UI.
 */
export function uncitedFactCount(message: UIMessage) {
  let n = 0;
  for (const p of message.parts) {
    if (p.type !== "text") continue;
    for (const raw of p.text.split(/\n+/)) {
      const line = raw.trim();
      if (line.length <= 20 || !/\d/.test(line) || /\[src:/.test(line)) continue;
      if (/^(#|\||---|\*\*[^*]+:\*\*$)/.test(line)) continue;
      n++;
    }
  }
  return n;
}

/** Uncited numeric lines above this many trigger the repair pass. */
export const REPAIR_THRESHOLD = 2;

/** Whether an answer should go through the citation-repair pass: enough uncited numeric lines, and sources it could cite. */
export function needsCitationRepair(message: UIMessage, sourceCount: number) {
  return sourceCount > 0 && uncitedFactCount(message) > REPAIR_THRESHOLD;
}

/** Levenshtein distance, giving up (returning max + 1) once every path exceeds `max`. */
function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...row) > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

const idPrefix = (id: string) => id.slice(0, id.indexOf("-") + 1);

/**
 * The retrieved id a mistyped citation most plausibly meant: the only known id with the same prefix
 * (e.g. "web-") within edit distance 1, or 2 for ids of 8+ characters. Null when there is no such id
 * or several, since guessing between sources would cite the wrong evidence.
 */
export function resolveCitedId(cited: string, known: Set<string>): string | null {
  if (known.has(cited)) return cited;
  const max = cited.length >= 8 ? 2 : 1;
  const prefix = idPrefix(cited);
  const matches = [...known].filter((id) => idPrefix(id) === prefix && editDistance(cited, id, max) <= max);
  return matches.length === 1 ? matches[0] : null;
}

/** Rewrite mistyped [src:ID] tokens in `text` to the retrieved id they unambiguously meant; leave the rest as-is. */
export function fixCitationTypos(text: string, known: Set<string>) {
  return text.replace(new RegExp(CITATION_RE), (token) => token.replace(/(src:\s*|,\s*)([A-Za-z0-9_\-]+)(?=\s*[,\]])/g, (_, lead: string, id: string) => lead + (resolveCitedId(id, known) ?? id)));
}

/** Apply fixCitationTypos to every text part of a message. Returns the same message when nothing changed. */
export function fixMessageCitationTypos(message: UIMessage, known: Set<string>): UIMessage {
  let changed = false;
  const parts = message.parts.map((p) => {
    if (p.type !== "text") return p;
    const text = fixCitationTypos(p.text, known);
    if (text === p.text) return p;
    changed = true;
    return { ...p, text };
  });
  return changed ? { ...message, parts } : message;
}
