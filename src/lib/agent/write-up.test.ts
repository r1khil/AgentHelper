import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { evidenceText, finalReply, hasToolCallText, stripToolCallText } from "./write-up";

// What Ling 3.0 Flash Fin wrote on its tool-free last step, and Hoot emailed to the fund on 2026-09-23.
const LEAKED = `<tool_call>read_url
<arg_key>maxChars</arg_key>
<arg_value>10000</arg_value><arg_key>offset</arg_key>
<arg_value>0</arg_value><arg_key>url</arg_key>
<arg_value>https://financefeeds.com/broadcom-avgo-stock-price-prediction-465-bull-280-bear</arg_value>
</tool_call>
<tool_call>search_web
<arg_key>limit</arg_key>
<arg_value>5</arg_value><arg_key>query</arg_key>
<arg_value>Broadcom AVGO "China" revenue percentage concentration 10-Q 2026 risk factor</arg_value><arg_key>topic</arg_key>
<arg_value>finance</arg_value>
</tool_call>`;

describe("tool calls written as text", () => {
  it("finds and removes the GLM-style calls Ling wrote", () => {
    expect(hasToolCallText(LEAKED)).toBe(true);
    expect(stripToolCallText(LEAKED)).toBe("");
  });

  it("handles the other models' formats and an unterminated block", () => {
    for (const t of [
      'Checking.\n<tool_call>\n{"name": "get_news", "arguments": {"ticker": "AVGO"}}\n</tool_call>',
      "Checking.\n<function=get_news>\n<parameter=ticker>AVGO</parameter>\n</function>",
      "Checking.\n<|tool_calls_section_begin|><|tool_call_begin|>functions.get_news:0<|tool_call_argument_begin|>{}<|tool_call_end|><|tool_calls_section_end|>",
      "Checking.\n<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>get_news<｜tool▁sep｜>{}<｜tool▁call▁end｜><｜tool▁calls▁end｜>",
      "Checking.\n<tool_call>read_filing\n<arg_key>url</arg_key>\n<arg_value>https://www.sec.gov/Archives/edgar/data/1730168/avgo-2",
    ]) {
      expect(hasToolCallText(t)).toBe(true);
      expect(stripToolCallText(t)).toBe("Checking.");
    }
  });

  it("leaves ordinary prose alone", () => {
    const prose = "Broadcom's 10-Q lists sales by ship-to location, not by end customer [src:A].";
    expect(hasToolCallText(prose)).toBe(false);
    expect(stripToolCallText(prose)).toBe(prose);
  });
});

describe("finalReply", () => {
  it("takes the tagged reply and drops calls inside it", () => {
    expect(finalReply("<answer>The 10-Q says X [src:A].</answer>", "answer")).toBe("The 10-Q says X [src:A].");
    expect(finalReply(`<answer>The 10-Q says X.\n${LEAKED}</answer>`, "answer")).toBe("The 10-Q says X.");
    expect(finalReply("<brief>Fund fell 1%.", "brief")).toBe("Fund fell 1%.");
  });

  it("treats narration plus a leaked call as no reply", () => {
    expect(finalReply(`Let me find the geographic revenue table in the 10-Q.\n\n${LEAKED}`, "answer")).toBeNull();
    expect(finalReply(LEAKED, "answer")).toBeNull();
    expect(finalReply(`<answer>${LEAKED}</answer>`, "answer")).toBeNull();
    expect(finalReply("   ", "answer")).toBeNull();
  });

  it("keeps an untagged plain reply", () => {
    expect(finalReply("No new 8-K since the report.", "answer")).toBe("No new 8-K since the report.");
  });
});

describe("evidenceText", () => {
  const step = (results: unknown[]) => ({ toolResults: results }) as never;

  it("lists each call with its source ids ahead of the data", () => {
    const text = evidenceText([
      step([{ toolName: "get_filings", input: { ticker: "AVGO" }, output: { data: { filings: [{ form: "8-K" }] }, sources: [{ id: "f1", title: "AVGO 8-K" }] } }]),
      step([{ toolName: "read_url", input: { url: "https://x" }, output: { error: "blocked" } }]),
    ]);
    expect(text).toContain('Result 1: get_filings {"ticker":"AVGO"}\nsources: f1 (AVGO 8-K)\n{"filings":[{"form":"8-K"}]}');
    expect(text).toContain('Result 2: read_url {"url":"https://x"}\nerror: blocked');
  });

  it("cuts long results to an even share but keeps every source id", () => {
    const big = { data: { text: "x".repeat(50_000) }, sources: [{ id: "s-last" }] };
    const text = evidenceText([step(Array.from({ length: 20 }, () => ({ toolName: "read_filing", input: {}, output: big })))]);
    expect(text.length).toBeLessThan(52_000);
    expect(text.match(/s-last/g)).toHaveLength(20);
  });

  it("is empty when no tool ran", () => {
    expect(evidenceText([step([])])).toBe("");
  });
});
