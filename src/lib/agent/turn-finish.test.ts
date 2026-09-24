import { describe, expect, it } from "vitest";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { chatWriteUpPrompt, finishTurnChunks, finishTurnStream, planFinish, UNANSWERED_TEXT, writeUpReason, type TurnFinish } from "./turn-finish";
import { splitAssistantParts } from "./turn";

// Ling 3.0 Flash Fin's forced last step in a chat on 2026-09-24 (smoke:agent, AXP 10-K read in full).
const LEAKED = `No Delta-specific in this chunk. Continuing through the MD&A section where co-brand and Delta discussions often appear
<tool_call>read_filing
<arg_key>maxChars</arg_key>
<arg_value>25000</arg_value><arg_key>offset</arg_key>
<arg_value>165000</arg_value><arg_key>url</arg_key>
<arg_value>https://www.sec.gov/Archives/edgar/data/4962/000000496226000080/axp-20251231.htm</arg_value>
</tool_call>`;

const call = { toolCallId: "c1", toolName: "read_filing", input: {} };
const result = { toolCallId: "c1", toolName: "read_filing", input: {}, output: { data: {}, sources: [{ id: "doc-1" }] } };
type Step = Parameters<typeof planFinish>[0][number];
const step = (s: Partial<{ text: string; finishReason: string; toolCalls: unknown[]; toolResults: unknown[] }>) =>
  ({ text: "", finishReason: "stop", toolCalls: [], toolResults: [], ...s }) as unknown as Step;
const research = step({ finishReason: "tool-calls", toolCalls: [call], toolResults: [result] });

describe("writeUpReason", () => {
  it("accepts a written answer", () => {
    expect(writeUpReason(step({ text: "Delta is AXP's largest co-brand partner [src:doc-1]." }))).toBeNull();
  });

  it("flags a tool call written as text, an empty step, a cut-off step and a run that stopped on a lookup", () => {
    expect(writeUpReason(step({ text: LEAKED }))).toBe("tool-call-text");
    expect(writeUpReason(step({ text: "  " }))).toBe("empty");
    expect(writeUpReason(step({ text: "| Metric | Q2 |\n| Revenue | $19.6B", finishReason: "length" }))).toBe("length");
    expect(writeUpReason(step({ text: "Reading the next section.", finishReason: "tool-calls", toolCalls: [call] }))).toBe("empty");
  });
});

describe("planFinish", () => {
  it("leaves a good answer alone", () => {
    expect(planFinish([research, step({ text: "Answer [src:doc-1]." })])).toBeNull();
    expect(planFinish([])).toBeNull();
  });

  it("clears a leaked call and writes up from the evidence, with the notice as the fallback", () => {
    expect(planFinish([research, step({ text: LEAKED })])).toEqual({ reason: "tool-call-text", reset: true, writeUp: true, fallback: UNANSWERED_TEXT });
  });

  it("falls back to a cut-off answer rather than the notice", () => {
    expect(planFinish([research, step({ text: "Revenue rose 9.9% [src:doc-1] and", finishReason: "length" })])?.fallback).toBe("Revenue rose 9.9% [src:doc-1] and");
  });

  it("keeps the lookups of a last step that made real calls", () => {
    expect(planFinish([research, research])).toMatchObject({ reason: "empty", reset: false, writeUp: true });
  });

  it("without evidence, keeps a cut-off answer and otherwise shows the notice", () => {
    expect(planFinish([step({ text: "A long answer from the conversation so far", finishReason: "length" })])).toBeNull();
    expect(planFinish([step({ text: LEAKED })])).toEqual({ reason: "tool-call-text", reset: true, writeUp: false, fallback: UNANSWERED_TEXT });
  });
});

describe("chatWriteUpPrompt", () => {
  const text = (role: "user" | "assistant", t: string, id = t): UIMessage => ({ id, role, parts: [{ type: "text", text: t }] });

  it("ends with the question and carries the recent exchanges, without leaked calls", () => {
    const prompt = chatWriteUpPrompt([text("user", "What drove AXP's Q2?"), text("assistant", `Card fees [src:x].\n${LEAKED.split("\n").slice(1).join("\n")}`), text("user", "And the provision?")]);
    expect(prompt).toBe("Earlier in this conversation:\n\nMember: What drove AXP's Q2?\n\nHoot: Card fees [src:x].\n\nThe member's question:\n\nAnd the provision?");
  });

  it("asks just the question on a first turn and trims long earlier answers", () => {
    expect(chatWriteUpPrompt([text("user", "Q?")])).toBe("The member's question:\n\nQ?");
    const prompt = chatWriteUpPrompt([text("user", "a"), text("assistant", "x".repeat(5000)), text("user", "b")]);
    expect(prompt.length).toBeLessThan(1700);
  });
});

const stream = (chunks: UIMessageChunk[]) =>
  new ReadableStream<UIMessageChunk>({
    start(c) {
      for (const x of chunks) c.enqueue(x);
      c.close();
    },
  });

