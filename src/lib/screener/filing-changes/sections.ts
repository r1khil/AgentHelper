// Pure: pull one "Item X" section out of a 10-K or 10-Q's text (from htmlToText), knowing which Part it sits in.
// Unlike extractItem in the EDGAR provider there is no minimum length: the detector measures the raw section, and a
// section cut down to "None." is exactly what it needs to see.

export type PeriodicForm = "10-K" | "10-Q";
export type Part = "I" | "II";

/** "Item 1A." / "ITEM 7 —" at a line or table-cell start. htmlToText turns cell ends into tabs, so tabs count. */
const HEADING_RE = /(^|\n|\t)[ \t]*item[ \t]*(\d{1,2}[a-c]?(?:\.\d{2})?)(?=[ \t]*[.:\-–—\s])/gi;
/** "PART II" / "Part II — Other Information" at a line or cell start. */
const PART_RE = /(^|\n|\t)[ \t]*part[ \t]+(iv|i{1,3})(?![a-z0-9])/gi;
/** A table-of-contents line: a title and a page number, no sentence. */
const TOC_LINE = /^[^.]{0,160}?\s\d{1,3}\s*$/;

type Mark = { at: number; kind: "item" | "part"; value: string };

function marks(text: string): Mark[] {
  const out: Mark[] = [];
  for (const m of text.matchAll(HEADING_RE)) out.push({ at: (m.index ?? 0) + m[1].length, kind: "item", value: m[2].toUpperCase() });
  for (const m of text.matchAll(PART_RE)) out.push({ at: (m.index ?? 0) + m[1].length, kind: "part", value: m[2].toUpperCase() });
  return out.sort((a, b) => a.at - b.at);
}

/** A 10-Q's Items 1A, 5 and 6 are in Part II; Items 1–4 mean Part I unless asked otherwise. A 10-K's item numbers are unique. */
export function defaultPart(form: PeriodicForm, item: string): Part | null {
  if (form !== "10-Q") return null;
  return /^(1A|1B|5|6)$/i.test(item) ? "II" : "I";
}

/**
 * The text of one Item, heading included, or null when the filing has no body section by that heading.
 * The same heading appears in the table of contents and, in a 10-Q, in both Parts (Part I Item 2 is MD&A, Part II
 * Item 2 is share repurchases), so candidates are limited to the right Part (split at the last "PART II" heading,
 * which is the body's, not the contents') and the longest wins. Contents lines (a title and a page number) never do.
 */
export function extractSection(text: string, form: PeriodicForm, item: string, part: Part | null = defaultPart(form, item)): string | null {
  const want = item.toUpperCase().replace(/^ITEM\s*/, "");
  const all = marks(text);
  let lo = 0;
  let hi = text.length;
  if (part) {
    const partTwo = all.filter((m) => m.kind === "part" && m.value === "II").at(-1);
    if (partTwo) {
      if (part === "I") hi = partTwo.at;
      else lo = partTwo.at;
    }
  }
  let best: string | null = null;
  for (const [i, m] of all.entries()) {
    if (m.kind !== "item" || m.value !== want || m.at < lo || m.at >= hi) continue;
    const next = all.slice(i + 1).find((n) => n.at > m.at);
    const chunk = text.slice(m.at, Math.min(next?.at ?? text.length, part === "I" ? hi : text.length)).trim();
    const afterHeading = chunk.replace(/^item[ \t]*\S+[ \t]*[.:\-–—]?/i, "").trim();
    if (TOC_LINE.test(afterHeading) && !afterHeading.includes("\n")) continue;
    if (!best || chunk.length > best.length) best = chunk;
  }
  return best;
}
