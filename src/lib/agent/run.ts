import "server-only";
import { consumeStream, convertToModelMessages, createIdGenerator, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { saveMessages, setRunStatus } from "@/lib/chats";
import { agentModelFor, agentModelId } from "@/lib/agent/model";
import { buildInstructions } from "@/lib/agent/instructions";
import { makeTools } from "@/lib/agent/tools";
import { uncitedFactCount } from "@/lib/agent/citations";
import { compactHistory } from "@/lib/agent/turn";

/** Steps the model may spend on tools; the last step is forced to be a written answer. */
export const MAX_STEPS = 10;
const FINAL_STEP = MAX_STEPS - 1;

/**
 * Run one agent turn. Returns the stream the browser watches and a promise that settles when the
 * server-owned copy of the stream has been consumed and the result saved. The two are independent:
 * cancelling the client stream (navigation, stop) never interrupts generation or persistence.
 */
export async function runAgentTurn(opts: { chat: { id: string; teamId: string; holdingId: string | null }; user: { id: string; fullName: string; role: string }; messages: UIMessage[] }) {
  const { chat, user, messages } = opts;
  const tools = makeTools({ teamId: chat.teamId, userId: user.id });
  const modelId = await agentModelId();
  const instructions = await buildInstructions(chat.teamId, { holdingId: chat.holdingId, userName: user.fullName, userRole: user.role });

  const result = streamText({
    model: agentModelFor(modelId),
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

  const clientStream = toUIMessageStream({ ...streamOptions, stream: result.fullStream });
  return { clientStream, persisted };
}
