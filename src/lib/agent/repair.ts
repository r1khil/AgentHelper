import "server-only";
import { generateText, type LanguageModel, type LanguageModelUsage, type UIMessage } from "ai";
import type { Source } from "@/lib/providers/types";
import { splitAssistantParts } from "./turn";

const INSTRUCTIONS = `You are a citation editor for a research answer written by another assistant. You receive the answer and the list of sources that assistant retrieved (id, title, date, excerpt).
Return the answer with these changes only:
1. Where a line states a fact or number without a [src:ID] token and one listed source plainly supports it (matching figure, filing, or headline), append [src:ID] to that line.
2. Where no listed source supports a line's figure, move that line under a final "Not retrieved:" heading, rewritten as the thing that could not be verified, without the figure.
3. Keep every other character as it is: headings, tables, wording, existing tokens. Never add, change, or round a fact or number. Never invent an id; only ids from the list may appear.
Output the revised answer as Markdown and nothing else.`;

/**
 * One extra model call that adds missing citation tokens from the sources this turn actually
 * retrieved, or moves unverifiable lines under "Not retrieved". Returns null when the rewrite is
 * unusable (empty, or far shorter than the original), so the caller keeps the original.
 */
export async function repairCitations(opts: {
  model: LanguageModel;
  message: UIMessage;
  sources: Source[];
  /** Receives the call's token usage, whether or not the rewrite is kept. */
  onUsage?: (usage: LanguageModelUsage) => void;
}): Promise<UIMessage | null> {
  const { answer } = splitAssistantParts(opts.message.parts);
  if (answer.length === 0 || opts.sources.length === 0) return null;
  const text = answer.map((p) => p.text).join("\n\n");
  const list = opts.sources
    .map((s) => `- ${s.id}: ${s.title}${s.publishedAt ? ` (${s.publishedAt.slice(0, 10)})` : ""}${s.excerpt ? ` — ${s.excerpt.replace(/\s+/g, " ").slice(0, 160)}` : ""}`)
    .join("\n");
  const { text: fixed, totalUsage } = await generateText({
    model: opts.model,
    instructions: INSTRUCTIONS,
    prompt: `SOURCES:\n${list}\n\nANSWER:\n${text}`,
    maxOutputTokens: 4000,
    maxRetries: 1,
  });
  opts.onUsage?.(totalUsage);
  const out = fixed.trim();
  if (!out || out.length < text.length * 0.6) return null;
  const known = new Set(opts.sources.map((s) => s.id));
  for (const m of out.matchAll(/\[src:\s*([^\]]+)\]/g)) {
    for (const raw of m[1].split(",")) if (!known.has(raw.replace(/^\s*src:\s*/, "").trim())) return null;
  }
  return applyAnswerText(opts.message, out);
}

/** Replace the answer (text after the last tool call) with `text`, keeping the research activity intact. */
export function applyAnswerText(message: UIMessage, text: string): UIMessage {
  let lastTool = -1;
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const t = message.parts[i].type;
    if (typeof t === "string" && (t.startsWith("tool-") || t === "dynamic-tool")) {
      lastTool = i;
      break;
    }
  }
  const head = message.parts.slice(0, lastTool + 1);
  return { ...message, parts: [...head, { type: "text", text }] as UIMessage["parts"] };
}
