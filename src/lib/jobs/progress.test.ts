import { describe, expect, it } from "vitest";
import { createJobReporter } from "./progress";

describe("createJobReporter", () => {
  it("batches events, flushes on close, preserves order", async () => {
    const writes: unknown[][] = [];
    const r = createJobReporter("run", { flushMs: 10_000, maxBuffer: 25, write: async (ev) => void writes.push(ev) });
    for (let i = 0; i < 30; i++) r.item("symbol", i + 1, 30, { symbol: `S${i}` });
    await r.flush();
    expect(writes.map((w) => w.length)).toEqual([25, 5]);
    r.step("done");
    await r.close();
    expect(writes.length).toBe(3);
    const all = writes.flat() as { kind: string; name: string; n?: number; at: string; detail?: Record<string, unknown> }[];
    expect(all.map((e) => e.n ?? e.name)).toEqual([...Array.from({ length: 30 }, (_, i) => i + 1), "done"]);
    expect(all[0]).toMatchObject({ kind: "item", name: "symbol", n: 1, of: 30, detail: { symbol: "S0" } });
    expect(typeof all[0].at).toBe("string");
    r.step("after close");
    await r.flush();
    expect(writes.length).toBe(3);
  });

  it("flushes on the timer", async () => {
    const writes: unknown[][] = [];
    const r = createJobReporter("run", { flushMs: 5, write: async (ev) => void writes.push(ev) });
    r.step("a");
    r.step("b");
    await new Promise((res) => setTimeout(res, 25));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(2);
    await r.close();
  });

  it("never throws when the write fails and keeps going", async () => {
    let calls = 0;
    const r = createJobReporter("run", {
      flushMs: 10_000,
      write: async () => {
        calls++;
        if (calls === 1) throw new Error("db down");
      },
    });
    r.step("a");
    await expect(r.flush()).resolves.toBeUndefined();
    r.step("b");
    await expect(r.close()).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });
});
