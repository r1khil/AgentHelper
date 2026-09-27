import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("./model", () => ({ AGENT_MODELS: [{ id: "a" }, { id: "b" }, { id: "c" }], agentModelId: async () => "b", chatModel: (id: string) => ({ id, modelId: id, provider: "mock" }) }));
vi.mock("./mcp", () => ({ loadMcpTools: async () => ({ tools: {}, servers: [], instructions: [] }) }));
vi.mock("@/lib/pt-sheet/read", () => ({ ptSheetConfigured: () => true, readPtSheet: vi.fn() }));
vi.mock("./instructions", () => ({ buildInstructions: async () => "SYS" }));
vi.mock("./tools", () => ({ makeTools: () => ({}) }));

import { buildAgentDefinition, fallbackOrder, FINAL_STEP, FINAL_STEP_NUDGE, KEEP_FULL_STEPS, prepareAgentStep } from "./definition";
import { PT_SHEET_MODEL_ID } from "./pt-sheet-guard";

describe("fallbackOrder", () => {
  it("puts the admin's choice first and keeps the rest in list order", () => {
    expect(fallbackOrder("b")).toEqual(["b", "a", "c"]);
    expect(fallbackOrder("zzz")).toEqual(["zzz", "a", "b", "c"]);
  });
});

describe("prepareAgentStep", () => {
  const long = "x".repeat(3000);
  const tool = (id: string) => ({ role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: "read_filing", output: { type: "json", value: { data: { text: long }, sources: [] } } }] }) as unknown as ModelMessage;
  const call = (id: string) => ({ role: "assistant", content: [{ type: "tool-call", toolCallId: id, toolName: "read_filing", input: {} }] }) as unknown as ModelMessage;
  const messages: ModelMessage[] = [{ role: "user", content: "q" }, call("1"), tool("1"), call("2"), tool("2"), call("3"), tool("3")];
  const step = prepareAgentStep("SYS");

  it("does nothing on early steps", () => {
    expect(step({ stepNumber: 0, messages })).toBeUndefined();
    expect(step({ stepNumber: KEEP_FULL_STEPS, messages })).toBeUndefined();
  });

  it("compacts stale tool results once past the keep window", () => {
    const r = step({ stepNumber: KEEP_FULL_STEPS + 1, messages });
    expect(r?.messages).toBeDefined();
    expect(r?.toolChoice).toBeUndefined();
    const first = (r!.messages![2].content as unknown as { output: { value: { data: { text: string } } } }[])[0].output.value.data.text;
    expect(first.length).toBeLessThan(600);
  });

  it("forces prose with the nudge on the final step", () => {
    const r = step({ stepNumber: FINAL_STEP, messages: [{ role: "user", content: "q" }] });
    expect(r?.toolChoice).toBe("none");
    expect(r?.instructions).toBe(`SYS\n\n${FINAL_STEP_NUDGE}`);
    expect(r?.messages).toBeUndefined();
  });
});

describe("the PT sheet tool in an agent definition", () => {
  const base = { teamId: "t1", holdingId: null, user: { id: "u1", fullName: "U", role: "exec" }, purpose: "chat" as const };
  const viewer = (role: string) => ({ id: "u1", role, teamId: null, fullName: "U", transparencyMode: false }) as never;

  it("is given to execs and admins in a saved chat, and to nobody else", async () => {
    expect(Object.keys((await buildAgentDefinition({ ...base, viewer: viewer("exec"), chatId: "c1" })).tools)).toContain("read_pt_sheet");
    expect(Object.keys((await buildAgentDefinition({ ...base, viewer: viewer("admin"), chatId: "c1" })).tools)).toContain("read_pt_sheet");
    expect(Object.keys((await buildAgentDefinition({ ...base, viewer: viewer("lead_analyst"), chatId: "c1" })).tools)).not.toContain("read_pt_sheet");
    expect(Object.keys((await buildAgentDefinition({ ...base, viewer: viewer("exec") })).tools)).not.toContain("read_pt_sheet");
    expect(Object.keys((await buildAgentDefinition({ ...base, purpose: "prep" })).tools)).not.toContain("read_pt_sheet");
  });

  it("keeps a conversation that already holds sheet data on the sheet-safe model", async () => {
    const pinned = await buildAgentDefinition({ ...base, viewer: viewer("exec"), chatId: "c1", sheetInHistory: true });
    expect((pinned.model as { modelId: string }).modelId).toBe(PT_SHEET_MODEL_ID);
    expect(pinned.answeredBy()).toBe(PT_SHEET_MODEL_ID);
    const fresh = await buildAgentDefinition({ ...base, viewer: viewer("exec"), chatId: "c1" });
    expect(fresh.answeredBy()).toBe("b");
  });
});
