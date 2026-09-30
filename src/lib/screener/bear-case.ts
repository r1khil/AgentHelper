import "server-only";
import { generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bearCases, type BearCase, type BearPoint, type ChecklistItem } from "@/db/schema";
import { agentModelWithFallback } from "@/lib/agent/definition";
import { CITED_RULES, INPUT_CHAR_BUDGET, citationsFor, parseAnswer, sentences, verifySentences, type CiteSource } from "./cited";
import type { FilingChangeView } from "./filing-changes/store";

const INSTRUCTIONS = `You are the red team on a value fund's buy. Argue against it: find the three strongest reasons the pitch is wrong. Do not balance, do not list positives, do not recommend.

You get the value-trap checklist (computed from SEC data), the filing changes flagged on the company, and the pitch.

Write JSON: {"points": [{"title": "short claim", "body": [{"text": "...", "cites": [n], "quote": "optional exact words"}]}]}
- Exactly three points, strongest first. Each body is two or three sentences.
- Cite the checklist line, filing change or pitch passage each sentence rests on.

${CITED_RULES}`;

/** Most recent filing changes kept first when the input is too long. */
const MAX_FLAGS = 5;

/**
 * The model's input: the checklist (never cut), then filing changes (cut to the five most recent first), then the pitch
 * (cut from the end, so its opening thesis stays). Each is a numbered source it can cite.
 */
export function bearSources(p: { ticker: string; checklist: ChecklistItem[]; changes: FilingChangeView[]; pitch: string }, budget = INPUT_CHAR_BUDGET): CiteSource[] {
  const checklistText = p.checklist.map((c) => `${c.label}: ${c.status.replace("_", " ")}. ${c.detail}`).join("\n");
  const sources: CiteSource[] = [{ n: 1, label: "Value-trap checklist (from SEC data)", url: `/screener/${encodeURIComponent(p.ticker)}?tab=bear`, text: checklistText }];
  let left = budget - checklistText.length;
  const changes = p.changes.length * 600 + p.pitch.length > left ? p.changes.slice(0, MAX_FLAGS) : p.changes;
  for (const c of changes) {
    const text = `${c.labelText}, ${c.form} ${c.item} filed ${c.filedAt}. ${c.summary ?? ""}${c.quote ? `\n"${c.quote}"` : ""}`;
    sources.push({ n: sources.length + 1, label: `${c.form} ${c.item}: ${c.labelText}`, url: c.filingUrl, text });
    left -= text.length;
  }
  if (p.pitch.trim()) sources.push({ n: sources.length + 1, label: "The pitch", url: `/screener/${encodeURIComponent(p.ticker)}?tab=bear`, text: p.pitch.trim().slice(0, Math.max(1000, left)) });
  return sources;
}

/** Reads and checks the memo: three points, each with cited sentences whose quotes are found. */
export function checkMemo(raw: string, sources: CiteSource[]): { memo: BearPoint[]; held: string | null } {
  const json = parseAnswer(raw);
  const points = (Array.isArray(json?.points) ? json.points : []).flatMap((x): BearPoint[] => {
    const o = (x ?? {}) as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const body = sentences(o.body);
    return title && body.length ? [{ title, body }] : [];
  });
  if (!json) return { memo: [], held: "The model's answer wasn't readable." };
  if (points.length < 3) return { memo: points, held: "Fewer than three bear points came back." };
  const memo = points.slice(0, 3);
  return { memo, held: verifySentences(memo.flatMap((p) => p.body), sources) };
}

/** Runs the bear case for a company: the checklist from code, then one model call for the memo. Stored held when it fails a check. */
export async function runBearCase(p: {
  ticker: string;
  teamId: string | null;
  pitchId?: string | null;
  pitch: string;
  checklist: ChecklistItem[];
  changes: FilingChangeView[];
  createdBy: string;
  generate?: (prompt: string) => Promise<{ text: string; model: string }>;
}): Promise<BearCase> {
  const sources = bearSources(p);
  const prompt = `COMPANY: ${p.ticker}\n\nSOURCES:\n${sources.map((s) => `[${s.n}] ${s.label}\n${s.text}`).join("\n\n")}`;
  let memo: BearPoint[] = [];
  let held: string | null;
  let model: string | null = null;
  try {
    const out = await (p.generate ?? defaultGenerate)(prompt);
    model = out.model;
    ({ memo, held } = checkMemo(out.text, sources));
  } catch (e) {
    held = `Hoot couldn't write it: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
  }
  const [row] = await db
    .insert(bearCases)
    .values({
      ticker: p.ticker,
      teamId: p.teamId,
      pitchId: p.pitchId ?? null,
      pitch: p.pitch,
      checklist: p.checklist,
      memo,
      citations: citationsFor(memo.flatMap((x) => x.body), sources),
      status: held ? "held" : "ready",
      heldReason: held,
      model,
      createdBy: p.createdBy,
    })
    .returning();
  return row;
}

async function defaultGenerate(prompt: string) {
  const { model, modelId } = await agentModelWithFallback();
  const { text } = await generateText({ model, instructions: INSTRUCTIONS, prompt, reasoning: "low", maxOutputTokens: 4000, maxRetries: 1 });
  return { text, model: modelId };
}

export async function latestBearCase(ticker: string): Promise<BearCase | null> {
  const [row] = await db.select().from(bearCases).where(eq(bearCases.ticker, ticker)).orderBy(desc(bearCases.createdAt)).limit(1);
  return row ?? null;
}

/** Saves the team's written answer to one bear point. */
export async function answerBearPoint(id: string, index: number, response: string, by: string): Promise<boolean> {
  const [row] = await db.select().from(bearCases).where(eq(bearCases.id, id));
  if (!row || !row.memo[index]) return false;
  const memo = row.memo.map((p, i) => (i === index ? { ...p, response: response.trim() || undefined, respondedBy: by, respondedAt: new Date().toISOString() } : p));
  await db.update(bearCases).set({ memo }).where(eq(bearCases.id, id));
  return true;
}
