// End-to-end check of one agent turn with the real model, simulating a browser that disconnects
// after the first chunks: the run must still finish, be saved, and clear run_status.
// Usage: npm run smoke:agent -- "Summarize the last 10-Q for AXP…" [--keep]
// (tsx needs the react-server condition because the agent modules import "server-only".)
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/db/client";
import { chatMessages, chats, holdings, teams } from "@/db/schema";
import { runAgentTurn } from "@/lib/agent/run";
import { loadMessages, saveMessages, setRunStatus } from "@/lib/chats";
import { splitAssistantParts, summarizeActivity } from "@/lib/agent/turn";

async function main() {
  const question = process.argv[2] ?? "Summarize the last 10-Q for AXP: revenue, margins, and guidance, with sources.";
  const [team] = await db.select().from(teams).where(eq(teams.slug, "fig")).limit(1).catch(() => []);
  const [anyTeam] = team ? [team] : await db.select().from(teams).limit(1);
  const [axp] = await db.select().from(holdings).where(eq(holdings.ticker, "AXP")).limit(1);
  const [chat] = await db.insert(chats).values({ teamId: axp?.teamId ?? anyTeam.id, holdingId: axp?.id ?? null, title: "smoke: " + question.slice(0, 40) }).returning();
  console.log("chat", chat.id, "team", axp?.teamId ?? anyTeam.id, "pinned", axp?.ticker ?? "none");

  const user: UIMessage = { id: "msg-user-1", role: "user", parts: [{ type: "text", text: question }] };
  await saveMessages(chat.id, [user]);
  await setRunStatus(chat.id, "running");

  const t0 = Date.now();
  const { clientStream, persisted } = await runAgentTurn({ chat, user: { id: "smoke", fullName: "Smoke Test", role: "associate" }, messages: [user] });

  // Pretend to be a browser that reads a little, then navigates away.
  const reader = clientStream.getReader();
  for (let i = 0; i < 3; i++) await reader.read();
  await reader.cancel("navigated away");
  console.log("client cancelled after 3 chunks at", Date.now() - t0, "ms");

  await persisted;
  console.log("persisted at", Date.now() - t0, "ms");

  const [after] = await db.select().from(chats).where(eq(chats.id, chat.id));
  console.log("run_status", after.runStatus, "run_started_at", after.runStartedAt);
  const msgs = await loadMessages(chat.id);
  const assistant = msgs.find((m) => m.role === "assistant");
  if (!assistant) throw new Error("no assistant message saved");
  const { activity, answer } = splitAssistantParts(assistant.parts);
  console.log("activity", JSON.stringify(summarizeActivity(activity)));
  for (const p of activity) {
    if (p.type === "text") console.log("  narration:", p.text.slice(0, 80).replace(/\n/g, " "));
    else console.log("  tool:", p.type, JSON.stringify((p as { input?: unknown }).input), (p as { output?: { error?: string; sources?: unknown[] } }).output?.error ?? `${(p as { output?: { sources?: unknown[] } }).output?.sources?.length ?? 0} sources`);
  }
  console.log("metadata", JSON.stringify(assistant.metadata));
  console.log("----- answer -----\n" + answer.map((p) => p.text).join("\n"));

  if (process.argv.includes("--keep")) console.log("kept chat", chat.id);
  else {
    await db.delete(chatMessages).where(eq(chatMessages.chatId, chat.id));
    await db.delete(chats).where(eq(chats.id, chat.id));
    console.log("cleaned up");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
