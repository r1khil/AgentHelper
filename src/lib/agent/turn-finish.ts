import type { FinishReason, StepResult, ToolSet, UIMessage, UIMessageChunk } from "ai";
import { hasToolCallText, stripToolCallText } from "./tool-call-text";
import { splitAssistantParts } from "./turn";

/** Why a chat turn's last step left no usable answer. */
export type WriteUpReason = "length" | "tool-call-text" | "empty";

type LastStep = Pick<StepResult<ToolSet>, "text" | "finishReason" | "toolCalls">;

/**
 * Null when the run's last step wrote an answer. Otherwise why not: the run stopped on a lookup, the model
 * wrote its next tool call as text (Ling ignores `toolChoice: "none"`), it wrote nothing, or it spent the
 * token cap (reasoning counts towards it) and stopped mid-answer.
 */
export function writeUpReason(last: LastStep): WriteUpReason | null {
  if (last.toolCalls.length > 0) return "empty";
  if (last.finishReason === "length") return "length";
  if (hasToolCallText(last.text)) return "tool-call-text";
  return last.text.trim() ? null : "empty";
}

export const UNANSWERED_TEXT = "I ran out of research steps before I could write the answer. The lookups above show what I found; ask again, perhaps with a narrower question.";

export type FinishPlan = {
  reason: WriteUpReason;
  /** Clear the failed last step's parts (its narration, leaked calls or cut-off text) before the replacement. */
  reset: boolean;
  /** Write the answer up from this turn's tool results. */
  writeUp: boolean;
  /** Shown when there is no write-up, or it fails or writes nothing. */
  fallback: string | null;
};

/** What to do after the research loop; null when the last step's answer stands. */
export function planFinish(steps: (LastStep & Pick<StepResult<ToolSet>, "toolResults">)[]): FinishPlan | null {
  const last = steps.at(-1);
  const reason = last ? writeUpReason(last) : null;
  if (!last || !reason) return null;
  // A step that made real calls keeps them on screen; only a tool-free step is cleared.
  const reset = last.toolCalls.length === 0;
  // An answer cut off by the token cap still beats the notice if nothing better comes.
  const partial = reason === "length" ? stripToolCallText(last.text) : "";
  if (steps.some((s) => s.toolResults.length > 0)) return { reason, reset, writeUp: true, fallback: partial || UNANSWERED_TEXT };
  if (partial) return null;
  return { reason, reset, writeUp: false, fallback: UNANSWERED_TEXT };
}

export const CHAT_WRITE_UP_ORDER = `Write the final answer now from the evidence above, in the ANSWER FORMAT from your instructions. Cite each fact with a source id listed under a result, as [src:ID], and list under "Not retrieved:" anything the evidence does not cover. Do not call tools and do not describe further research.`;

const HISTORY_MESSAGES = 4;
const HISTORY_ANSWER_CHARS = 1_500;

const userText = (m: UIMessage) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();

/** The member's question for the write-up, after the last few exchanges so a follow-up still makes sense. */
export function chatWriteUpPrompt(messages: UIMessage[]): string {
  let lastUser = messages.length - 1;
  while (lastUser >= 0 && messages[lastUser].role !== "user") lastUser--;
  const question = lastUser >= 0 ? userText(messages[lastUser]) : "";
  const earlier = messages
    .slice(Math.max(0, lastUser - HISTORY_MESSAGES), Math.max(0, lastUser))
    .map((m) => {
      if (m.role === "user") return `Member: ${userText(m)}`;
      const answer = splitAssistantParts(m.parts)
        .answer.map((p) => p.text)
        .join("\n\n");
      return answer ? `Hoot: ${answer.length > HISTORY_ANSWER_CHARS ? `${answer.slice(0, HISTORY_ANSWER_CHARS)}…` : answer}` : "";
    })
    .filter(Boolean);
  return `${earlier.length ? `Earlier in this conversation:\n\n${earlier.join("\n\n")}\n\n` : ""}The member's question:\n\n${question.slice(0, 6000)}`;
}

/** How a turn ends once the research loop has stopped. Shared by the browser's and the server's copy of the stream. */
export type TurnFinish = {
  plan: FinishPlan | null;
  /** A fresh copy of the write-up's UI chunks for each caller (start and finish omitted or ignored). */
  writeUp?: () => ReadableStream<UIMessageChunk>;
  /** Runs once the replacement has streamed, before the final `finish` chunk (closes the trace). */
  settled?: () => Promise<void>;
};

/** Write-up chunks that belong in the message; lifecycle and error chunks are handled here instead. */
const WRITE_UP_PARTS = new Set(["text-start", "text-delta", "text-end", "reasoning-start", "reasoning-delta", "reasoning-end", "start-step", "finish-step"]);

async function* chunksOf<T>(stream: ReadableStream<T>) {
  const reader = stream.getReader();
  let done = false;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) {
        done = true;
        return;
      }
      yield r.value;
    }
  } finally {
    if (!done) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function* textChunks(id: string, text: string): Generator<UIMessageChunk> {
  yield { type: "text-start", id };
  yield { type: "text-delta", id, delta: text };
  yield { type: "text-end", id };
}

/**
 * The research stream with its `finish` chunk held back, then whatever the finish plan adds: a `reset-step`
 * that removes the failed last step from the message in the browser and on the server alike, the write-up
 * streamed in its place, and the fallback text if the write-up fails or writes nothing.
 */
export async function* finishTurnChunks(main: ReadableStream<UIMessageChunk>, finish: () => Promise<TurnFinish>): AsyncGenerator<UIMessageChunk> {
  let finishReason: FinishReason | undefined;
  for await (const c of chunksOf(main)) {
    if (c.type === "finish") finishReason = c.finishReason;
    else yield c;
  }
  let f: TurnFinish;
  try {
    f = await finish();
  } catch (e) {
    console.error("[agent] could not finish the turn", e);
    yield { type: "finish", ...(finishReason ? { finishReason } : {}) };
    return;
  }
  const { plan } = f;
  if (plan?.reset) yield { type: "reset-step" };
  let wrote = false;
  if (plan && f.writeUp) {
    let forwarded = false;
    let failed = false;
    for await (const c of chunksOf(f.writeUp())) {
      if (c.type === "error" || c.type === "abort") {
        failed = true;
        break;
      }
      if (c.type === "finish" && c.finishReason) finishReason = c.finishReason;
      // After a reset the write-up takes over the cleared step rather than starting another.
      if (!WRITE_UP_PARTS.has(c.type) || (plan.reset && c.type === "start-step")) continue;
      if (c.type === "text-delta" && c.delta.trim()) wrote = true;
      forwarded = true;
      yield c;
    }
    // A write-up that broke off mid-answer is removed rather than left half-written.
    if (failed && forwarded) {
      yield { type: "reset-step" };
      wrote = false;
    }
  }
  if (plan?.fallback && !wrote) yield* textChunks("turn-fallback", plan.fallback);
  await f.settled?.().catch((e) => console.error("[agent] finish bookkeeping failed", e));
  yield { type: "finish", ...(finishReason ? { finishReason } : {}) };
}

/** `finishTurnChunks` as a stream; cancelling it (the browser leaving) stops only this copy. */
export function finishTurnStream(main: ReadableStream<UIMessageChunk>, finish: () => Promise<TurnFinish>): ReadableStream<UIMessageChunk> {
  const it = finishTurnChunks(main, finish);
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      const r = await it.next();
      if (r.done) controller.close();
      else controller.enqueue(r.value);
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}
