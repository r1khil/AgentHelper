// Pure: turn a filing section into sentences and give each one a masked key, so two filings can be compared as sets
// of sentences. Masking replaces numbers, dates and period names ("three months ended June 30") with placeholders:
// a sentence whose numbers merely rolled forward keeps the same key, and one that only moved keeps it too.

/** One sentence as the filing wrote it (whitespace collapsed) and its masked comparison key. */
export type Sentence = { text: string; key: string };

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const NUMBER_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred";
const ORDINALS = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth";

const MASKS: [RegExp, string][] = [
  // Period names first, while their words are intact: "three months ended", "first quarter", "fiscal 2025", "Q2", "FY25".
  [new RegExp(`\\b(?:${NUMBER_WORDS}|\\d+)[- ](?:months?|weeks?|quarters?|years?)[- ](?:ended|ending|then ended)\\b`, "g"), " <period> "],
  [new RegExp(`\\b(?:${ORDINALS}|\\d+(?:st|nd|rd|th))[- ](?:fiscal[- ])?(?:quarter|half|quarters)\\b`, "g"), " <period> "],
  [/\b(?:q[1-4]|[1-4]q|h[12]|fy ?\d{2,4}|fiscal(?: year)? ?\d{2,4})\b/g, " <period> "],
  [new RegExp(`\\b(?:${MONTHS})\\.?\\b`, "g"), " <month> "],
  // Numbers in any dress: $1,234.5, (12.3)%, 2025, 6/30/2025, 1st.
  [/[$€£¥]?\(?\d[\d,]*(?:\.\d+)?\)?(?:%|st|nd|rd|th)?/g, " # "],
  [new RegExp(`\\b(?:${NUMBER_WORDS})\\b`, "g"), " # "],
];

/** The comparison key: lowercased, numbers, dates and period names masked, punctuation dropped, spaces collapsed. */
export function maskSentence(s: string): string {
  let t = s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  for (const [re, to] of MASKS) t = t.replace(re, to);
  return t
    .replace(/[^a-z#<>'\s-]/g, " ")
    .replace(/(?:#[\s-]*)+/g, "# ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words that end in a period without ending the sentence. */
const ABBREVIATIONS = new Set(["inc", "corp", "co", "ltd", "llc", "l.p", "lp", "no", "nos", "u.s", "u.k", "e.g", "i.e", "vs", "mr", "ms", "mrs", "dr", "st", "approx", "etc", "jr", "sr", "n.a", "s.a", "p.m", "a.m", "fig", "sec", "art", "dept", "est"]);

function splitLine(line: string): string[] {
  const out: string[] = [];
  let start = 0;
  // A sentence ends at . ! or ? (maybe followed by a closing quote or bracket), then space, then a capital or an opening quote.
  const re = /[.!?]["”’')\]]*\s+(?=["“‘(]?[A-Z])/g;
  for (const m of line.matchAll(re)) {
    const end = (m.index ?? 0) + 1;
    const before = line.slice(start, end - 1);
    const word = /(\S+)$/.exec(before)?.[1]?.toLowerCase().replace(/^[("“]+/, "") ?? "";
    // "U.S. Government", "Inc. and", "No. 5": not an end. A single capital letter ("J. Smith") isn't either.
    if (ABBREVIATIONS.has(word) || /^[a-z]$/.test(word)) continue;
    out.push(line.slice(start, (m.index ?? 0) + m[0].trimEnd().length));
    start = (m.index ?? 0) + m[0].length;
  }
  out.push(line.slice(start));
  return out;
}

/** A sentence needs this many words of text after masking; shorter pieces are headings, table labels or numbers. */
export const MIN_SENTENCE_WORDS = 4;

const words = (key: string) => key.split(" ").filter((w) => /^[a-z][a-z'-]+$/.test(w)).length;

/**
 * A section's sentences in document order, each with its masked key. Lines and table cells (tabs, after htmlToText)
 * are split first, then sentences within them. Table rows of numbers and short headings drop out.
 */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  for (const cell of text.split(/[\n\t]+/)) {
    for (const raw of splitLine(cell)) {
      const t = raw.replace(/\s+/g, " ").trim();
      if (!t) continue;
      const key = maskSentence(t);
      if (words(key) < MIN_SENTENCE_WORDS) continue;
      out.push({ text: t, key });
    }
  }
  return out;
}
