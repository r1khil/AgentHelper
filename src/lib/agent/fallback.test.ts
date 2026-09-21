import { describe, expect, it, vi } from "vitest";
import { APICallError, type LanguageModelV4 } from "@ai-sdk/provider";
import { isFallbackError, withModelFallback } from "./fallback";

const apiError = (statusCode: number) => new APICallError({ message: `status ${statusCode}`, url: "u", requestBodyValues: {}, statusCode });

function fake(id: string, fail?: unknown): LanguageModelV4 & { calls: number } {
  const m = {
    specificationVersion: "v4" as const,
    provider: "test",
    modelId: id,
    supportedUrls: {},
    calls: 0,
    doGenerate: vi.fn(async () => {
      m.calls++;
      if (fail) throw fail;
      return { content: [{ type: "text", text: id }] } as unknown as Awaited<ReturnType<LanguageModelV4["doGenerate"]>>;
    }),
    doStream: vi.fn(async () => {
      m.calls++;
      if (fail) throw fail;
      return { stream: new ReadableStream() } as unknown as Awaited<ReturnType<LanguageModelV4["doStream"]>>;
    }),
  };
  return m;
}

describe("isFallbackError", () => {
  it("accepts rate limits and server errors", () => {
    expect(isFallbackError(apiError(429))).toBe(true);
    expect(isFallbackError(apiError(503))).toBe(true);
  });
  it("rejects client errors and unrelated failures", () => {
    expect(isFallbackError(apiError(400))).toBe(false);
    expect(isFallbackError(apiError(401))).toBe(false);
    expect(isFallbackError(new Error("boom"))).toBe(false);
  });
});

describe("withModelFallback", () => {
  it("returns the primary untouched when there is a single id", () => {
    const a = fake("a");
    expect(withModelFallback(["a", "a"], () => a)).toBe(a);
  });

  it("moves to the next model on a 429 and reports the switch", async () => {
    const built: Record<string, ReturnType<typeof fake>> = { a: fake("a", apiError(429)), b: fake("b") };
    const events: unknown[] = [];
    const m = withModelFallback(["a", "b"], (id) => built[id], (e) => events.push(e));
    const r = (await m.doGenerate({} as never)) as unknown as { content: { text: string }[] };
    expect(r.content[0].text).toBe("b");
    expect(events).toEqual([{ from: "a", to: "b", error: "status 429" }]);
    expect(m.modelId).toBe("a");
  });

  it("does not fall back on a client error", async () => {
    const built: Record<string, ReturnType<typeof fake>> = { a: fake("a", apiError(400)), b: fake("b") };
    const m = withModelFallback(["a", "b"], (id) => built[id]);
    await expect(m.doStream({} as never)).rejects.toThrow("status 400");
    expect(built.b.calls).toBe(0);
  });

  it("rethrows the last error when every model fails", async () => {
    const built: Record<string, ReturnType<typeof fake>> = { a: fake("a", apiError(429)), b: fake("b", apiError(502)) };
    const m = withModelFallback(["a", "b"], (id) => built[id]);
    await expect(m.doGenerate({} as never)).rejects.toThrow("status 502");
  });

  it("builds each model lazily and only once", async () => {
    const make = vi.fn((id: string) => fake(id, id === "a" ? apiError(429) : undefined));
    const m = withModelFallback(["a", "b", "c"], make);
    await m.doGenerate({} as never);
    await m.doGenerate({} as never);
    expect(make).toHaveBeenCalledTimes(2);
  });
});
