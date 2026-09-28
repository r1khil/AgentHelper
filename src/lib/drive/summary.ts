import { extractJsonObject } from "@/lib/agent/json-repair";

/**
 * Structured summary of a team document, extracted by the app. Pure: prompt building and defensive parsing only;
 * the model call lives in summarize.ts. Bump SUMMARY_VERSION when the shape or prompt changes materially; every
 * indexed file is then re-summarized on the next ingest run (one model call per file).
 */
export const SUMMARY_VERSION = 1;

export type DocSummary = {
  /** One sentence, <= 200 chars, on what the document is and concludes. */
  oneLine: string;
  /** The document's stated investment thesis, close to verbatim. Null when the document states none. */
  thesis: string | null;
  /** Rating as written (Buy, Hold, Outperform, ...). Null unless stated. */
  rating: string | null;
  /** Price target as written, e.g. "$245 (12-month)". Null unless stated. */
  priceTarget: string | null;
  /** Up to 8 entries, each "label: value (period)". */
  keyNumbers: string[];
  /** Up to 6 catalysts the document names. */
  catalysts: string[];
  /** Up to 6 risks the document names. */
  risks: string[];
  /** Document date as yyyy-mm-dd when the document states one. */
  docDate: string | null;
  /** The model's own caveat when the document is thin, partial, or not what its name suggests. */
  evidenceNote: string | null;
};

export const EMPTY_SUMMARY: DocSummary = { oneLine: "", thesis: null, rating: null, priceTarget: null, keyNumbers: [], catalysts: [], risks: [], docDate: null, evidenceNote: null };

const LIMITS = { oneLine: 200, thesis: 1500, rating: 40, priceTarget: 80, item: 240, keyNumbers: 8, catalysts: 6, risks: 6, evidenceNote: 300 };
const TRUNCATION_MARKER = "\n\n[... middle of document omitted ...]\n\n";

/** The slice of text sent to the model: head plus tail when the document is long, so conclusions survive. */
export function summaryInput(text: string, max = 60_000): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = Math.floor(max * 0.7);
  const tail = max - head - TRUNCATION_MARKER.length;
  return `${t.slice(0, head)}${TRUNCATION_MARKER}${t.slice(t.length - tail)}`;
}

export function summaryInstructions(meta: { name: string; kind: string | null; ticker: string | null; modifiedTime: string | null }): string {
  return `You extract a structured summary of one document from a university investment fund's analyst Drive. The document is "${meta.name}"${meta.ticker ? ` about ${meta.ticker}` : ""}${meta.kind ? ` (classified by folder as ${meta.kind.replace(/_/g, " ")})` : ""}${meta.modifiedTime ? `, last modified ${meta.modifiedTime}` : ""}.

Rules:
- Use only what the document says. Never add facts, ratings, price targets, or dates that are not written in it.
- If a field is absent from the document, return null for strings and [] for lists. An empty field is correct; a guessed one is wrong.
- Quote numbers with their unit and period exactly as written (e.g. "FY2025 revenue: $17.9B", "Q2 FY26 EPS: $1.42").
- "thesis" is the document's own investment thesis in its own words, condensed but not reinterpreted. Do not evaluate it.
- "docDate" is the document's stated date (cover page, header, "as of"), as yyyy-mm-dd. Null when not stated.
- If the document is a spreadsheet, describe its structure and the headline outputs it contains, not every cell.
- If the content is thin, partial, or not what the file name suggests, say so in "evidenceNote".

Respond with JSON only, no prose, no code fence, exactly this shape:
{"oneLine":"","thesis":null,"rating":null,"priceTarget":null,"keyNumbers":[],"catalysts":[],"risks":[],"docDate":null,"evidenceNote":null}`;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function list(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x as Record<string, unknown>).map(String).join(": ") : String(x ?? "")))
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((x) => x.slice(0, LIMITS.item));
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isoDate(v: unknown): string | null {
  const s = str(v, 10);
  if (!s) return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return s;
}

/**
 * Parse the model's reply defensively: prose around the object, code fences and trailing commas are tolerated.
 * Never throws; returns null when no JSON object can be recovered, so the caller records a failure, not a summary.
 */
export function parseSummaryJson(raw: string): DocSummary | null {
  const parsed = extractJsonObject(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return {
    oneLine: str(parsed.oneLine, LIMITS.oneLine) ?? "",
    thesis: str(parsed.thesis, LIMITS.thesis),
    rating: str(parsed.rating, LIMITS.rating),
    priceTarget: str(parsed.priceTarget, LIMITS.priceTarget),
    keyNumbers: list(parsed.keyNumbers, LIMITS.keyNumbers),
    catalysts: list(parsed.catalysts, LIMITS.catalysts),
    risks: list(parsed.risks, LIMITS.risks),
    docDate: isoDate(parsed.docDate),
    evidenceNote: str(parsed.evidenceNote, LIMITS.evidenceNote),
  };
}

export function isEmptySummary(s: DocSummary | null | undefined): boolean {
  if (!s) return true;
  return !s.oneLine && !s.thesis && !s.rating && !s.priceTarget && !s.keyNumbers.length && !s.catalysts.length && !s.risks.length;
}

/** The note parseSummaryJson stored in place of a summary before parse failures went to summary_error. */
const LEGACY_PARSE_FAILURE_NOTE = "The summary could not be parsed from the model's reply.";

/** A stored summary that is really a failed parse from before that change: shown as no summary, and re-summarized. */
export function isFailedSummary(s: DocSummary | null | undefined): boolean {
  return !!s && isEmptySummary(s) && s.evidenceNote === LEGACY_PARSE_FAILURE_NOTE;
}

/** Indented bullet lines for the agent prompt, capped so a long document cannot crowd out the rest. */
export function summaryToPromptLines(s: DocSummary, maxChars = 600, indent = "    "): string {
  if (isEmptySummary(s)) return "";
  const lines: string[] = [];
  if (s.docDate) lines.push(`dated ${s.docDate}`);
  if (s.oneLine) lines.push(s.oneLine);
  if (s.thesis) lines.push(`thesis: ${s.thesis}`);
  const rp = [s.rating ? `rating ${s.rating}` : null, s.priceTarget ? `price target ${s.priceTarget}` : null].filter(Boolean);
  if (rp.length) lines.push(rp.join(", "));
  if (s.keyNumbers.length) lines.push(`key numbers: ${s.keyNumbers.slice(0, 3).join("; ")}`);
  if (s.catalysts.length) lines.push(`catalysts: ${s.catalysts.slice(0, 2).join("; ")}`);
  if (s.risks.length) lines.push(`risks: ${s.risks.slice(0, 2).join("; ")}`);
  if (s.evidenceNote) lines.push(`note: ${s.evidenceNote}`);
  let out = "";
  for (const l of lines) {
    const next = `${indent}- ${l}\n`;
    if (out.length + next.length > maxChars) {
      const room = maxChars - out.length - indent.length - 4;
      if (room > 20) out += `${indent}- ${l.slice(0, room)}…\n`;
      break;
    }
    out += next;
  }
  return out.replace(/\n$/, "");
}
