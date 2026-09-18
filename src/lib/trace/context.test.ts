import { describe, expect, it } from "vitest";
import { createTraceSink, currentTrace, runWithTrace } from "./context";
import { retry, spaced } from "@/lib/providers/limiter";
import { cached } from "@/lib/providers/cache";

describe("trace sink", () => {
  it("stamps seq, step and the tool call from the async context", () => {
    const sink = createTraceSink();
    sink.setStep(2);
    runWithTrace({ sink, toolCallId: "call-1" }, () => sink.emit({ t: "wait", host: "yahoo", ms: 5 }));
    sink.emit({ t: "tool.end", tool: "x", ms: 1, ok: true, sources: 0, toolCallId: "explicit" });
    const [a, b] = sink.events();
    expect(a).toMatchObject({ seq: 0, step: 2, toolCallId: "call-1", t: "wait" });
    expect(b).toMatchObject({ seq: 1, step: 2, toolCallId: "explicit" });
    expect(typeof a.at).toBe("number");
  });

  it("is absent outside runWithTrace and a broken listener never throws", () => {
    expect(currentTrace()).toBeUndefined();
    const sink = createTraceSink();
    sink.subscribe(() => {
      throw new Error("boom");
    });
    expect(() => sink.emit({ t: "wait", host: "x", ms: 1 })).not.toThrow();
  });

  it("survives the rate limiter queue and retry backoff", async () => {
    const sink = createTraceSink();
    let attempts = 0;
    await runWithTrace({ sink, toolCallId: "c" }, () =>
      spaced("test-host", 1, async () => {
        expect(currentTrace()).toBe(sink);
        return retry(
          async () => {
            attempts++;
            if (attempts < 2) throw new Error("flaky");
            expect(currentTrace()).toBe(sink);
            return "ok";
          },
          3,
          1,
        );
      }),
    );
    const kinds = sink.events().map((e) => e.t);
    expect(kinds).toContain("retry");
    expect(sink.events().every((e) => e.toolCallId === "c")).toBe(true);
  });
});

describe("cached() with a trace", () => {
  it("reports network then memory, and nothing without a sink", async () => {
    const key = `test:${Math.random()}`;
    const fn = async () => ({ hello: "world" });
    await cached(key, 60, fn, { db: false });
    const sink = createTraceSink();
    await runWithTrace({ sink }, async () => {
      await cached(`${key}-2`, 60, fn, { db: false });
      await cached(`${key}-2`, 60, fn, { db: false });
    });
    const fetches = sink.events().filter((e): e is Extract<typeof e, { t: "fetch" }> => e.t === "fetch");
    expect(fetches.map((f) => f.layer)).toEqual(["network", "memory"]);
    expect(fetches[0]).toMatchObject({ host: "test", ok: true, ttlSeconds: 60 });
    expect(fetches[0].bytes).toBeGreaterThan(0);
  });

  it("reports a failed network call and rethrows", async () => {
    const sink = createTraceSink();
    await expect(
      runWithTrace({ sink }, () =>
        cached(`test:fail:${Math.random()}`, 60, async () => {
          throw new Error("upstream down");
        }, { db: false }),
      ),
    ).rejects.toThrow("upstream down");
    expect(sink.events()[0]).toMatchObject({ t: "fetch", layer: "network", ok: false, error: "upstream down" });
  });
});
