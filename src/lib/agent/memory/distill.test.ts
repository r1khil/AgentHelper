import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("./store", () => ({ MARKET_FACT_TTL_DAYS: 120, rememberMemory: vi.fn() }));
vi.mock("@/lib/agent/definition", () => ({ agentModelWithFallback: async () => ({ model: {}, modelId: "m" }) }));

import { newestEvidenceDate, parseDistilled, shouldDistill } from "./distill";

describe("parseDistilled", () => {
  it("accepts JSON wrapped in prose and trims everything", () => {
    const d = parseDistilled('Here you go:\n{"summary":"  Asked about Q2.  Found 10% growth. ","facts":[{"text":"Revenue $19.6B in Q2 2026","sourceIds":["xbrl-1"],"durable":false},{"text":"Revenue concept is RevenuesNetOfInterestExpense","sourceIds":["xbrl-1"],"durable":true},{"text":""}],"lessons":["10-Q MD&A is Item 2"],"nextQuestions":["What did segment margins do?"]}\nthanks');
    expect(d).toEqual({
      summary: "Asked about Q2. Found 10% growth.",
      facts: [
        { text: "Revenue $19.6B in Q2 2026", sourceIds: ["xbrl-1"], durable: false },
        { text: "Revenue concept is RevenuesNetOfInterestExpense", sourceIds: ["xbrl-1"], durable: true },
      ],
      lessons: ["10-Q MD&A is Item 2"],
      nextQuestions: ["What did segment margins do?"],
    });
  });
  it("returns null for garbage or an empty distillation", () => {
    expect(parseDistilled("no json here")).toBeNull();
    expect(parseDistilled('{"summary":"","facts":[]}')).toBeNull();
  });
  it("reads JSON inside a code fence, trailing commas and all", () => {
    const d = parseDistilled('```json\n{"summary":"Asked about Q2.","facts":[{"text":"Revenue $19.6B in Q2 2026","sourceIds":["xbrl-1"],"durable":false},],"lessons":[],"nextQuestions":["What did margins do?",],}\n```');
    expect(d).toEqual({ summary: "Asked about Q2.", facts: [{ text: "Revenue $19.6B in Q2 2026", sourceIds: ["xbrl-1"], durable: false }], lessons: [], nextQuestions: ["What did margins do?"] });
  });
  it("keeps the complete facts of output cut off by the token limit and drops the one being written", () => {
    // Ling on 2026-09-25: reasoning ate half of maxOutputTokens and the fenced JSON stopped mid-fact.
    const cut = `\`\`\`json
{
  "summary": "For the 7-day period ending 2026-09-24 close, the Fund returned +0.16% versus the S&P 500 at +0.87%.",
  "facts": [
    {
      "text": "Fund returned +0.16% vs S&P 500 price return of +0.87% over 5 trading days (2026-09-17 to 2026-09-24).",
      "sourceIds": ["attr-u9a52u"],
      "durable": false
    },
    {
      "text": "Decomposition: allocation -9 bps, selection -73 bps, interaction -10 bps. [src:attr-u9a52u]",
      "sourceIds": ["attr-u9a52u"],
      "durable": false
    },
    {
      "text": "Bottom contributors: NEE -21 bps (-6.96%), CI -14 bps (-3.80%).",
      "sourceIds": ["attr-u9a52u"],
      "durable":`;
    const d = parseDistilled(cut)!;
    expect(d.summary).toBe("For the 7-day period ending 2026-09-24 close, the Fund returned +0.16% versus the S&P 500 at +0.87%.");
    expect(d.facts.map((f) => f.text)).toEqual(["Fund returned +0.16% vs S&P 500 price return of +0.87% over 5 trading days (2026-09-17 to 2026-09-24).", "Decomposition: allocation -9 bps, selection -73 bps, interaction -10 bps."]);
    expect(d.facts[1].sourceIds).toEqual(["attr-u9a52u"]);
    expect(d.lessons).toEqual([]);
  });
  it("never keeps a half-written fact text", () => {
    const d = parseDistilled('```json\n{"summary":"Asked about Q2.","facts":[{"text":"Revenue $19.6B in Q2 2026","sourceIds":["x"],"durable":false},{"text":"Top contributors: META +53 bps (+14')!;
    expect(d.facts.map((f) => f.text)).toEqual(["Revenue $19.6B in Q2 2026"]);
  });
  it("drops only the last lesson or question when the cut lands there", () => {
    const d = parseDistilled('{"summary":"s","facts":[{"text":"f","sourceIds":["x"],"durable":true}],"lessons":["one","two is cut sh')!;
    expect(d).toEqual({ summary: "s", facts: [{ text: "f", sourceIds: ["x"], durable: true }], lessons: ["one"], nextQuestions: [] });
  });
  it("returns null when the cut lands inside the summary", () => {
    expect(parseDistilled('```json\n{\n  "summary": "For the 7-day period ending 2026-09-24 close, the Fund ret')).toBeNull();
    expect(parseDistilled("```json\n{")).toBeNull();
  });
  it("caps list lengths", () => {
    const d = parseDistilled(JSON.stringify({ summary: "s", facts: Array.from({ length: 10 }, (_, i) => ({ text: `f${i}`, sourceIds: [] })), lessons: ["a", "b", "c", "d"], nextQuestions: ["1", "2", "3", "4"] }));
    expect(d!.facts).toHaveLength(6);
    expect(d!.lessons).toHaveLength(3);
    expect(d!.nextQuestions).toHaveLength(3);
  });
});

describe("shouldDistill", () => {
  const msg = (text: string): UIMessage => ({ id: "m", role: "assistant", parts: [{ type: "text", text }] });
  it("skips answers without sources or with almost no text", () => {
    expect(shouldDistill(msg("x".repeat(200)), 0)).toBe(false);
    expect(shouldDistill(msg("I can't write your update."), 3)).toBe(false);
    expect(shouldDistill(msg("x".repeat(200)), 3)).toBe(true);
  });
  it("skips the notice saved when no answer could be written", () => {
    expect(shouldDistill({ ...msg("x".repeat(200)), metadata: { unanswered: true } }, 3)).toBe(false);
  });
  it("never distills a tool call the model wrote as text", () => {
    expect(shouldDistill(msg(`<tool_call>read_filing\n<arg_key>url</arg_key>\n<arg_value>https://www.sec.gov/${"x".repeat(200)}</arg_value>\n</tool_call>`), 3)).toBe(false);
  });
});

describe("newestEvidenceDate", () => {
  const s = (id: string, publishedAt?: string) => ({ id, title: id, publisher: "p", retrievedAt: "r", publishedAt });
  it("picks the latest valid date and ignores missing ones", () => {
    expect(newestEvidenceDate([s("a", "2026-04-01"), s("b", "2026-07-24T12:00:00Z"), s("c"), s("d", "not a date")])?.toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(newestEvidenceDate([s("c")])).toBeNull();
  });
});
