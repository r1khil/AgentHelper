import "server-only";
import { convertToModelMessages, createIdGenerator, createUIMessageStream, readUIMessageStream, streamText, toUIMessageStream, type UIMessage } from "ai";
import { saveMessages, setRunStatus } from "@/lib/chats";
import { buildAgentDefinition, FINAL_STEP, MAX_STEPS } from "@/lib/agent/definition";
import { collectSources, needsCitationRepair, uncitedFactCount } from "@/lib/agent/citations";
import { repairCitations } from "@/lib/agent/repair";
import { compactHistory, isToolPart, toolDone } from "@/lib/agent/turn";
import { traceUsage } from "@/lib/agent/trace";
import { createTraceSink } from "@/lib/trace/context";
import type { AgentMetadata, AgentUIMessage } from "@/lib/trace/events";

export { MAX_STEPS };

export type TurnResult = { messages: UIMessage[]; response: UIMessage };

/**
 * Run one agent turn. Returns the stream the browser watches and a promise that settles when the
 * server-owned copy of the stream has been consumed and the result saved. The two are independent:
 * cancelling the client stream (navigation, stop) never interrupts generation or persistence.
 *
 * The server copy saves the assistant message after every completed tool call, so a student who
 * comes back mid-run sees the research so far; the final save adds metadata and, when too many
 * numeric lines lack a citation, a repaired answer.
 *
 * With `trace`, the client stream also carries transient `data-trace` parts describing every model
 * step and provider call as it happens. They are never persisted and the server branch is unchanged.
 */
export async function runAgentTurn(opts: {
  chat: { id: string; teamId: string; holdingId: string | null };
  user: { id: string; fullName: string; role: string };
  messages: UIMessage[];
  trace?: boolean;
  /** Runs after the turn is saved and the chat is idle again (memory distillation and the like). */
  onComplete?: (r: TurnResult) => Promise<void> | void;
}) {
  const { chat, user, messages } = opts;
  const sink = opts.trace ? createTraceSink() : null;
  const def = await buildAgentDefinition({ teamId: chat.teamId, holdingId: chat.holdingId, user, sources: [...collectSources(messages).values()], sink, purpose: "chat" });
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
          onEnd: (e) => {
            sink.setStep(null);
            sink.emit({ t: "run.end", ms: Date.now() - t0, steps: e.steps.length, usage: traceUsage(e.totalUsage) });
          },
        }
      : {}),
  });

  // The assistant message id must match on both branches.
  const assistantId = createIdGenerator({ prefix: "msg", size: 16 })();
  const streamOptions = { tools: def.tools, originalMessages: messages, generateMessageId: () => assistantId };

  const persisted = (async () => {
    try {
      let streamError: unknown;
      let last: UIMessage | undefined;
      let savedTools = 0;
      const ui = toUIMessageStream({ ...streamOptions, stream: result.fullStream });
      for await (const snapshot of readUIMessageStream({ stream: ui, onError: (e) => (streamError = e) })) {
        last = snapshot;
        const done = snapshot.parts.filter((p) => isToolPart(p) && toolDone(p)).length;
        if (done > savedTools) {
          savedTools = done;
          await saveMessages(chat.id, [...messages, snapshot]).catch((e) => console.error("[agent] partial save failed", e));
        }
      }
      if (streamError) throw streamError;
      if (!last) throw new Error("the model produced no message");

      let response: UIMessage = last;
      const turnSources = [...collectSources([response]).values()];
      let repaired = false;
      if (needsCitationRepair(response, turnSources.length)) {
        const fixed = await repairCitations({ model: def.model, message: response, sources: turnSources }).catch((e) => {
          console.error("[agent] citation repair failed", e);
          return null;
        });
        if (fixed) {
          response = fixed;
          repaired = true;
        }
      }
      const metadata: AgentMetadata = { ...(response.metadata as AgentMetadata | undefined), uncited: uncitedFactCount(response), model: def.modelId };
      if (repaired) metadata.repaired = true;
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
          writer.merge(toUIMessageStream({ ...streamOptions, stream: result.fullStream }) as ReadableStream<never>);
        },
        onError: (e) => (e instanceof Error ? e.message : String(e)),
      })
    : toUIMessageStream({ ...streamOptions, stream: result.fullStream });
  return { clientStream: clientStream as ReadableStream<UIMessageChunkAny>, persisted };
}

type UIMessageChunkAny = ReturnType<typeof toUIMessageStream> extends ReadableStream<infer C> ? C : never;
