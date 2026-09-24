// End-to-end check of one agent turn with the real model, simulating a browser that disconnects
// after the first chunks: the run must still finish, be saved, and clear run_status.
// Usage: npm run smoke:agent -- "Summarize the last 10-Q for AXP…" [--keep] [--trace]
// --trace runs the turn in transparency mode and checks that trace parts stream but are never saved.
// It also prints model fallbacks and whether the citation-repair pass rewrote the answer.
// After the turn it distills the answer into the holding's research log (like the chat route does) and lists
// the holding's memories (--no-distill skips that, so a test answer never reaches the research log);
// --print-instructions shows the prompt the next turn would get, research log included.
// (tsx needs the react-server condition because the agent modules import "server-only".)
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { db } from "@/db/client";
import { chatMessages, chats, holdings, teams } from "@/db/schema";
import { runAgentTurn } from "@/lib/agent/run";
import { loadMessages, saveMessages, setRunStatus } from "@/lib/chats";
import { splitAssistantParts, summarizeActivity } from "@/lib/agent/turn";
import { hasToolCallText } from "@/lib/agent/tool-call-text";
import type { TraceEvent } from "@/lib/trace/events";
import { distillTurn } from "@/lib/agent/memory/distill";
import { listHoldingMemories } from "@/lib/agent/memory/store";
import { buildInstructions } from "@/lib/agent/instructions";

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

  const trace = process.argv.includes("--trace");
  const t0 = Date.now();
  const { clientStream, persisted } = await runAgentTurn({ chat, user: { id: "smoke", fullName: "Smoke Test", role: "associate" }, messages: [user], trace });

  const reader = clientStream.getReader();
  if (trace) {
    // Read the whole client stream and account for the transparency trace.
    const events: TraceEvent[] = [];
    const received: UIMessageChunk[] = [];
    let chunks = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks++;
      received.push(value as UIMessageChunk);
      const c = value as { type: string; data?: TraceEvent };
      if (c.type === "data-trace" && c.data) events.push(c.data);
    }
    // What the browser ends up showing: a failed last step must be gone from the live message too, not only the saved one.
    let live: UIMessage | undefined;
    for await (const m of readUIMessageStream({ stream: new ReadableStream<UIMessageChunk>({ start: (c) => (received.forEach((x) => c.enqueue(x)), c.close()) }) })) live = m;
    const liveLeaks = live?.parts.filter((p) => p.type === "text" && hasToolCallText(p.text)).length ?? 0;
    console.log(`live message: ${live?.parts.length ?? 0} parts, answer ${splitAssistantParts(live?.parts ?? []).answer.length ? "present" : "EMPTY"}, ${liveLeaks} text parts with tool calls written as text`);
    if (liveLeaks) throw new Error("the browser's message still contains tool calls written as text");
    const fetches = events.filter((e) => e.t === "fetch");
    const network = fetches.filter((e) => e.t === "fetch" && e.layer === "network").length;
    const stepEnds = events.filter((e): e is Extract<TraceEvent, { t: "step.end" }> => e.t === "step.end");
    console.log(`trace: ${events.length} events in ${chunks} chunks · ${fetches.length} fetches (${network} network) · ${stepEnds.length} steps · run.end ${events.some((e) => e.t === "run.end") ? "yes" : "no"}`);
    for (const e of events) {
      if (e.t === "step.start") console.log(e.writeUp ? `  write-up (${e.writeUp}): tools=${e.toolChoice}` : `  step ${e.step! + 1}: tools=${e.toolChoice}${e.final ? " (final)" : ""}`);
      else if (e.t === "step.end") console.log(`    end: ${e.finishReason} · ${e.usage.input ?? "?"} in / ${e.usage.output ?? "?"} out · ${e.ms} ms`);
      else if (e.t === "tool.start") console.log(`    ${e.tool} ${JSON.stringify(e.args)}`);
      else if (e.t === "fetch") console.log(`      ${e.layer.padEnd(7)} ${e.host} ${e.key ?? e.url ?? ""} ${e.ms} ms${e.bytes ? ` ${e.bytes} B` : ""}${e.error ? ` ERROR ${e.error}` : ""}`);
      else if (e.t === "tool.end") console.log(`    -> ${e.ok ? "ok" : "failed"} ${e.ms} ms, ${e.sources} sources`);
      else if (e.t === "model.fallback") console.log(`  MODEL FALLBACK ${e.from} -> ${e.to}: ${e.error}`);
    }
    if (events.length === 0) throw new Error("--trace produced no trace events");
    if (!stepEnds.some((e) => (e.usage.output ?? 0) > 0)) throw new Error("no step.end with output tokens");
  } else {
    // Pretend to be a browser that reads a little, then navigates away.
    let dataChunks = 0;
    for (let i = 0; i < 3; i++) {
      const { value } = await reader.read();
      if ((value as { type?: string } | undefined)?.type?.startsWith("data-")) dataChunks++;
    }
    await reader.cancel("navigated away");
    console.log("client cancelled after 3 chunks at", Date.now() - t0, "ms", dataChunks ? `(${dataChunks} unexpected data chunks)` : "");
    if (dataChunks) throw new Error("trace parts streamed without --trace");
  }

  await persisted;
  console.log("persisted at", Date.now() - t0, "ms");

  const [after] = await db.select().from(chats).where(eq(chats.id, chat.id));
  console.log("run_status", after.runStatus, "run_started_at", after.runStartedAt);
  const msgs = await loadMessages(chat.id);
  const assistant = msgs.find((m) => m.role === "assistant");
  if (!assistant) throw new Error("no assistant message saved");
  const dataParts = assistant.parts.filter((p) => p.type.startsWith("data-"));
  if (dataParts.length) throw new Error(`${dataParts.length} data parts were persisted; the trace must stay transient`);
  const { activity, answer } = splitAssistantParts(assistant.parts);
  console.log("activity", JSON.stringify(summarizeActivity(activity)));
  for (const p of activity) {
    if (p.type === "text") console.log("  narration:", p.text.slice(0, 80).replace(/\n/g, " "));
    else console.log("  tool:", p.type, JSON.stringify((p as { input?: unknown }).input), (p as { output?: { error?: string; sources?: unknown[] } }).output?.error ?? `${(p as { output?: { sources?: unknown[] } }).output?.sources?.length ?? 0} sources`);
  }
  const meta = assistant.metadata as { repaired?: boolean; writeUp?: string; unanswered?: boolean } | undefined;
  console.log("metadata", JSON.stringify(assistant.metadata), meta?.repaired ? "(citation repair ran)" : "", meta?.writeUp ? `(written up from the evidence: ${meta.writeUp})` : "", meta?.unanswered ? "(UNANSWERED)" : "");
  const leaked = assistant.parts.filter((p) => p.type === "text" && hasToolCallText(p.text)).length;
  if (leaked) throw new Error(`${leaked} saved text parts still contain tool calls written as text`);
  console.log("----- answer -----\n" + answer.map((p) => p.text).join("\n"));

  if (process.argv.includes("--no-distill")) console.log("distillation skipped");
  else {
    const t1 = Date.now();
    const distilled = await distillTurn({ chat, question, response: assistant });
    console.log("distilled", JSON.stringify(distilled), "in", Date.now() - t1, "ms");
  }
  if (chat.holdingId) {
    const mem = await listHoldingMemories(chat.holdingId, 20);
    console.log(`memories for ${axp?.ticker}: ${mem.length}`);
    for (const m of mem) console.log(`  [${m.kind}] ${m.createdAt.slice(0, 10)} ev=${m.evidenceAt?.slice(0, 10) ?? "-"} ver=${m.verifiedAt?.slice(0, 10) ?? "-"} exp=${m.expiresAt?.slice(0, 10) ?? "-"} ${m.body.slice(0, 110)} ${m.sources.length ? `[${m.sources.map((s) => s.id).join(",")}]` : ""}`);
  }
  if (process.argv.includes("--print-instructions")) {
    const ins = await buildInstructions(chat.teamId, { holdingId: chat.holdingId, userName: "Smoke Test", userRole: "associate" });
    const i = ins.indexOf("Research log for");
    console.log(`instructions: ${ins.length} chars; research log block: ${i >= 0 ? "present" : "absent"}`);
    if (i >= 0) console.log(ins.slice(i, i + 1500));
  }

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
