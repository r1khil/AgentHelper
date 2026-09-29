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

describe("tool routing in prepareAgentStep", () => {
  const route = vi.fn(({ stepNumber, usedTools }: { stepNumber: number; usedTools: string[] }) => ["get_news", ...(stepNumber > 0 ? usedTools : [])]);
  const step = prepareAgentStep("SYS", FINAL_STEP_NUDGE, route);
  const q: ModelMessage[] = [{ role: "user", content: "q" }];

  it("offers the routed tools, passing the tools the turn already called", () => {
    expect(step({ stepNumber: 0, messages: q, steps: [] })).toEqual({ activeTools: ["get_news"] });
    expect(step({ stepNumber: 1, messages: q, steps: [{ toolCalls: [{ toolName: "get_quote" }, { toolName: "get_quote" }] }] })).toEqual({ activeTools: ["get_news", "get_quote"] });
    expect(route).toHaveBeenLastCalledWith({ stepNumber: 1, usedTools: ["get_quote"] });
  });

  it("leaves the final step as it was: every tool, prose forced", () => {
    expect(step({ stepNumber: FINAL_STEP, messages: q, steps: [] })).toEqual({ toolChoice: "none", instructions: `SYS\n\n${FINAL_STEP_NUDGE}`, messages: undefined });
  });
});

describe("tool routing in an agent definition", () => {
  const base = { teamId: "t1", holdingId: null, user: { id: "u1", fullName: "U", role: "exec" } };
  const exec = { id: "u1", role: "exec", teamId: null, fullName: "U", transparencyMode: false } as never;

  it("routes a chat turn and records how many tools each step offered", async () => {
    const def = await buildAgentDefinition({ ...base, viewer: exec, chatId: "c1", purpose: "chat", routing: { question: "what changed in the app this week?", priorTools: [] } });
    const r = def.prepareStep({ stepNumber: 0, messages: [{ role: "user", content: "q" }], steps: [] });
    expect(r?.activeTools).toContain("get_whats_new");
    expect(r?.activeTools).not.toContain("run_backtest");
    expect(r!.activeTools!.length).toBeLessThan(Object.keys(def.tools).length);
    expect(def.activeToolCounts).toEqual([r!.activeTools!.length]);
  });

  it("answers a buy/sell call or an off-topic question in one step with no tools", async () => {
    for (const question of ["Should we sell AXP?", "Who won the World Series?"]) {
      const def = await buildAgentDefinition({ ...base, viewer: exec, chatId: "c1", purpose: "chat", routing: { question, priorTools: [] } });
      const r = def.prepareStep({ stepNumber: 0, messages: [{ role: "user", content: "q" }], steps: [] });
      expect(r).toMatchObject({ toolChoice: "none", activeTools: [] });
      expect(r?.instructions).toMatch(/^SYS\n\nTHIS REPLY: /);
      expect(def.activeToolCounts).toEqual([0]);
    }
  });

  it("turns on what find_tools asks for from the next step", async () => {
    const def = await buildAgentDefinition({ ...base, viewer: exec, chatId: "c1", purpose: "chat", routing: { question: "what's going on?", priorTools: [] } });
    const step0 = def.prepareStep({ stepNumber: 0, messages: [{ role: "user", content: "q" }], steps: [] });
    expect(step0?.activeTools).toContain("find_tools");
    expect(step0?.activeTools).not.toContain("run_backtest");
    const out = await (def.tools.find_tools as { execute: (i: unknown, o: unknown) => Promise<{ data: { enabled: string[] } }> }).execute({ tools: ["book"] }, { toolCallId: "t", messages: [] });
    expect(out.data.enabled).toContain("get_daily_performance");
    const step1 = def.prepareStep({ stepNumber: 1, messages: [{ role: "user", content: "q" }], steps: [{ toolCalls: [{ toolName: "find_tools" }] }] });
    expect(step1?.activeTools).toEqual(expect.arrayContaining(["get_daily_performance", "run_backtest"]));
  });

  it("gives a job no find_tools", async () => {
    const def = await buildAgentDefinition({ ...base, purpose: "prep" });
    expect(def.tools).not.toHaveProperty("find_tools");
  });

  it("offers every tool to a job, which has no routing", async () => {
    const def = await buildAgentDefinition({ ...base, purpose: "prep" });
    expect(def.prepareStep({ stepNumber: 0, messages: [{ role: "user", content: "q" }], steps: [] })).toBeUndefined();
    expect(def.activeToolCounts).toEqual([Object.keys(def.tools).length]);
  });
});
