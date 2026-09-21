import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";

vi.mock("server-only", () => ({}));
const generateText = vi.fn();
vi.mock("ai", async (orig) => ({ ...(await orig<object>()), generateText: (...a: unknown[]) => generateText(...a) }));

import { applyAnswerText, repairCitations } from "./repair";
import { needsCitationRepair } from "./citations";

const src = (id: string) => ({ id, title: `Source ${id}`, publisher: "SEC", retrievedAt: "2026-09-21T00:00:00Z" });
const msg = (answer: string): UIMessage => ({
  id: "m",
  role: "assistant",
  parts: [{ type: "tool-get_key_financials", toolCallId: "1", state: "output-available", input: {}, output: { data: {}, sources: [src("xbrl-1")] } } as unknown as UIMessage["parts"][number], { type: "text", text: answer }],
});

describe("needsCitationRepair", () => {
  it("fires only with enough uncited numeric lines and at least one source", () => {
    const bad = msg("Revenue was $17.9B in Q2.\nNet income was $3.0B for the quarter.\nEPS was $4.08 diluted for Q2.");
    expect(needsCitationRepair(bad, 1)).toBe(true);
    expect(needsCitationRepair(bad, 0)).toBe(false);
    const good = msg("Revenue was $17.9B in Q2 [src:xbrl-1].\nNet income was $3.0B [src:xbrl-1].");
    expect(needsCitationRepair(good, 1)).toBe(false);
  });
});

describe("repairCitations", () => {
  beforeEach(() => generateText.mockReset());

  it("replaces the answer text and keeps the activity parts", async () => {
    const m = msg("Revenue was $17.9B in Q2.\nNet income was $3.0B for the quarter.\nEPS was $4.08 diluted for Q2.");
    generateText.mockResolvedValue({ text: "Revenue was $17.9B in Q2 [src:xbrl-1].\nNet income was $3.0B for the quarter [src:xbrl-1].\nEPS was $4.08 diluted for Q2 [src:xbrl-1]." });
    const out = await repairCitations({ model: {} as never, message: m, sources: [src("xbrl-1")] });
    expect(out).not.toBeNull();
    expect(out!.parts).toHaveLength(2);
    expect(out!.parts[0].type).toBe("tool-get_key_financials");
    expect((out!.parts[1] as { text: string }).text).toContain("[src:xbrl-1]");
    const call = generateText.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("xbrl-1: Source xbrl-1");
  });

  it("rejects a rewrite that cites an id the turn never retrieved", async () => {
    generateText.mockResolvedValue({ text: "Revenue was $17.9B in Q2 [src:made-up].\nNet income was $3.0B [src:xbrl-1].\nEPS was $4.08 [src:xbrl-1]." });
    expect(await repairCitations({ model: {} as never, message: msg("Revenue was $17.9B in Q2.\nNet income was $3.0B for the quarter.\nEPS was $4.08 diluted for Q2."), sources: [src("xbrl-1")] })).toBeNull();
  });

  it("rejects a rewrite that lost most of the answer", async () => {
    generateText.mockResolvedValue({ text: "Not retrieved: everything" });
    expect(await repairCitations({ model: {} as never, message: msg("Revenue was $17.9B in Q2 and it grew.\nNet income was $3.0B for the quarter.\nEPS was $4.08 diluted for Q2."), sources: [src("xbrl-1")] })).toBeNull();
  });

  it("skips messages with no answer text or no sources", async () => {
    expect(await repairCitations({ model: {} as never, message: { id: "x", role: "assistant", parts: [] }, sources: [src("a")] })).toBeNull();
    expect(await repairCitations({ model: {} as never, message: msg("Revenue 1 2 3 was high this quarter."), sources: [] })).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("applyAnswerText", () => {
  it("drops pre-existing answer parts but keeps narration before the last tool", () => {
    const m: UIMessage = { id: "m", role: "assistant", parts: [{ type: "text", text: "plan" }, { type: "tool-x", toolCallId: "1", state: "output-available", input: {}, output: {} } as unknown as UIMessage["parts"][number], { type: "text", text: "a" }, { type: "text", text: "b" }] };
    const out = applyAnswerText(m, "new");
    expect(out.parts.map((p) => p.type)).toEqual(["text", "tool-x", "text"]);
    expect((out.parts[2] as { text: string }).text).toBe("new");
  });
});