async function collect(s: AsyncIterable<UIMessageChunk>) {
  const out: UIMessageChunk[] = [];
  for await (const c of s) out.push(c);
  return out;
}

async function finalMessage(s: ReadableStream<UIMessageChunk>) {
  let last: UIMessage | undefined;
  for await (const m of readUIMessageStream({ stream: s })) last = m;
  return last!;
}

// A research step with one lookup, then a last step whose text is the leaked call.
const researchChunks: UIMessageChunk[] = [
  { type: "start", messageId: "m1" },
  { type: "start-step" },
  { type: "tool-input-available", toolCallId: "c1", toolName: "read_filing", input: { url: "u" } },
  { type: "tool-output-available", toolCallId: "c1", output: { data: {}, sources: [{ id: "doc-1" }] } },
  { type: "finish-step" },
  { type: "start-step" },
  { type: "reasoning-start", id: "r1" },
  { type: "reasoning-delta", id: "r1", delta: "Need the next section." },
  { type: "reasoning-end", id: "r1" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: LEAKED },
  { type: "text-end", id: "t1" },
  { type: "finish-step" },
  { type: "finish", finishReason: "stop" },
];
const writeUpChunks = (text: string, extra: UIMessageChunk[] = []): UIMessageChunk[] => [
  { type: "start-step" },
  { type: "text-start", id: "w1" },
  { type: "text-delta", id: "w1", delta: text },
  ...extra,
  { type: "text-end", id: "w1" },
  { type: "finish-step" },
  { type: "finish", finishReason: "stop" },
];
const plan = { reason: "tool-call-text" as const, reset: true, writeUp: true, fallback: UNANSWERED_TEXT };

describe("finishTurnChunks", () => {
  it("passes a good turn through untouched", async () => {
    const chunks = await collect(finishTurnChunks(stream(researchChunks), async () => ({ plan: null })));
    expect(chunks).toEqual(researchChunks);
  });

  it("replaces the failed step with the write-up, in the same message the SDK builds", async () => {
    const answer = "Delta is the largest co-brand partner [src:doc-1].";
    const f: TurnFinish = { plan, writeUp: () => stream(writeUpChunks(answer)) };
    const chunks = await collect(finishTurnChunks(stream(researchChunks), async () => f));
    expect(chunks.filter((c) => c.type === "finish")).toEqual([{ type: "finish", finishReason: "stop" }]);
    expect(chunks.findIndex((c) => c.type === "reset-step")).toBe(researchChunks.length - 1);

    const message = await finalMessage(finishTurnStream(stream(researchChunks), async () => f));
    expect(message.parts.map((p) => p.type)).toEqual(["step-start", "tool-read_filing", "step-start", "text"]);
    expect(splitAssistantParts(message.parts).answer.map((p) => p.text)).toEqual([answer]);
  });

  it("shares one write-up between the browser's and the server's copy", async () => {
    let calls = 0;
    const answer = "Answer [src:doc-1].";
    let finishing: Promise<TurnFinish> | undefined;
    const finish = () => (finishing ??= Promise.resolve({ plan, writeUp: () => (calls++, stream(writeUpChunks(answer))) }));
    const [a, b] = await Promise.all([finalMessage(finishTurnStream(stream(researchChunks), finish)), finalMessage(finishTurnStream(stream(researchChunks), finish))]);
    expect(a).toEqual(b);
    expect(calls).toBe(2);
    expect(splitAssistantParts(a.parts).answer[0].text).toBe(answer);
  });

  it("removes a write-up that broke off and shows the fallback", async () => {
    const f: TurnFinish = { plan, writeUp: () => stream(writeUpChunks("Delta is", [{ type: "error", errorText: "timeout" }])) };
    const message = await finalMessage(finishTurnStream(stream(researchChunks), async () => f));
    expect(splitAssistantParts(message.parts).answer.map((p) => p.text)).toEqual([UNANSWERED_TEXT]);
    expect(message.parts.filter((p) => p.type === "tool-read_filing")).toHaveLength(1);
  });

  it("shows the fallback when there is nothing to write up from", async () => {
    const message = await finalMessage(finishTurnStream(stream(researchChunks), async () => ({ plan: { ...plan, writeUp: false } })));
    expect(splitAssistantParts(message.parts).answer.map((p) => p.text)).toEqual([UNANSWERED_TEXT]);
  });

  it("keeps the research and finishes if planning fails", async () => {
    const message = await finalMessage(
      finishTurnStream(stream(researchChunks), async () => {
        throw new Error("steps unavailable");
      }),
    );
    expect(message.parts.filter((p) => p.type === "tool-read_filing")).toHaveLength(1);
  });

  it("closes the trace before the final finish chunk", async () => {
    const order: string[] = [];
    const f: TurnFinish = { plan, writeUp: () => stream(writeUpChunks("A.")), settled: async () => void order.push("settled") };
    for await (const c of finishTurnChunks(stream(researchChunks), async () => f)) if (c.type === "finish") order.push("finish");
    expect(order).toEqual(["settled", "finish"]);
  });
});
