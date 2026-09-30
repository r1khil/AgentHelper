// Pure: a label's quote must appear word for word in the filing text. Curly quotes, dashes and whitespace are
// normalized on both sides by the Screener's shared checker (cited.ts), so the Module 2 and Module 3 rules agree.
import { normalizeForQuote, quoteAppears } from "@/lib/screener/cited";

export { normalizeForQuote, quoteAppears };

/** A quote shorter than this many words proves nothing ("the Company"), so it fails. */
export const MIN_QUOTE_WORDS = 4;

/** The model often wraps a quote in quote marks or trims it with ellipses; those aren't part of the filing's words. */
export function cleanQuote(quote: string): string {
  return quote
    .trim()
    .replace(/^["'“‘…\s.]+|["'”’…\s]+$/g, "")
    .replace(/\.{3}$/, "")
    .trim();
}

/** Whether the quote appears word for word in any of the texts (the new filing, and the earlier sentences it removed). */
export function quoteInFiling(quote: string, texts: readonly string[]): boolean {
  const q = cleanQuote(quote);
  if (normalizeForQuote(q).split(" ").filter(Boolean).length < MIN_QUOTE_WORDS) return false;
  return texts.some((t) => quoteAppears(q, t));
}
