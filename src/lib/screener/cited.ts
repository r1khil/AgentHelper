// Pure: the rules every piece of Hoot's Screener prose passes before anyone sees it. The model gets numbered sources
// and answers in JSON; every sentence must cite a source it was given, and every quote must appear word for word in
// that source's text. Anything that fails holds the whole piece back, with the reason.
import type { Citation, CitedSentence } from "@/db/schema";
import { extractJsonObject } from "@/lib/agent/json-repair";

/** A source the model may cite: its number, what to call it, where it links, and the text it was shown. */
export type CiteSource = { n: number; label: string; url: string; text: string };

/** Under 8k input tokens per call (about 4 characters a token), leaving room for the instructions. */
export const INPUT_CHAR_BUDGET = 26_000;

/** Curly quotes, dashes and runs of whitespace compared as their plain forms, both sides. */
export function normalizeForQuote(s: string): string {
  return s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function quoteAppears(quote: string, text: string): boolean {
  const q = normalizeForQuote(quote);
  return q.length > 0 && normalizeForQuote(text).includes(q);
}

/** The sources block of a prompt: `[n] label` then the text, each cut to its share of the budget. */
export function sourcesBlock(sources: CiteSource[], budget = INPUT_CHAR_BUDGET): string {
  const share = Math.floor(budget / Math.max(1, sources.length));
  return sources.map((s) => `[${s.n}] ${s.label}\n${s.text.slice(0, share)}`).join("\n\n");
}

const asSentence = (x: unknown): CitedSentence | null => {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text.trim() : "";
  if (!text) return null;
  const cites = Array.isArray(o.cites) ? o.cites.map(Number).filter((n) => Number.isInteger(n)) : [];
  const quote = typeof o.quote === "string" && o.quote.trim() ? o.quote.trim() : undefined;
  return { text, cites, ...(quote ? { quote } : {}) };
};

/** A list of cited sentences from a parsed JSON field; anything malformed is dropped (and so counts as missing). */
export function sentences(x: unknown): CitedSentence[] {
  return Array.isArray(x) ? x.map(asSentence).filter((s): s is CitedSentence => !!s) : [];
}

/** The model's JSON answer, repaired when it was cut off or wrapped in prose; null when there is none. */
export function parseAnswer(text: string): Record<string, unknown> | null {
  const v = extractJsonObject(text);
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Checks sentences against the sources they cite: each needs at least one citation to a given source, and a quote must
 * appear word for word in one of the sources it cites. Returns the first problem, or null when all pass.
 */
export function verifySentences(list: CitedSentence[], sources: CiteSource[]): string | null {
  const byN = new Map(sources.map((s) => [s.n, s]));
  for (const s of list) {
    if (!s.cites.length) return `Uncited claim: "${s.text.slice(0, 80)}"`;
    const cited = s.cites.map((n) => byN.get(n));
    if (cited.some((c) => !c)) return `Cites a source it wasn't given: "${s.text.slice(0, 80)}"`;
    if (s.quote && !cited.some((c) => quoteAppears(s.quote!, c!.text))) return `Quote not found in the filing: "${s.quote.slice(0, 80)}"`;
  }
  return null;
}

/** The citations list for the page: only the sources actually cited, with any quote that cited them. */
export function citationsFor(list: CitedSentence[], sources: CiteSource[]): Citation[] {
  const used = new Set(list.flatMap((s) => s.cites));
  return sources.filter((s) => used.has(s.n)).map((s) => ({ n: s.n, url: s.url, label: s.label }));
}

export const CITED_RULES = `Rules:
- Use only the numbered sources. Every sentence carries "cites": the source numbers it rests on. A sentence you cannot cite, leave out.
- Never write a figure, percentage, multiple or date that is not in the quoted text; the page shows the numbers from code.
- A "quote", when you give one, is copied word for word from a source you cite (at most 25 words).
- Plain English, short sentences, no hedging filler, no advice to buy or sell.
- Answer with one JSON object only, no prose around it.`;
