import { convertToModelMessages, createIdGenerator, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { getCurrentUser, canAccessTeam } from "@/lib/auth";
import { getChat, loadMessages, maybeTitleChat, saveMessages } from "@/lib/chats";
import { agentConfigured, agentModel } from "@/lib/agent/model";
import { buildInstructions } from "@/lib/agent/instructions";
import { makeTools } from "@/lib/agent/tools";
import { uncitedFactCount } from "@/lib/agent/citations";

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!agentConfigured()) return new Response("Agent is not configured (OPENROUTER_API_KEY)", { status: 503 });

  const body = (await req.json()) as { chatId?: string; message?: UIMessage };
  if (!body.chatId || !body.message) return new Response("Bad request", { status: 400 });
  const chat = await getChat(body.chatId);
  if (!chat || !canAccessTeam(user, chat.teamId)) return new Response("Not found", { status: 404 });

  const prior = await loadMessages(chat.id);
  const incoming: UIMessage = { ...body.message, role: "user" };
  const messages = [...prior.filter((m) => m.id !== incoming.id), incoming];

  // Persist the user turn before streaming so a failed generation never loses it.
  await saveMessages(chat.id, messages);
  const firstText = incoming.parts.find((p) => p.type === "text");
  if (prior.length === 0 && firstText && "text" in firstText) await maybeTitleChat(chat.id, firstText.text);

  const tools = makeTools({ teamId: chat.teamId, userId: user.id });
  const instructions = await buildInstructions(chat.teamId, { holdingId: chat.holdingId, userName: user.fullName, userRole: user.role });

  const result = streamText({
    model: agentModel(),
    instructions,
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(8),
    onError: ({ error }) => console.error("[agent]", error),
  });

  const stream = toUIMessageStream({
    stream: result.fullStream,
    tools,
    originalMessages: messages,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    onEnd: async ({ messages: all }) => {
      const last = all[all.length - 1];
      if (last?.role === "assistant") {
        const uncited = uncitedFactCount(last);
        last.metadata = { ...(last.metadata as object | undefined), uncited, model: process.env.OPENROUTER_MODEL };
      }
      await saveMessages(chat.id, all);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
