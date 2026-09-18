import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { compactHistory, splitAssistantParts, summarizeActivity, type Part } from "./turn";

const text = (t: string): Part => ({ type: "text", text: t });
const tool = (name: string, state: string, output?: unknown, id = name): Part =>
  ({ type: `tool-${name}`, toolCallId: id, state, input: { ticker: "AXP" }, output }) as unknown as Part;

describe("splitAssistantParts", () => {
  it("puts narration before the last tool call into activity and trailing text into the answer", () => {
    const parts = [text("Let me pull the filing."), tool("get_filings", "output-available", { sources: [{ id: "a" }] }), text("Now the numbers."), tool("get_key_financials", "output-available", { sources: [{ id: "b" }] }), text("## Results\nRevenue was…")];
    const { activity, answer } = splitAssistantParts(parts);
    expect(activity.map((p) => p.type)).toEqual(["text", "tool-get_filings", "text", "tool-get_key_financials"]);
    expect(answer).toHaveLength(1);
    expect(answer[0].text).toContain("Results");
  });

  it("treats a message with no tool calls as pure answer", () => {
    const { activity, answer } = splitAssistantParts([text("An 8-K is…")]);
    expect(activity).toEqual([]);
    expect(answer).toHaveLength(1);
  });

  it("ignores step-start parts and empty text", () => {
    const { activity, answer } = splitAssistantParts([{ type: "step-start" } as Part, tool("get_news", "output-available", {}), text("  ")]);
    expect(activity).toHaveLength(1);
    expect(answer).toEqual([]);
  });
});

describe("summarizeActivity", () => {
  it("counts lookups, unique sources, failures, and the pending tool", () => {
    const s = summarizeActivity([
      tool("get_filings", "output-available", { sources: [{ id: "a" }, { id: "b" }] }, "1"),
      tool("get_financials", "output-available", { error: "Concept X not reported", sources: [] }, "2"),
      tool("get_key_financials", "output-available", { sources: [{ id: "b" }, { id: "c" }] }, "3"),
      tool("read_filing", "input-available", undefined, "4"),
    ]);
    expect(s).toEqual({ lookups: 4, sources: 3, failed: 1, current: "read_filing" });
  });
});

describe("compactHistory", () => {
  const big = "x".repeat(5000);
  const msgs: UIMessage[] = [
    { id: "u1", role: "user", parts: [text("q1")] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        tool("read_filing", "output-available", { data: { text: big, url: "u" }, sources: [] }),
        tool("get_news", "output-available", { data: { items: [{ headline: "h", summary: "long", url: "u", publishedAt: "d", sourceId: "s" }] }, sources: [] }),
      ],
    },
    { id: "u2", role: "user", parts: [text("q2")] },
    { id: "a2", role: "assistant", parts: [tool("read_filing", "output-available", { data: { text: big }, sources: [] })] },
  ];

  it("shrinks filing text and news items in earlier turns only", () => {
    const out = compactHistory(msgs);
    const early = out[1].parts[0] as unknown as { output: { data: { text: string; url: string } } };
    expect(early.output.data.text.length).toBeLessThan(600);
    expect(early.output.data.text).toContain("truncated");
    expect(early.output.data.url).toBe("u");
    const news = out[1].parts[1] as unknown as { output: { data: { items: Record<string, unknown>[] } } };
    expect(news.output.data.items[0]).toEqual({ headline: "h", publishedAt: "d", sourceId: "s" });
    const current = out[3].parts[0] as unknown as { output: { data: { text: string } } };
    expect(current.output.data.text.length).toBe(5000);
  });

  it("does not mutate the persisted messages", () => {
    compactHistory(msgs);
    expect((msgs[1].parts[0] as unknown as { output: { data: { text: string } } }).output.data.text.length).toBe(5000);
  });
});
