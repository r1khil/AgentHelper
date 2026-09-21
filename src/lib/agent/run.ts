import "server-only";
import { consumeStream, convertToModelMessages, createIdGenerator, createUIMessageStream, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { saveMessages, setRunStatus } from "@/lib/chats";
import { chatModel, agentModelId } from "@/lib/agent/model";
import { buildInstructions } from "@/lib/agent/instructions";
import { makeTools } from "@/lib/agent/tools";
import { collectSources, uncitedFactCount } from "@/lib/agent/citations";
import { compactHistory } from "@/lib/agent/turn";
import { instrumentTools, traceUsage } from "@/lib/agent/trace";
import { createTraceSink } from "@/lib/trace/context";
import type { AgentUIMessage } from "@/lib/trace/events";

/** Steps the model may spend on tools; the last step is forced to be a written answer. */
export const MAX_STEPS = 10;
const FINAL_STEP = MAX_STEPS - 1;

/**
 * Run one agent turn. Returns the stream the browser watches and a promise that settles when the
 * server-owned copy of the stream has been consumed and the result saved. The two are independent:
 * cancelling the client stream (navigation, stop) never interrupts generation or persistence.
 *
 * With `trace`, the client stream also carries transient `data-trace` parts describing every model
 * step and provider call as it happens. They are never persisted and the server branch is unchanged.
 */
export async function runAgentTurn(opts: {
  chat: { id: string; teamId: string; holdingId: string | null };
  user: { id: string; fullName: string; role: string };
  messages: UIMessage[];
  trace?: boolean;
}) {
  const { chat, user, messages } = opts;
  const sink = opts.trace ? createTraceSink() : null;
  const baseTools = makeTools({ teamId: chat.teamId, userId: user.id, sources: [...collectSources(messages).values()] });
  const tools = sink ? instrumentTools(baseTools, sink) : baseTools;
  const modelId = await agentModelId();
  const instructions = "Saved sell-side calls are available through find_call_transcripts and read_call_transcript. Use these for questions about calls and cite their returned sources.\n" + await buildInstructions(chat.teamId, { holdingId: chat.holdingId, userName: user.fullName, userRole: user.role });
  const t0 = Date.now();
  sink?.emit({ t: "run.start", chatId: chat.id, modelId, maxSteps: MAX_STEPS });

  const result = streamText({
    model: chatModel(modelId),
    instructions,
    messages: await convertToModelMessages(compactHistory(messages), { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(MAX_STEPS),
    maxRetries: 2,
    maxOutputTokens: 4000,
    // Guarantee a written answer: the last step gets no tools and a nudge to wrap up.
    prepareStep: ({ stepNumber }) =>
      stepNumber >= FINAL_STEP
        ? { toolChoice: "none", instructions: `${instructions}\n\nYour research budget for this question is used up. Write the final answer now from the evidence you already have, with citations, and list under "Not retrieved" anything you could not get.` }
        : undefined,
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
  const streamOptions = { tools, originalMessages: messages, generateMessageId: () => assistantId };

  const persisted = consumeStream({
    stream: toUIMessageStream({
      ...streamOptions,
      stream: result.fullStream,
      onEnd: async ({ messages: all, responseMessage }) => {
        try {
          if (responseMessage.role === "assistant") {
            responseMessage.metadata = { ...(responseMessage.metadata as object | undefined), uncited: uncitedFactCount(responseMessage), model: modelId };
          }
          await saveMessages(chat.id, all);
          await setRunStatus(chat.id, "idle");
        } catch (e) {
          console.error("[agent] persist failed", e);
          await setRunStatus(chat.id, "error").catch(() => {});
        }
      },
    }),
    onError: async (e) => {
      console.error("[agent] stream failed", e);
      await setRunStatus(chat.id, "error").catch(() => {});
    },
  });

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
