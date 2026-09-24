import "server-only";
import { generateText, type LanguageModel, type StepResult, type ToolSet } from "ai";
import { hasToolCallText, stripToolCallText } from "./tool-call-text";

export { hasToolCallText, stripToolCallText };

/**
 * The reply a job's last step wrote: the text inside `<tag>` when the model used it, else the whole text.
 * Null when there is nothing usable, including a step that is only narration plus a tool call written
 * as text (a model that ignored `toolChoice: "none"`), so the caller can write the answer up instead.
 */
export function finalReply(text: string, tag: string): string | null {
  const tagged = new RegExp(`<${tag}>([\\s\\S]*?)(?:</${tag}>|$)`, "i").exec(text);
  if (tagged) return stripToolCallText(tagged[1]) || null;
  if (hasToolCallText(text)) return null;
  return text.trim() || null;
}

const EVIDENCE_CHARS = 48_000;
/** Reasoning models spend much of this before the first word of the reply. */
export const WRITE_UP_MAX_TOKENS = 10_000;
const MAX_RESULT_CHARS = 6_000;

/**
 * Every tool result from a run as plain text: the call, its source ids (first, so truncation never
 * drops an id the answer should cite), then the data, each result cut to an even share of the budget.
 */
export function evidenceText(steps: Pick<StepResult<ToolSet>, "toolResults">[]): string {
  const results = steps.flatMap((s) => s.toolResults) as unknown as { toolName: string; input?: unknown; output?: { data?: unknown; sources?: { id: string; title?: string }[]; error?: string } }[];
  if (!results.length) return "";
  const share = Math.min(MAX_RESULT_CHARS, Math.floor(EVIDENCE_CHARS / results.length));
  return results
    .map((r, i) => {
      const out = r.output ?? {};
      const sources = Array.isArray(out.sources) ? out.sources.map((s) => `${s.id}${s.title ? ` (${s.title})` : ""}`).join("; ") : "";
      const body = out.error ? `error: ${out.error}` : JSON.stringify(out.data ?? out) ?? "";
      return [`Result ${i + 1}: ${r.toolName} ${JSON.stringify(r.input ?? {})}`, sources ? `sources: ${sources}` : "", body.length > share ? `${body.slice(0, share)}…` : body].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

const WRITE_UP_ROLE = `A research run has finished gathering evidence, and you now write its final reply. You cannot call tools: no tool calls, no "let me check", nothing about what you would look up next. The run's own instructions follow; use them for the reply's audience, format, length and rules, and ignore their research steps.`;

const WRITE_UP_NOW = `Write the final reply now, using only the evidence above. Follow the reply format in your instructions exactly: its tags, plain-text style and word limit. Cite facts with the source ids listed under each result as [src:ID]. Where the evidence does not answer part of the question, say so in a sentence. Do not call tools.`;

type WriteUpInput = {
  instructions: string;
  /** The run's original prompt (the question or the job's input). */
  prompt: string;
  steps: Pick<StepResult<ToolSet>, "toolResults">[];
  /** The closing order; the default asks for the jobs' tagged plain-text reply. */
  order?: string;
};

/**
 * The tool-free request: the evidence as plain text rather than tool-call history (so the model has
 * no call pattern to continue), then the task, then the order to write, last where models heed it most.
 */
export function writeUpRequest(opts: WriteUpInput): { instructions: string; prompt: string } {
  return {
    instructions: `${WRITE_UP_ROLE}\n\n${opts.instructions}`,
    prompt: `EVIDENCE THE RESEARCH GATHERED (tool results, oldest first):\n\n${evidenceText(opts.steps)}\n\n---\n\n${opts.prompt}\n\n${opts.order ?? WRITE_UP_NOW}`,
  };
}

/**
 * One tool-free call that writes the reply from the evidence a run already gathered. Used when the run's
 * last step produced no reply, usually because the model wrote another tool call as text.
 */
export async function writeUpFromEvidence(opts: WriteUpInput & { model: LanguageModel; timeoutMs: number }): Promise<string> {
  const { text } = await generateText({
    model: opts.model,
    ...writeUpRequest(opts),
    maxOutputTokens: WRITE_UP_MAX_TOKENS,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(opts.timeoutMs),
  });
  return text;
}
