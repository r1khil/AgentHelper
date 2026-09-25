import "server-only";
import { generateText, type UIMessage } from "ai";
import type { Source } from "@/lib/providers/types";
import { collectSources } from "@/lib/agent/citations";
import { splitAssistantParts } from "@/lib/agent/turn";
import { agentModelWithFallback } from "@/lib/agent/definition";
import { repairJson } from "@/lib/agent/json-repair";
import { MARKET_FACT_TTL_DAYS, rememberMemory } from "./store";
import type { AgentMetadata } from "@/lib/trace/events";

export type Distilled = {
  summary: string;
  facts: { text: string; sourceIds: string[]; durable: boolean }[];
  lessons: string[];
  nextQuestions: string[];
};

const INSTRUCTIONS = `You distill one answered research question into durable notes for a student investment fund's research agent. Respond with one JSON object only (no code fences, no text around it), shape:
{"summary": "", "facts": [{"text": "", "sourceIds": [], "durable": false}], "lessons": [""], "nextQuestions": [""]}
Rules:
- summary: one or two sentences, at most 50 words: what was asked and what the evidence showed. Plain, past tense, no advice.
- facts: up to six company or market facts the answer established, each under 35 words, with the source ids (from the SOURCES list only) that support it. Numbers keep their unit and period. durable is true for structural facts that rarely change (fiscal year end, XBRL concept names, segment names, reporting conventions, where guidance is disclosed) and false for period figures, prices, guidance, and news.
- lessons: up to three one-line notes that would help the agent use its tools better next time (e.g. "AXP: revenue is RevenuesNetOfInterestExpense in XBRL", "the 8-K EX-99.1 has the segment table", "no Drive earnings update existed for Q2 2026"). Skip when there is nothing new.
- nextQuestions: up to three one-line evidence-gathering questions a student analyst might ask next about this company. Questions only; no recommendations.
- Never record the student's interpretation, opinion, thesis or conclusion, anything the assistant declined to do, or anything without a source id in the list. Empty arrays are fine.`;

/**
 * The distiller's JSON object, from inside code fences or prose. Output cut off by the token limit is
 * repaired, and the value being written at the cut (the last key's final item, or the whole last
 * string) is dropped so a half-written fact never reaches memory.
 */
function readDistillation(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  if (start < 0) return null;
  const end = text.lastIndexOf("}");
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (end > start) {
    const whole = text.slice(start, end + 1);
    for (const c of [whole, whole.replace(/,(\s*[}\]])/g, "$1")]) {
      try {
        const j: unknown = JSON.parse(c);
        if (isObject(j)) return j;
      } catch {
        /* truncated or malformed; try the repair below */
      }
    }
  }
  let j: unknown;
  try {
    j = JSON.parse(repairJson(text.slice(start)));
  } catch {
    return null;
  }
  if (!isObject(j)) return null;
  const last = Object.keys(j).at(-1);
  if (last !== undefined) {
    if (Array.isArray(j[last])) j[last] = (j[last] as unknown[]).slice(0, -1);
    else delete j[last];
  }
  return j;
}

/** Parse the distiller's JSON leniently; null when unusable. */
export function parseDistilled(raw: string): Distilled | null {
  const j = readDistillation(raw);
  if (!j) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
  const facts = Array.isArray(j.facts)
    ? (j.facts as unknown[])
        .map((f) => {
          if (!f || typeof f !== "object") return null;
          const o = f as Record<string, unknown>;
          // The answer's inline [src:id] markers sometimes get copied in; the ids live in sourceIds.
          const text = str(typeof o.text === "string" ? o.text.replace(/\s*\[src:[^\]]*\]/g, "") : "", 400);
          if (!text) return null;
          return { text, sourceIds: strs(o.sourceIds, 6, 80), durable: o.durable === true };
        })
        .filter((f): f is Distilled["facts"][number] => !!f)
        .slice(0, 6)
    : [];
  const summary = str(j.summary, 500);
  if (!summary && facts.length === 0) return null;
  return { summary, facts, lessons: strs(j.lessons, 3, 300), nextQuestions: strs(j.nextQuestions, 3, 200) };
}

