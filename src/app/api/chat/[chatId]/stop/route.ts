import { getCurrentUser, canOpenChat } from "@/lib/auth";
import { getChat, requestStop } from "@/lib/chats";

/**
 * Stop: end the chat's running answer. The run checks every couple of seconds, cancels the model call and any lookup in
 * flight, and saves what it had. 409 when nothing is running (it finished first).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { chatId } = await ctx.params;
  const chat = await getChat(chatId);
  if (!chat || !canOpenChat(user, chat)) return new Response("Not found", { status: 404 });
  const stopped = await requestStop(chat.id);
  return stopped ? new Response(null, { status: 204 }) : new Response("Nothing is running.", { status: 409 });
}
