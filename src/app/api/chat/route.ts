import { db } from "@/db/client";
import { sellSideCalls } from "@/db/schema";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { getCurrentUser, canAccessTeam, transparencyEnabled } from "@/lib/auth";
import { effectiveRunStatus, getChat, loadMessages, maybeTitleChat, saveMessages, setRunStatus } from "@/lib/chats";
import { agentConfigured } from "@/lib/agent/model";
import { runAgentTurn } from "@/lib/agent/run";
import { distillTurn } from "@/lib/agent/memory/distill";
import { ensureDriveIndexFresh } from "@/lib/jobs/drive";
import { ensureIngested } from "@/lib/jobs/ingest";

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!agentConfigured()) return new Response("Agent is not configured (OPENROUTER_API_KEY)", { status: 503 });

  const body = (await req.json()) as { chatId?: string; message?: UIMessage };
  if (!body.chatId || !body.message) return new Response("Bad request", { status: 400 });
  const chat = await getChat(body.chatId);
  if (!chat || !canAccessTeam(user, chat.teamId)) return new Response("Not found", { status: 404 });
  if (effectiveRunStatus(chat) === "running") return new Response("This chat is still working on the previous question.", { status: 409 });

  const [call] = await db.select().from(sellSideCalls).where(eq(sellSideCalls.chatId, chat.id)).limit(1);
  if (call && call.status !== "ready") return new Response("Finish call processing before asking follow-up questions.", { status: 409 });
  const prior = await loadMessages(chat.id);
  const incoming: UIMessage = { ...body.message, role: "user" };
  const messages = [...prior.filter((m) => m.id !== incoming.id), incoming];

  // Persist the user turn before streaming so a failed generation never loses it.
  await saveMessages(chat.id, messages);
  await setRunStatus(chat.id, "running");
  const firstText = incoming.parts.find((p) => p.type === "text");
  if (prior.length === 0 && firstText && "text" in firstText) await maybeTitleChat(chat.id, firstText.text);

  await ensureDriveIndexFresh();
  after(() => ensureIngested());
  // Transparency mode (exec/admin preference) streams a live trace of steps and provider calls to this browser only.
  const question = incoming.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
  const { clientStream, persisted } = await runAgentTurn({
    chat,
    user,
    viewer: user,
    messages,
    trace: transparencyEnabled(user),
    // Once saved, distill the turn into the holding's research log (one extra model call; failures are logged, never surfaced).
    onComplete: async ({ response }) => {
      const r = await distillTurn({ chat, question, response });
      if (r) console.log("[memory]", chat.id, JSON.stringify(r));
    },
  });
  // The run finishes and is saved even if the browser leaves; `after` keeps the function alive until then.
  after(persisted);
  return createUIMessageStreamResponse({ stream: clientStream });
}
