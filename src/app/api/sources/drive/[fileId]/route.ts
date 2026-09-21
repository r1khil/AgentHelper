import { callParts, getCall } from "@/lib/sell-side/store";
import { getCurrentUser, canAccessTeam } from "@/lib/auth";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { collectSources } from "@/lib/agent/citations";
import { documentId, externalUrl } from "@/lib/agent/source-resolution";
import { getFileMeta, getFileText } from "@/lib/drive/index";

/** The document must have been retrieved in a chat the signed-in user can access. */
export async function GET(req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to view sources." }, { status: 401, headers });
  const { fileId } = await ctx.params;
  const chatId = new URL(req.url).searchParams.get("chatId");
  if (!chatId || !/^[\da-f-]{36}$/i.test(chatId)) return Response.json({ error: "Source unavailable." }, { status: 404, headers });
  try {
    const chat = await getChat(chatId);
    if (!chat || !canAccessTeam(user, chat.teamId)) return Response.json({ error: "Source unavailable." }, { status: 404, headers });
    const sources = collectSources(await loadMessages(chat.id));
    if (![...sources.values()].some((s) => documentId(s) === fileId)) {
      // Tool results stream to the browser before the server saves the finished turn.
      if (effectiveRunStatus(chat) === "running") return Response.json({ pending: true }, { status: 202, headers });
      return Response.json({ error: "Source unavailable." }, { status: 404, headers });
    }
    if (/^call-[0-9a-f-]{36}$/i.test(fileId)) {
      const call = await getCall(fileId.slice(5));
      if (!call || call.teamId !== chat.teamId) return Response.json({ error: "Source unavailable." }, { status: 404, headers });
      const parts = await callParts(call.id);
      return Response.json({ title: call.title, text: parts.map(p => p.text ?? "[Part not yet transcribed]").join("\n\n"), url: null }, { headers });
    }
    const meta = await getFileMeta(fileId);
    if (!meta || meta.isFolder) return Response.json({ error: "Source unavailable." }, { status: 404, headers });
    const url = externalUrl(meta.webViewLink) ?? `https://drive.google.com/file/d/${encodeURIComponent(meta.id)}/view`;
    // A failed extraction still opens the exact document's metadata and original link.
    const result = await getFileText(fileId).catch(() => null);
    return Response.json({ title: meta.name, text: result?.text ?? null, url }, { headers });
  } catch {
    return Response.json({ error: "Source temporarily unavailable." }, { status: 503, headers });
  }
}
