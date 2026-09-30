// Pure: compare one section of a filing with the same section of the right earlier filing as two SETS of masked
// sentences (Lazy Prices, Cohen, Malloy and Nguyen 2020). No embeddings: a sentence is new when its masked key is new.
import type { ChangeDiff } from "@/db/schema";
import { splitSentences, type Sentence } from "./mask";

/**
 * Share of masked sentences added or removed at or above which a section goes to the model for labels. Set in Phase 0
 * from the hand test. A section that shrank by more than half is flagged whatever this says.
 */
export const CHANGE_THRESHOLD = 0.15;

/** A prior section shorter than this (characters of sentences) is too small for "shrank by more than half" to mean anything. */
export const MIN_SHRINK_BASE_CHARS = 400;

/** Caps on what one diff stores; the model sees far less (see label-model.ts). */
export const MAX_DIFF_SENTENCES = 400;
export const MAX_NUMBERS_CHANGED = 150;

/**
 * text: ordinary prose. no_change: the "no material changes to our risk factors" boilerplate, which says nothing
 * changed. empty: nothing to compare ("Not applicable.", "None.", or no sentences at all).
 */
export type SectionKind = "text" | "no_change" | "empty";

export type ParsedSection = { kind: SectionKind; sentences: Sentence[]; chars: number };

const NO_CHANGE = /\bno (?:material|significant) changes?\b|\bnot (?:materially )?changed materially\b|\bhave not materially changed\b/i;
/** "Except as set forth below, there have been no material changes…" is followed by real updates. */
const EXCEPTION = /\bexcept\b|\bother than\b|\bset forth below\b|\bdescribed below\b|\bas follows\b|\bthe following\b|\bsupplement(?:s|ed)?\b|\bupdated?\b/i;
const NOT_APPLICABLE = /^(?:item\s+\S+\s*)?[^.]{0,80}?\b(?:not applicable|none|omitted|not required|reserved)\b/i;

/** Sentences of a section, and whether it is boilerplate. Boilerplate counts as empty whatever its length. */
export function parseSection(text: string | null | undefined): ParsedSection {
  const sentences = splitSentences(text ?? "");
  // The boilerplate sits at the top of the section (after its heading); a long section that says "no material
  // changes to our critical accounting estimates" halfway through is prose, not boilerplate.
  const head = sentences.slice(0, 3).map((s) => s.text).join(" ");
  if (NO_CHANGE.test(head) && !EXCEPTION.test(head)) return { kind: "no_change", sentences: [], chars: 0 };
  const body = (text ?? "").replace(/\s+/g, " ").trim();
  if (!sentences.length || (sentences.length <= 2 && NOT_APPLICABLE.test(body) && body.length < 300)) return { kind: "empty", sentences: [], chars: 0 };
  return { kind: "text", sentences, chars: sentences.reduce((n, s) => n + s.text.length, 0) };
}

export type SectionComparison = {
  diff: ChangeDiff;
  /** Share of masked sentences added or removed, 0..1. */
  score: number;
  /** removed: the heading is gone; shrunk: less than half as long as before. Null for neither. */
  shrink: "removed" | "shrunk" | null;
  current: { kind: SectionKind | "missing"; chars: number; sentences: number };
  prior: { kind: SectionKind | "missing"; chars: number; sentences: number };
  /** The current filing says nothing changed: nothing to label or flag. */
  saysNoChange: boolean;
};

export type CompareOptions = {
  /**
   * The same section of the immediately prior filing, for a 10-Q's MD&A compared with the same quarter last year:
   * an added sentence already there, or a removed one already gone there, was flagged last time and is suppressed.
   */
  suppressWith?: string | null;
  /** Only added sentences count and nothing can shrink: a 10-Q's Item 1A lists only changes since the 10-K. */
  addedOnly?: boolean;
};

function firstByKey(sentences: Sentence[]) {
  const m = new Map<string, string>();
  for (const s of sentences) if (!m.has(s.key)) m.set(s.key, s.text);
  return m;
}

/**
 * Compare a section (null when the filing has no such heading) with the earlier one. A sentence that only moved, or
 * only had its numbers roll forward, is not a change; one whose masked key matches but whose text differs goes to
 * `numbersChanged`, which the model sees for the customer-concentration and non-GAAP labels.
 */
export function compareSections(currentText: string | null, priorText: string | null, opts: CompareOptions = {}): SectionComparison {
  const cur = currentText === null ? null : parseSection(currentText);
  const pri = priorText === null ? null : parseSection(priorText);
  const summary = (p: ParsedSection | null) => (p ? { kind: p.kind, chars: p.chars, sentences: p.sentences.length } : { kind: "missing" as const, chars: 0, sentences: 0 });
  const empty: ChangeDiff = { added: [], removed: [], numbersChanged: [] };
  const base = { current: summary(cur), prior: summary(pri) };
  if (!pri) return { ...base, diff: empty, score: 0, shrink: null, saysNoChange: false };
  const canShrink = !opts.addedOnly && pri.chars >= MIN_SHRINK_BASE_CHARS;
  if (!cur) {
    const removed = pri.sentences.slice(0, MAX_DIFF_SENTENCES).map((s) => s.text);
    return { ...base, diff: { ...empty, removed }, score: canShrink ? 1 : 0, shrink: canShrink ? "removed" : null, saysNoChange: false };
  }
  if (cur.kind === "no_change") return { ...base, diff: empty, score: 0, shrink: null, saysNoChange: true };

  const curKeys = firstByKey(cur.sentences);
  const priKeys = firstByKey(pri.sentences);
  const suppress = opts.suppressWith != null ? new Set(parseSection(opts.suppressWith).sentences.map((s) => s.key)) : null;
  const added: string[] = [];
  const removed: string[] = [];
  const numbersChanged: ChangeDiff["numbersChanged"] = [];
  for (const [key, text] of curKeys) {
    const before = priKeys.get(key);
    if (before === undefined) {
      if (!suppress?.has(key)) added.push(text);
    } else if (before !== text) numbersChanged.push({ before, after: text });
  }
  if (!opts.addedOnly) for (const [key, text] of priKeys) if (!curKeys.has(key) && !(suppress && !suppress.has(key))) removed.push(text);
  const union = new Set([...curKeys.keys(), ...priKeys.keys()]).size;
  const score = union ? (added.length + removed.length) / union : 0;
  const shrink = canShrink && cur.chars < pri.chars / 2 ? "shrunk" : null;
  return {
    ...base,
    diff: { added: added.slice(0, MAX_DIFF_SENTENCES), removed: removed.slice(0, MAX_DIFF_SENTENCES), numbersChanged: numbersChanged.slice(0, MAX_NUMBERS_CHANGED) },
    score,
    shrink,
    saysNoChange: false,
  };
}

/** Whether a comparison goes to the model: over the threshold with something added or removed to label. */
export function needsLabels(c: SectionComparison): boolean {
  return c.score >= CHANGE_THRESHOLD && c.diff.added.length + c.diff.removed.length > 0;
}