/** Only answers with real evidence are worth a distillation call; refusals, chit-chat and the no-answer notice are not. */
export function shouldDistill(response: UIMessage, sourceCount: number) {
  if (sourceCount === 0 || (response.metadata as AgentMetadata | undefined)?.unanswered) return false;
  const { answer } = splitAssistantParts(response.parts);
  return answer.map((p) => p.text).join("").trim().length >= 80;
}

export function newestEvidenceDate(sources: Source[]): Date | null {
  let best: Date | null = null;
  for (const s of sources) {
    if (!s.publishedAt) continue;
    const d = new Date(s.publishedAt);
    if (Number.isNaN(d.getTime())) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

export type DistillResult = { log: string | null; facts: number; merged: number; lessons: number };

/**
 * After a turn is saved: one model call turns the question, answer and sources into a research-log
 * entry, cited facts (deduplicated against earlier ones) and tool lessons for the holding.
 */
export async function distillTurn(p: { chat: { id: string; teamId: string; holdingId: string | null }; question: string; response: UIMessage }): Promise<DistillResult | null> {
  const sources = collectSources([p.response]);
  if (!shouldDistill(p.response, sources.size)) return null;
  const { answer } = splitAssistantParts(p.response.parts);
  const answerText = answer.map((x) => x.text).join("\n\n").slice(0, 12_000);
  const list = [...sources.values()].map((s) => `- ${s.id}: ${s.title}${s.publishedAt ? ` (${s.publishedAt.slice(0, 10)})` : ""}`).join("\n");
  const { model, modelId } = await agentModelWithFallback();
  // Reasoning models (Ling) spend output tokens thinking before the JSON; keep that low and leave room for both.
  const { text, finishReason, usage } = await generateText({
    model,
    instructions: INSTRUCTIONS,
    prompt: `QUESTION:\n${p.question.slice(0, 2000)}\n\nANSWER:\n${answerText}\n\nSOURCES:\n${list}`,
    providerOptions: { openrouter: { reasoning: { effort: "low" } } },
    maxOutputTokens: 4000,
    maxRetries: 1,
  });
  const d = parseDistilled(text);
  const tokens = `${usage.outputTokens ?? "?"} output tokens, ${usage.outputTokenDetails?.reasoningTokens ?? "?"} reasoning`;
  if (!d) {
    console.error(`[memory] distillation was not parseable (finish ${finishReason}, ${tokens}):`, text.replace(/\s+/g, " ").slice(0, 400));
    return null;
  }
  if (finishReason === "length") console.warn(`[memory] distillation hit the output limit (${tokens}); kept the complete part`);

  const scope = p.chat.holdingId ? "holding" : "team";
  const base = { scope, teamId: p.chat.teamId, holdingId: p.chat.holdingId, sourceChatId: p.chat.id, model: modelId } as const;
  const now = Date.now();
  const result: DistillResult = { log: null, facts: 0, merged: 0, lessons: 0 };
  if (d.summary) {
    const { id } = await rememberMemory({ ...base, kind: "log", body: d.summary, meta: { question: p.question.slice(0, 300), nextQuestions: d.nextQuestions, chatId: p.chat.id } });
    result.log = id;
  }
  for (const f of d.facts) {
    const cited = f.sourceIds.map((id) => sources.get(id)).filter((s): s is Source => !!s);
    if (cited.length === 0) continue;
    const r = await rememberMemory({ ...base, kind: "fact", body: f.text, sources: cited, evidenceAt: newestEvidenceDate(cited) ?? new Date(now), expiresAt: f.durable ? null : new Date(now + MARKET_FACT_TTL_DAYS * 86_400_000) });
    if (r.merged) result.merged++;
    else result.facts++;
  }
  for (const l of d.lessons) {
    await rememberMemory({ ...base, kind: "lesson", body: l });
    result.lessons++;
  }
  return result;
}
