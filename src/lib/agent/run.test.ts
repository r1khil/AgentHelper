import { beforeEach, describe, expect, it, vi } from "vitest";
import { isStepCount, readUIMessageStream, tool, type UIMessage, type UIMessageChunk } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { z } from "zod";
import type { AgentDefinition } from "./definition";
import { repairToolCall } from "./tool-repair";
import type { AgentMetadata, TraceEvent } from "@/lib/trace/events";

vi.mock("server-only", () => ({}));
const saveMessages = vi.fn().mockResolvedValue(undefined);
const setRunStatus = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/chats", () => ({ saveMessages: (...a: unknown[]) => saveMessages(...a), setRunStatus: (...a: unknown[]) => setRunStatus(...a) }));
let def: AgentDefinition;
vi.mock("@/lib/agent/definition", () => ({ buildAgentDefinition: async () => def, FINAL_STEP: 2, MAX_STEPS: 3 }));

import { runAgentTurn } from "./run";
import { hasToolCallText } from "./tool-call-text";
import { splitAssistantParts } from "./turn";
import { CHAT_WRITE_UP_ORDER, UNANSWERED_TEXT } from "./turn-finish";

// What Ling wrote on the forced last step of a chat that used every step (smoke:agent, 2026-09-24).
const LEAKED = `No Delta-specific in this chunk. Continuing through the MD&A
<tool_call>read_filing
<arg_key>offset</arg_key>
<arg_value>165000</arg_value><arg_key>url</arg_key>
<arg_value>https://www.sec.gov/Archives/edgar/data/4962/000000496226000080/axp-20251231.htm</arg_value>
</tool_call>`;
const ANSWER = "Delta is AXP's largest co-brand partner [src:doc-1].";

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const finish = (unified: "stop" | "tool-calls" | "length"): LanguageModelV4StreamPart => ({ type: "finish", usage, finishReason: { unified, raw: unified } });
const lookup = (section: string) => ({
  stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: `c${section}`, toolName: "read_filing", input: JSON.stringify({ section }) },
    finish("tool-calls"),
  ]),
});
/** A tool call whose arguments arrive as raw text, e.g. broken JSON. */
const rawLookup = (input: string) => ({
  stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: "craw", toolName: "read_filing", input },
    finish("tool-calls"),
  ]),
});
const says = (text: string, reason: "stop" | "length" = "stop") => ({
  stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    ...text.split(/(?<=\n)/).map((delta): LanguageModelV4StreamPart => ({ type: "text-delta", id: "t", delta })),
    { type: "text-end", id: "t" },
    finish(reason),
  ]),
});

/** A model that answers each call from the list in order; an Error in the list fails that call. */
function scripted(responses: (ReturnType<typeof says> | Error)[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const r = responses[i++];
      if (!r) throw new Error(`unexpected model call ${i}`);
      if (r instanceof Error) throw r;
      return r;
    },
  });
}

function setup(responses: (ReturnType<typeof says> | Error)[]) {
  const model = scripted(responses);
  const readFiling = tool({
    inputSchema: z.object({ section: z.string() }),
    execute: async ({ section }) => ({ data: { text: `10-K part ${section}: Delta is the largest co-brand partner.` }, sources: [{ id: `doc-${section}`, title: `10-K part ${section}`, publisher: "SEC EDGAR", retrievedAt: "2026-09-24" }] }),
  });
  def = {
    modelId: "mock",
    answeredBy: () => "mock",
    model,
    instructions: "SYS",
    tools: { read_filing: readFiling },
    stopWhen: isStepCount(3),
    prepareStep: ({ stepNumber }) => (stepNumber >= 2 ? { toolChoice: "none" } : undefined),
    maxRetries: 0,
    maxOutputTokens: 1000,
    repairToolCall,
  };
  return model;
}

const question: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Which co-brand partners does AXP's 10-K name?" }] };
const turn = (trace = false) => runAgentTurn({ chat: { id: "chat-1", teamId: "t", holdingId: null }, user: { id: "u", fullName: "Test", role: "associate" }, messages: [question], trace });

async function readAll(s: ReadableStream<unknown>) {
  const chunks: UIMessageChunk[] = [];
  const reader = s.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value as UIMessageChunk);
  }
}

async function messageOf(chunks: UIMessageChunk[]) {
  let last: UIMessage | undefined;
  for await (const m of readUIMessageStream({ stream: convertArrayToReadableStream(chunks) })) last = m;
  return last!;
}

const saved = () => (saveMessages.mock.calls.at(-1)![1] as UIMessage[]).at(-1)!;
const answerOf = (m: UIMessage) => splitAssistantParts(m.parts).answer.map((p) => p.text);
const texts = (m: UIMessage) => m.parts.flatMap((p) => (p.type === "text" ? [p.text] : []));

