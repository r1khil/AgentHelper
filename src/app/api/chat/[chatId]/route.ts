import { getCurrentUser, canAccessTeam } from "@/lib/auth";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";

/** Current state of a chat, used by the page to catch up on a run that continued after the analyst navigated away. */
export async function GET(_req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { chatId } = await ctx.params;
  const chat = await getChat(chatId);
  if (!chat || !canAccessTeam(user, chat.teamId)) return new Response("Not found", { status: 404 });
  const messages = await loadMessages(chat.id);
  return Response.json({ runStatus: effectiveRunStatus(chat), messages }, { headers: { "Cache-Control": "no-store" } });
}
