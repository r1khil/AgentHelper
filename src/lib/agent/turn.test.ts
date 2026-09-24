import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { compactForStep, compactHistory, shrinkToolData, splitAssistantParts, summarizeActivity, withoutToolCallText, type Part } from "./turn";

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

  it("never shows a tool call the model wrote as text, finished or still streaming", () => {
    const leaked = "<tool_call>read_filing\n<arg_key>url</arg_key>\n<arg_value>https://www.sec.gov/x.htm</arg_value>\n</tool_call>";
    const research = tool("read_filing", "output-available", {});
    expect(splitAssistantParts([research, text(leaked)]).answer).toEqual([]);
    expect(splitAssistantParts([research, text("<tool_call>read_filing\n<arg_key>url</arg_ke")]).answer).toEqual([]);
    expect(splitAssistantParts([research, text(`Continuing with the MD&A.\n${leaked}`)]).answer.map((p) => p.text)).toEqual(["Continuing with the MD&A."]);
    expect(splitAssistantParts([text(leaked), research, text("Revenue $19.6B [src:a].")]).activity.map((p) => p.type)).toEqual(["tool-read_filing"]);
  });
});

describe("withoutToolCallText", () => {
  it("returns the same parts when nothing leaked", () => {
    const parts = [tool("get_news", "output-available", {}), text("Revenue < guidance [src:a].")];
    expect(withoutToolCallText(parts)).toBe(parts);
  });

  it("cuts leaked calls and drops text parts left empty, keeping tool parts", () => {
    const parts = [tool("get_news", "output-available", {}), text('<tool_call>\n{"name": "get_news"}\n</tool_call>'), text("Answer.<function=get_quote>\n<parameter=ticker>AXP</parameter>\n</function>")];
    expect(withoutToolCallText(parts)).toEqual([parts[0], text("Answer.")]);
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

describe("compactForStep", () => {
  const toolMsg = (name: string, text: string, id: string) =>
    ({ role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: name, output: { type: "json", value: { data: { text, url: "u" }, sources: [] } } }] }) as unknown as import("ai").ModelMessage;
  const long = "x".repeat(5000);
  const msgs = [
    { role: "user", content: "q" },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "1", toolName: "read_filing", input: {} }] },
    toolMsg("read_filing", long, "1"),
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "2", toolName: "read_filing", input: {} }] },
    toolMsg("read_filing", long, "2"),
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "3", toolName: "read_filing", input: {} }] },
    toolMsg("read_filing", long, "3"),
  ] as import("ai").ModelMessage[];
  const textOf = (m: import("ai").ModelMessage) => ((m.content as unknown as { output: { value: { data: { text: string } } } }[])[0].output.value.data.text);

  it("shrinks tool results older than the last two steps and leaves the recent ones whole", () => {
    const out = compactForStep(msgs, 2);
    expect(textOf(out[2]).length).toBeLessThan(600);
    expect(textOf(out[2])).toContain("truncated");
    expect(textOf(out[4]).length).toBe(5000);
    expect(textOf(out[6]).length).toBe(5000);
    expect(textOf(msgs[2]).length).toBe(5000);
  });

  it("returns the same array when there is nothing to shrink", () => {
    const two = msgs.slice(0, 5);
    expect(compactForStep(two, 2)).toBe(two);
    const short = [msgs[0], msgs[1], toolMsg("read_filing", "brief", "1"), msgs[3], toolMsg("get_quote", "n/a", "2"), msgs[5], toolMsg("get_quote", "n/a", "3")];
    expect(compactForStep(short, 2)).toBe(short);
  });

  it("leaves non-json and non-ToolResult payloads alone", () => {
    const odd = [{ role: "tool", content: [{ type: "tool-result", toolCallId: "1", toolName: "read_filing", output: { type: "text", value: long } }] }, msgs[3], msgs[4], msgs[5], msgs[6]] as unknown as import("ai").ModelMessage[];
    expect(compactForStep(odd, 2)).toBe(odd);
  });
});

describe("shrinkToolData", () => {
  it("reduces news to headline, date and source id", () => {
    expect(shrinkToolData("get_news", { items: [{ headline: "h", publishedAt: "d", sourceId: "s", summary: "long" }] })).toEqual({ items: [{ headline: "h", publishedAt: "d", sourceId: "s" }] });
  });
  it("returns the same reference when nothing applies", () => {
    const d = { price: 1 };
    expect(shrinkToolData("get_quote", d)).toBe(d);
  });
});
