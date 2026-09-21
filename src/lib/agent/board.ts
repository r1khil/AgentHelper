import type { UIMessage } from "ai";
import type { Source } from "@/lib/providers/types";
import { CITATION_RE } from "./citations";
import { enrichLegacySource } from "./source-resolution";
import { isToolPart, splitAssistantParts, summarizeActivity, type Part } from "./turn";

/** One question and, once it exists, the assistant message that answers it. */
export type Turn = {
  /** The user message id; stable before and after the answer arrives. */
  id: string;
  question: string;
  assistant?: UIMessage;
  answerText: string;
  activity: Part[];
};

export function pairTurns(messages: UIMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      const question = m.parts
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("")
        .trim();
      turns.push({ id: m.id, question, answerText: "", activity: [] });
    } else if (m.role === "assistant" && turns.length > 0) {
      const t = turns[turns.length - 1];
      const { activity, answer } = splitAssistantParts(m.parts);
      t.assistant = m;
      t.activity = activity;
      t.answerText = answer.map((p) => p.text).join("\n\n");
    }
  }
  return turns;
}

/** Source ids in citation order, with repeats, as written in an answer. */
export function citedIds(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(CITATION_RE)) {
    for (const raw of m[1].split(",")) {
      const id = raw.replace(/^\s*src:\s*/, "").trim();
      if (id) ids.push(id);
    }
  }
  return ids;
}

export type TurnSource = {
  source: Source;
  n: number;
  /** How many times the active answer cites it. */
  cited: number;
  /** The tool's data row that produced this source, when the tool returned one (quotes, relative moves). */
  data?: Record<string, unknown>;
};

/**
 * Sources for one answer: everything its tools returned, in retrieval order, followed by any earlier-turn
 * sources the answer cites. Numbering restarts at 1 for each answer so the chips read like footnotes.
 */
export function turnSources(turn: Turn, all: Map<string, Source>): TurnSource[] {
  const ordered = new Map<string, TurnSource>();
  const add = (s: Source, data?: Record<string, unknown>) => {
    if (ordered.has(s.id)) return;
    ordered.set(s.id, { source: s, n: ordered.size + 1, cited: 0, data });
  };
  for (const p of turn.activity) {
    if (!isToolPart(p) || p.state !== "output-available") continue;
    const out = p.output as { sources?: Source[]; data?: unknown } | undefined;
    const data = out?.data && typeof out.data === "object" ? (out.data as Record<string, unknown>) : undefined;
    for (const s of Array.isArray(out?.sources) ? out.sources : []) {
      if (!s || typeof s.id !== "string") continue;
      const row = data && data.sourceId === s.id ? data : undefined;
      add(all.get(s.id) ?? enrichLegacySource(s, out?.data), row);
    }
  }
  for (const id of citedIds(turn.answerText)) {
    const s = all.get(id);
    if (s) add(s);
    const row = ordered.get(id);
    if (row) row.cited++;
  }
  return [...ordered.values()];
}

const KIND_LABELS: Record<string, string> = {
  get_quote: "Pulling market data",
  get_price_history: "Pulling price history",
  get_relative_moves: "Comparing with the S&P",
  get_filings: "Searching EDGAR filings",
  read_filing: "Reading a filing",
  list_filing_documents: "Listing filing documents",
  search_financial_concepts: "Searching XBRL concepts",
  get_financials: "Pulling financials",
  get_key_financials: "Pulling key financials",
  get_news: "Scanning news",
  get_earnings_calendar: "Checking the earnings calendar",
  get_team_context: "Reading team notes",
  get_peer_moves: "Checking peer moves",
  find_drive_files: "Searching team documents",
  search_drive_text: "Reading team documents",
  read_drive_file: "Reading a team document",
  find_call_transcripts: "Searching call transcripts",
  read_call_transcript: "Reading a call transcript",
  remember: "Saving a note to the research log",
  recall: "Checking the research log",
  read_web_page: "Reading a web page",
  get_insider_transactions: "Checking insider filings",
  get_institutional_holders: "Checking who owns the stock",
  get_analyst_estimates: "Pulling consensus estimates",
  compare_peers: "Comparing peers",
};

/** Human label for a tool step; unknown (external MCP) tools read as "Using <name>". */
export function toolLabel(name: string) {
  return KIND_LABELS[name] ?? `Using ${name.replace(/_/g, " ")}`;
}

/** The one-line research trace under an answer, or the live step label while it is still being written. */
export function traceLine(turn: Turn, live: boolean): { text: string; working: boolean } {
  const { lookups, sources, failed, current } = summarizeActivity(turn.activity);
  const working = live && (current !== null || lookups === 0 || turn.answerText.length === 0);
  if (working) {
    const step = current ? toolLabel(current) : lookups === 0 ? "Reading the question" : "Writing the answer";
    return { text: `${step}… · ${sources} source${sources === 1 ? "" : "s"}`, working: true };
  }
  const parts = [`Searched ${lookups} lookup${lookups === 1 ? "" : "s"}`, `${sources} source${sources === 1 ? "" : "s"}`];
  if (failed) parts.push(`${failed} failed`);
  return { text: parts.join(" · "), working: false };
}

export function stepLabel(turn: Turn): string {
  const { lookups, current } = summarizeActivity(turn.activity);
  if (current) return `${toolLabel(current)}…`;
  return lookups === 0 ? "Reading the question…" : "Writing the answer…";
}

/** A quote or relative-move source renders as a number card rather than a text card. */
export type MarketFigure = { big: string; tone: "up" | "down" | "flat"; sub: string };

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v: number): MarketFigure["tone"] => (v > 0.005 ? "up" : v < -0.005 ? "down" : "flat");

export function marketFigure(row: TurnSource): MarketFigure | null {
  const d = row.data;
  if (!d) return null;
  if (row.source.id.startsWith("yq-") && typeof d.price === "number") {
    const chg = typeof d.changePct === "number" ? d.changePct : undefined;
    const sub = [chg !== undefined ? pct(chg) : null, typeof d.currency === "string" ? d.currency : null, typeof d.marketState === "string" ? d.marketState.toLowerCase() : null].filter(Boolean).join(" · ");
    return { big: d.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), tone: chg === undefined ? "flat" : tone(chg), sub };
  }
  if (row.source.id.startsWith("yr-") && Array.isArray(d.sessions) && d.sessions.length > 0) {
    const last = d.sessions[d.sessions.length - 1] as Record<string, unknown>;
    if (typeof last.relativePp !== "number") return null;
    const rel = last.relativePp;
    const sub = [
      typeof last.holdingReturnPct === "number" && typeof last.spxReturnPct === "number" ? `${pct(last.holdingReturnPct)} vs ${pct(last.spxReturnPct)}` : null,
      `4 pp rule ${last.qualifies ? "met" : "not met"}`,
      typeof last.date === "string" ? last.date : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return { big: `${rel > 0 ? "+" : ""}${rel.toFixed(2)} pp`, tone: tone(rel), sub };
  }
  return null;
}
