import { describe, expect, it } from "vitest";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { generateText } from "ai";
import { isPtSheetSource, PT_SHEET_MODEL_UNAVAILABLE, sheetSafeModel, usesPtSheet } from "./pt-sheet-guard";

const answer = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
      warnings: [],
    }),
    doStream: async () => ({ stream: convertArrayToReadableStream([]) }),
  });

const failing = () =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("429 rate limited");
    },
  });

describe("usesPtSheet", () => {
  it("spots the tool anywhere in the conversation", () => {
    expect(usesPtSheet([{ parts: [{ type: "text", text: "hi" }] }])).toBe(false);
    expect(usesPtSheet([{ parts: [{ type: "text", text: "hi" }] }, { parts: [{ type: "tool-read_pt_sheet", toolCallId: "1", state: "output-available", input: {}, output: {} }] }] as never)).toBe(true);
    expect(usesPtSheet([{ parts: [{ type: "dynamic-tool", toolName: "read_pt_sheet", toolCallId: "1", state: "input-available", input: {} }] }] as never)).toBe(true);
    expect(usesPtSheet([{ parts: [{ type: "tool-get_quote", toolCallId: "1", state: "output-available", input: {}, output: {} }] }] as never)).toBe(false);
  });
});

describe("isPtSheetSource", () => {
  it("recognises sheet sources by id", () => {
    expect(isPtSheetSource({ id: "ptsheet-abc" })).toBe(true);
    expect(isPtSheetSource({ id: "drive-abc" })).toBe(false);
  });
});

describe("sheetSafeModel", () => {
  it("uses the normal chain until the sheet is read, then only the safe model", async () => {
    const state = { read: false };
    let safeBuilt = 0;
    const model = sheetSafeModel(answer("from chain"), () => (safeBuilt++, answer("from ling")), () => state.read);
    expect((await generateText({ model, prompt: "q" })).text).toBe("from chain");
    expect(safeBuilt).toBe(0);
    state.read = true;
    expect((await generateText({ model, prompt: "q" })).text).toBe("from ling");
  });

  it("never falls back once pinned: a safe-model failure ends the call", async () => {
    const chain = answer("from chain");
    const model = sheetSafeModel(chain, failing, () => true);
    await expect(generateText({ model, prompt: "q", maxRetries: 0 })).rejects.toThrow(PT_SHEET_MODEL_UNAVAILABLE);
    expect(chain.doGenerateCalls).toHaveLength(0);
  });
});
