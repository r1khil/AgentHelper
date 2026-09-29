import { getCurrentUser, canOpenChat } from "@/lib/auth";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { chatNextQuestions } from "@/lib/agent/memory/store";

/**
 * Current state of a chat, used by the page to catch up on a run that continued after the analyst navigated away.
 * `?related=1` adds the next questions Hoot noted after his latest answer (the answer panel's "Ask next").
 */
export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { chatId } = await ctx.params;
  const chat = await getChat(chatId);
  if (!chat || !canOpenChat(user, chat)) return new Response("Not found", { status: 404 });
  const wantsRelated = new URL(req.url).searchParams.has("related");
  const [messages, related] = await Promise.all([loadMessages(chat.id), wantsRelated ? chatNextQuestions(chat.id).catch(() => []) : Promise.resolve(undefined)]);
  return Response.json({ runStatus: effectiveRunStatus(chat), messages, ...(related ? { related } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
