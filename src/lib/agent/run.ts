import "server-only";
import { convertToModelMessages, createIdGenerator, createUIMessageStream, readUIMessageStream, streamText, toUIMessageStream, type LanguageModelUsage, type UIMessage, type UIMessageChunk } from "ai";
import { saveMessages, setRunStatus } from "@/lib/chats";
import { buildAgentDefinition, FINAL_STEP, MAX_STEPS } from "@/lib/agent/definition";
import { collectSources, fixMessageCitationTypos, needsCitationRepair, uncitedFactCount } from "@/lib/agent/citations";
import { applyAnswerText, repairCitations } from "@/lib/agent/repair";
import { compactHistory, isToolPart, splitAssistantParts, toolDone, withoutToolCallText } from "@/lib/agent/turn";
import { sumTraceUsage, traceUsage } from "@/lib/agent/trace";
import { WRITE_UP_MAX_TOKENS, writeUpRequest } from "@/lib/agent/write-up";
import { CHAT_WRITE_UP_ORDER, chatWriteUpPrompt, finishTurnStream, planFinish, UNANSWERED_TEXT, type TurnFinish } from "@/lib/agent/turn-finish";
import { createTraceSink } from "@/lib/trace/context";
import { toolErrorText } from "@/lib/agent/tool-repair";
import type { AgentMetadata, AgentUIMessage } from "@/lib/trace/events";
import { pageContextFromMessages } from "@/lib/agent/page-context";
import { usesPtSheet } from "@/lib/agent/pt-sheet-guard";
import type { CurrentUser } from "@/lib/auth";

export { MAX_STEPS };

export type TurnResult = { messages: UIMessage[]; response: UIMessage };

/** The write-up runs after the research, inside the route's 300 s limit. */
const WRITE_UP_BUDGET_MS = 60_000;

/** A call's usage, or undefined when it failed or never ran. */
const settledUsage = (p: PromiseLike<LanguageModelUsage> | undefined) => (p ? Promise.resolve(p).catch(() => undefined) : undefined);

/**
 * Run one agent turn. Returns the stream the browser watches and a promise that settles when the
 * server-owned copy of the stream has been consumed and the result saved. The two are independent:
 * cancelling the client stream (navigation, stop) never interrupts generation or persistence.
 *
 * The server copy saves the assistant message after every completed tool call, so a student who
 * comes back mid-run sees the research so far; the final save adds metadata and, when too many
 * numeric lines lack a citation, a repaired answer.
 *
 * When the research ends without a usable answer (the model wrote its next tool call as text, or ran
 * out of tokens), both copies drop that step and stream one tool-free write-up from the evidence instead.
 *
 * With `trace`, the client stream also carries transient `data-trace` parts describing every model
 * step and provider call as it happens. They are never persisted and the server branch is unchanged.
 */
