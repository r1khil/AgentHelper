import { fmtDay } from "@/lib/format";
// Citing a gathered source in the write-up. The update is saved as plain text, so a citation is a short readable
// reference the reader (and Hoot, who reads the same evidence list) can match to a source: who published it, when,
// and the start of its headline.

const GIST_CHARS = 40;

/** A headline cut to about `max` characters on a word boundary, with an ellipsis when cut. */
export function gist(title: string, max = GIST_CHARS) {
  const t = title.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : t.slice(0, max)).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** "[Yahoo, Thu 24 Sep: Meta's stock surges as it moves from AI…]"; the date is left out when the source has none. */
export function citationFor(e: { title: string; publisher: string | null; publishedAt: Date | null }, fallbackSource: string) {
  const date = e.publishedAt ? fmtDay(e.publishedAt) : null;
  return `[${[e.publisher || fallbackSource, date].filter(Boolean).join(", ")}: ${gist(e.title)}]`;
}

/**
 * Puts `insert` in place of the selection `start`–`end` of `text`, adding a space on either side when it would
 * otherwise run into a word. Returns the clamped range, the exact string that replaces it, the new text, and where
 * the caret goes (just after the insert).
 */
export function insertAt(text: string, start: number, end: number, insert: string) {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  const before = text.slice(0, s);
  const after = text.slice(e);
  const lead = before && !/[\s(]$/.test(before) ? " " : "";
  const trail = after && !/^[\s.,;:!?)]/.test(after) ? " " : "";
  const spaced = `${lead}${insert}${trail}`;
  return { start: s, end: e, insert: spaced, text: before + spaced + after, caret: s + spaced.length };
}
