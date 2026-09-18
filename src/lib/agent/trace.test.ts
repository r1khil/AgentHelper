import { describe, expect, it } from "vitest";
import { instrumentTools } from "./trace";
import { createTraceSink, currentTrace } from "@/lib/trace/context";

describe("instrumentTools", () => {
  it("preserves outputs, stamps the tool call id and reports swallowed errors", async () => {
    const sink = createTraceSink();
    const tools = {
      ok: { execute: async (input: { x: number }) => ({ data: input.x * 2, sources: [{ id: "a" }], error: undefined }) },
      bad: { execute: async () => ({ data: null, sources: [], error: "nope" }) },
      noExec: { description: "no execute" },
    };
    const wrapped = instrumentTools(tools as never, sink) as typeof tools;
    let seenInside: unknown;
    const t = { ...wrapped.ok, execute: async (i: { x: number }, o: { toolCallId: string }) => { seenInside = currentTrace(); return (wrapped.ok.execute as (a: unknown, b: unknown) => Promise<unknown>)(i, o); } };
    expect(await t.execute({ x: 2 }, { toolCallId: "c1" })).toEqual({ data: 4, sources: [{ id: "a" }], error: undefined });
    expect(seenInside).toBeUndefined();
    await (wrapped.bad.execute as (a: unknown, b: unknown) => Promise<unknown>)({}, { toolCallId: "c2" });
    expect(wrapped.noExec).toBe(tools.noExec);
    const ev = sink.events();
    expect(ev.map((e) => e.t)).toEqual(["tool.start", "tool.end", "tool.start", "tool.end"]);
    expect(ev[0]).toMatchObject({ tool: "ok", toolCallId: "c1", args: { x: 2 } });
    expect(ev[1]).toMatchObject({ tool: "ok", toolCallId: "c1", ok: true, sources: 1 });
    expect(ev[3]).toMatchObject({ tool: "bad", toolCallId: "c2", ok: false, error: "nope", sources: 0 });
  });

  it("runs the tool inside the trace context", async () => {
    const sink = createTraceSink();
    const tools = { probe: { execute: async () => ({ data: currentTrace() === sink, sources: [] }) } };
    const wrapped = instrumentTools(tools as never, sink) as typeof tools;
    const out = (await (wrapped.probe.execute as (a: unknown, b: unknown) => Promise<{ data: boolean }>)({}, { toolCallId: "c" })).data;
    expect(out).toBe(true);
  });
});