export async function runAgentTurn(opts: {
  chat: { id: string; teamId: string | null; holdingId: string | null; fundOnly?: boolean };
  user: { id: string; fullName: string; role: string };
  /** The signed-in member, for tools that apply page access rules (attribution, backtests). */
  viewer?: CurrentUser | null;
  messages: UIMessage[];
  trace?: boolean;
  /** Evaluation runs: nothing is saved to the research log. */
  memoryOff?: boolean;
  /** Runs after the turn is saved and the chat is idle again (memory distillation and the like). */
  onComplete?: (r: TurnResult) => Promise<void> | void;
}) {
  const { chat, user, messages } = opts;
  const sink = opts.trace ? createTraceSink() : null;
  const def = await buildAgentDefinition({
    teamId: chat.teamId,
    holdingId: chat.holdingId,
    user,
    viewer: opts.viewer,
    page: pageContextFromMessages(messages),
    sources: [...collectSources(messages).values()],
    sink,
    purpose: "chat",
    chatId: chat.id,
    sheetInHistory: Boolean(chat.fundOnly) || usesPtSheet(messages),
    memoryOff: opts.memoryOff,
  });
  const t0 = Date.now();
  sink?.emit({ t: "run.start", chatId: chat.id, modelId: def.modelId, maxSteps: MAX_STEPS });

  const result = streamText({
    model: def.model,
    instructions: def.instructions,
    messages: await convertToModelMessages(compactHistory(messages), { tools: def.tools, ignoreIncompleteToolCalls: true }),
    tools: def.tools,
    stopWhen: def.stopWhen,
    prepareStep: def.prepareStep,
    maxRetries: def.maxRetries,
    maxOutputTokens: def.maxOutputTokens,
    repairToolCall: def.repairToolCall,
    onError: ({ error }) => console.error("[agent]", error),
    ...(sink
      ? {
          onStepStart: (e) => {
            sink.setStep(e.stepNumber);
            const tc = e.toolChoice;
            sink.emit({
              t: "step.start",
              modelId: e.modelId,
              provider: e.provider,
              toolChoice: tc === undefined ? "auto" : typeof tc === "string" ? tc : `tool:${tc.toolName}`,
              final: e.stepNumber >= FINAL_STEP,
            });
          },
          onStepEnd: (s) => {
            sink.emit({
              t: "step.end",
              finishReason: s.finishReason,
              rawFinishReason: s.rawFinishReason,
              ms: Math.round(s.performance.stepTimeMs),
              usage: traceUsage(s.usage),
              toolCalls: s.toolCalls.length,
            });
          },
        }
      : {}),
  });

  // Decided once, when the research stops, and shared by both copies of the stream: the write-up is one model call.
  let writeUp: ReturnType<typeof streamText> | undefined;
  let finishing: Promise<TurnFinish> | undefined;
  const finishTurn = () => (finishing ??= planTurnFinish());
  async function planTurnFinish(): Promise<TurnFinish> {
    const steps = await result.steps;
    const plan = planFinish(steps);
    let ending: Promise<void> | undefined;
    // The trace ends after the write-up, so the panel keeps its clock running while it streams.
    const settled = () =>
      (ending ??= (async () => {
        if (!sink) return;
        const [main, extra] = await Promise.all([settledUsage(result.totalUsage), settledUsage(writeUp?.totalUsage)]);
        sink.setStep(null);
        sink.emit({ t: "run.end", ms: Date.now() - t0, steps: steps.length + (writeUp ? 1 : 0), usage: sumTraceUsage(traceUsage(main), traceUsage(extra)) });
      })());
    if (!plan?.writeUp) return { plan, settled };
    sink?.setStep(steps.length);
    const w = streamText({
      model: def.model,
      ...writeUpRequest({ instructions: def.instructions, prompt: chatWriteUpPrompt(messages), steps, order: CHAT_WRITE_UP_ORDER }),
      maxOutputTokens: WRITE_UP_MAX_TOKENS,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(WRITE_UP_BUDGET_MS),
      onError: ({ error }) => console.error("[agent] write-up failed", error),
      ...(sink
        ? {
            onStepStart: (e) => sink.emit({ t: "step.start", modelId: e.modelId, provider: e.provider, toolChoice: "none", final: true, writeUp: plan.reason }),
            onStepEnd: (s) =>
              sink.emit({ t: "step.end", finishReason: s.finishReason, rawFinishReason: s.rawFinishReason, ms: Math.round(s.performance.stepTimeMs), usage: traceUsage(s.usage), toolCalls: 0 }),
          }
        : {}),
    });
    writeUp = w;
    return { plan, settled, writeUp: () => toUIMessageStream({ stream: w.fullStream, sendStart: false }) as ReadableStream<UIMessageChunk> };
  }

  // The assistant message id must match on both branches.
  const assistantId = createIdGenerator({ prefix: "msg", size: 16 })();
  const streamOptions = { tools: def.tools, originalMessages: messages, generateMessageId: () => assistantId, onError: toolErrorText };
  const turnStream = () => finishTurnStream(toUIMessageStream({ ...streamOptions, stream: result.fullStream }) as ReadableStream<UIMessageChunk>, finishTurn);

  const persisted = (async () => {
    try {
      let streamError: unknown;
      let last: UIMessage | undefined;
      let savedTools = 0;
      for await (const snapshot of readUIMessageStream({ stream: turnStream(), onError: (e) => (streamError = e) })) {
        last = snapshot;
        const done = snapshot.parts.filter((p) => isToolPart(p) && toolDone(p)).length;
        if (done > savedTools) {
          savedTools = done;
          await saveMessages(chat.id, [...messages, snapshot]).catch((e) => console.error("[agent] partial save failed", e));
        }
      }
      if (streamError) throw streamError;
      if (!last) throw new Error("the model produced no message");

      // The stream already swapped a failed last step for the write-up; this catches leaked calls anywhere else,
      // and a write-up that itself came back empty.
      let response: UIMessage = { ...last, parts: withoutToolCallText(last.parts) };
      const finished = await finishTurn().catch(() => null);
      const answerText = splitAssistantParts(response.parts).answer.map((p) => p.text).join("\n\n").trim();
      if (!answerText) response = applyAnswerText(response, UNANSWERED_TEXT);
      const unanswered = !answerText || answerText === UNANSWERED_TEXT;
      // Map near-miss ids ("web-1jo7h8" for "web-1jo7h58") to what was retrieved, so they don't render as [?].
      response = fixMessageCitationTypos(response, new Set(collectSources([...messages, response]).keys()));
      const turnSources = [...collectSources([response]).values()];
      const [usage, steps, writeUpUsage] = await Promise.all([result.totalUsage, result.steps, settledUsage(writeUp?.totalUsage)]).catch((e) => {
        console.error("[agent] usage unavailable", e);
        return [undefined, undefined, undefined] as const;
      });
      let repaired = false;
      let repairUsage: AgentMetadata["repairUsage"];
      if (!unanswered && needsCitationRepair(response, turnSources.length)) {
        const fixed = await repairCitations({ model: def.model, message: response, sources: turnSources, onUsage: (u) => (repairUsage = traceUsage(u)) }).catch((e) => {
          console.error("[agent] citation repair failed", e);
          return null;
        });
        if (fixed) {
          response = fixed;
          repaired = true;
        }
      }
      const metadata: AgentMetadata = { ...(response.metadata as AgentMetadata | undefined), uncited: uncitedFactCount(response), model: def.answeredBy() };
      if (repaired) metadata.repaired = true;
      if (usage) metadata.usage = traceUsage(usage);
      if (steps) metadata.steps = steps.length;
      if (repairUsage) metadata.repairUsage = repairUsage;
      if (finished?.plan?.writeUp) metadata.writeUp = finished.plan.reason;
      if (writeUpUsage) metadata.writeUpUsage = traceUsage(writeUpUsage);
      if (unanswered) metadata.unanswered = true;
      metadata.ms = Date.now() - t0;
      response = { ...response, metadata };
      const all = [...messages, response];
      await saveMessages(chat.id, all);
      await setRunStatus(chat.id, "idle");
      try {
        await opts.onComplete?.({ messages: all, response });
      } catch (e) {
        console.error("[agent] onComplete failed", e);
      }
    } catch (e) {
      console.error("[agent] stream failed", e);
      await setRunStatus(chat.id, "error").catch(() => {});
    }
  })();

  const clientStream = sink
    ? createUIMessageStream<AgentUIMessage>({
        execute: ({ writer }) => {
          // Replay what happened before the browser attached (run.start, maybe step.start), then live events.
          for (const e of sink.events()) writer.write({ type: "data-trace", data: e, transient: true });
          const unsubscribe = sink.subscribe((e) => {
            try {
              writer.write({ type: "data-trace", data: e, transient: true });
            } catch {
              // The client stream closed (navigation, stop); generation and persistence continue on the other branch.
              unsubscribe();
            }
          });
          writer.merge(turnStream() as ReadableStream<never>);
        },
        onError: (e) => (e instanceof Error ? e.message : String(e)),
      })
    : turnStream();
  return { clientStream: clientStream as ReadableStream<UIMessageChunk>, persisted };
}
