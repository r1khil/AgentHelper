import { callParts, getCall } from "@/lib/sell-side/store";
import { getCurrentUser, canAccessTeam } from "@/lib/auth";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { collectSources } from "@/lib/agent/citations";
import { documentId as sourceDocumentId, externalUrl } from "@/lib/agent/source-resolution";
import { getDocument } from "@/lib/documents/index";
import { getFileText } from "@/lib/drive/index";

/** The document must have been retrieved in a chat the signed-in user can access. */
export async function GET(req: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to view sources." }, { status: 401, headers });
  const { documentId } = await ctx.params;
  const chatId = new URL(req.url).searchParams.get("chatId");
  if (!chatId || !/^[\da-f-]{36}$/i.test(chatId)) return Response.json({ error: "Source unavailable." }, { status: 404, headers });
  try {
    const chat = await getChat(chatId);
    if (!chat || !canAccessTeam(user, chat.teamId)) return Response.json({ error: "Source unavailable." }, { status: 404, headers });
    const sources = collectSources(await loadMessages(chat.id));
    if (![...sources.values()].some((s) => sourceDocumentId(s) === documentId)) {
      // Tool results stream to the browser before the server saves the finished turn.
      if (effectiveRunStatus(chat) === "running") return Response.json({ pending: true }, { status: 202, headers });
      return Response.json({ error: "Source unavailable." }, { status: 404, headers });
    }
    if (/^call-[0-9a-f-]{36}$/i.test(documentId)) {
      const call = await getCall(documentId.slice(5));
      if (!call || call.teamId !== chat.teamId) return Response.json({ error: "Source unavailable." }, { status: 404, headers });
      const parts = await callParts(call.id);
      return Response.json({ title: call.title, text: parts.map((p) => p.text ?? "[Part not yet transcribed]").join("\n\n"), url: null }, { headers });
    }
    const doc = await getDocument(documentId);
    if (!doc) return Response.json({ error: "Source unavailable." }, { status: 404, headers });
    if (doc.kind === "drive") {
      const url = externalUrl(doc.url) ?? `https://drive.google.com/file/d/${encodeURIComponent(doc.id)}/view`;
      // A failed extraction still opens the exact document's metadata and original link.
      const result = await getFileText(doc.id).catch(() => null);
      return Response.json({ title: doc.title, text: result?.text ?? null, url }, { headers });
    }
    return Response.json({ title: doc.title, text: doc.textFor === doc.version ? doc.text : null, url: externalUrl(doc.url) }, { headers });
  } catch {
    return Response.json({ error: "Source temporarily unavailable." }, { status: 503, headers });
  }
}