describe("runAgentTurn when the last step leaks a tool call", () => {
  beforeEach(() => {
    saveMessages.mockClear();
    setRunStatus.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("streams and saves the write-up in place of the leaked call, from one extra model call", async () => {
    const model = setup([lookup("1"), lookup("2"), says(LEAKED), says(ANSWER)]);
    const { clientStream, persisted } = await turn();
    const client = await messageOf(await readAll(clientStream));
    await persisted;

    for (const m of [client, saved()]) {
      expect(answerOf(m)).toEqual([ANSWER]);
      expect(texts(m).some(hasToolCallText)).toBe(false);
      expect(m.parts.filter((p) => p.type === "tool-read_filing")).toHaveLength(2);
    }
    expect(model.doStreamCalls).toHaveLength(4);
    expect(model.doStreamCalls[2].toolChoice).toEqual({ type: "none" });
    const writeUp = model.doStreamCalls[3];
    expect(writeUp.tools ?? []).toEqual([]);
    const prompt = JSON.stringify(writeUp.prompt);
    expect(prompt).toContain("10-K part 2: Delta is the largest co-brand partner.");
    expect(prompt).toContain("sources: doc-1 (10-K part 1)");
    expect(prompt).toContain("Which co-brand partners does AXP's 10-K name?");
    expect(prompt).toContain(JSON.stringify(CHAT_WRITE_UP_ORDER).slice(1, -1));
    expect(saved().metadata).toMatchObject({ writeUp: "tool-call-text", steps: 3, writeUpUsage: { output: 5 } } satisfies AgentMetadata);
    expect(setRunStatus).toHaveBeenLastCalledWith("chat-1", "idle");
  });

  it("still saves the write-up when the browser leaves mid-run", async () => {
    setup([lookup("1"), lookup("2"), says(LEAKED), says(ANSWER)]);
    const { clientStream, persisted } = await turn();
    const reader = clientStream.getReader();
    await reader.read();
    await reader.cancel("navigated away");
    await persisted;
    expect(answerOf(saved())).toEqual([ANSWER]);
  });

  it("rewrites an answer cut off by the token cap", async () => {
    setup([lookup("1"), lookup("2"), says("| Partner | Source |\n| Delta | [src:doc-1", "length"), says(ANSWER)]);
    const { clientStream, persisted } = await turn();
    const client = await messageOf(await readAll(clientStream));
    await persisted;
    expect(answerOf(client)).toEqual([ANSWER]);
    expect(saved().metadata).toMatchObject({ writeUp: "length" });
  });

  it("saves the notice, not the markup, when the write-up fails", async () => {
    setup([lookup("1"), lookup("2"), says(LEAKED), new Error("provider down")]);
    const { clientStream, persisted } = await turn();
    const client = await messageOf(await readAll(clientStream));
    await persisted;
    expect(answerOf(client)).toEqual([UNANSWERED_TEXT]);
    expect(answerOf(saved())).toEqual([UNANSWERED_TEXT]);
    expect(saved().metadata).toMatchObject({ unanswered: true });
  });

  it("leaves a normal answer alone", async () => {
    const model = setup([lookup("1"), says(ANSWER)]);
    const { clientStream, persisted } = await turn();
    await readAll(clientStream);
    await persisted;
    expect(model.doStreamCalls).toHaveLength(2);
    expect(answerOf(saved())).toEqual([ANSWER]);
    expect((saved().metadata as AgentMetadata).writeUp).toBeUndefined();
  });

  it("traces the write-up as its own step and ends the run after it", async () => {
    setup([lookup("1"), lookup("2"), says(LEAKED), says(ANSWER)]);
    const { clientStream, persisted } = await turn(true);
    const chunks = await readAll(clientStream);
    await persisted;
    const events = chunks.flatMap((c) => (c.type === "data-trace" ? [(c as { data: TraceEvent }).data] : []));
    const writeUpStart = events.findIndex((e) => e.t === "step.start" && e.writeUp === "tool-call-text");
    const end = events.findIndex((e) => e.t === "run.end");
    expect(writeUpStart).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(writeUpStart);
    expect(events[end]).toMatchObject({ steps: 4, usage: { output: 20 } });
    expect(answerOf(await messageOf(chunks))).toEqual([ANSWER]);
  });
});

describe("runAgentTurn with malformed tool arguments", () => {
  beforeEach(() => {
    saveMessages.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("repairs broken JSON and runs the tool instead of failing the step", async () => {
    setup([rawLookup('```json\n{"section": "1",}\n```'), says(ANSWER)]);
    const { clientStream, persisted } = await turn();
    await readAll(clientStream);
    await persisted;
    const call = saved().parts.find((p) => p.type === "tool-read_filing") as { state: string; input: unknown } | undefined;
    expect(call).toMatchObject({ state: "output-available", input: { section: "1" } });
  });

  it("keeps the reason, not 'An error occurred.', when arguments cannot be repaired", async () => {
    setup([rawLookup('{"chapter": 1}'), says(ANSWER)]);
    const { clientStream, persisted } = await turn();
    const client = await messageOf(await readAll(clientStream));
    await persisted;
    for (const m of [client, saved()]) {
      const call = m.parts.find((p) => p.type === "tool-read_filing") as { state: string; errorText?: string } | undefined;
      expect(call?.state).toBe("output-error");
      expect(call?.errorText).toMatch(/^Invalid arguments for read_filing: section: /);
    }
  });
});
