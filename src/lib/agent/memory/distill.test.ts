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
});

describe("newestEvidenceDate", () => {
  const s = (id: string, publishedAt?: string) => ({ id, title: id, publisher: "p", retrievedAt: "r", publishedAt });
  it("picks the latest valid date and ignores missing ones", () => {
    expect(newestEvidenceDate([s("a", "2026-04-01"), s("b", "2026-07-24T12:00:00Z"), s("c"), s("d", "not a date")])?.toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(newestEvidenceDate([s("c")])).toBeNull();
  });
});
