import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { z } from "zod";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/drive/summarize", () => ({
  summaryModelId: async () => "configured-summary-model",
}));
vi.mock("@/lib/agent/model", () => ({ chatModel: vi.fn() }));
import { generateStructured } from "./generate";
import { chatModel } from "@/lib/agent/model";

const schema = z.object({ takeaway: z.string().min(1) });
function completion(content: string | null, finish = "stop", reasoning?: string) {
  return Response.json({
    id: "test",
    model: "test-model",
    created: 1,
    object: "chat.completion",
    choices: [
      {
        index: 0,
        finish_reason: finish,
        message: { role: "assistant", content, reasoning },
      },
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 700,
      total_tokens: 720,
      completion_tokens_details: { reasoning_tokens: reasoning ? 700 : 0 },
    },
  });
}
function modelWith(fetcher: typeof fetch) {
  return createOpenRouter({
    apiKey: "test-only-not-a-key",
    fetch: fetcher,
  }).chat("test-model");
}
afterEach(() => vi.restoreAllMocks());
describe("actual SDK / OpenRouter summary responses", () => {
  it("reproduces the old 700-token reasoning-only failure without a parsing mismatch", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => completion(null, "length", "Reasoning consumed all output tokens"));
    const result = await generateText({
      model: modelWith(fetcher),
      prompt: "Summarize",
      maxOutputTokens: 700,
    });
    expect(result.text).toBe("");
    expect(result.finishReason).toBe("length");
    expect(result.reasoningText).toContain("consumed all");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).max_tokens).toBe(700);
  });
  it("retries reasoning-only output with room for the answer, then validates the structured result", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(completion(null, "length", "private reasoning"))
      .mockResolvedValueOnce(completion('{"takeaway":"Revenue increased 29% YoY."}'));
    const result = await generateStructured({
      model: modelWith(fetcher),
      schema,
      instructions: "Summarize",
      prompt: "29% growth",
    });
    expect(result.takeaway).toBe("Revenue increased 29% YoY.");
    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies.map((b) => b.max_tokens)).toEqual([8000, 12000]);
    expect(bodies[0].response_format.type).toBe("json_schema");
    expect(bodies[0].reasoning.effort).toBe("low");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private reasoning");
  });
  it("uses validated JSON fallback only when the provider rejects response_format", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message: "response_format json_schema is not supported",
              code: 400,
            },
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(completion('```json\n{"takeaway":"Cautious outlook"}\n```'));
    expect(
      await generateStructured({
        model: modelWith(fetcher),
        schema,
        instructions: "Summarize",
        prompt: "Caution",
      }),
    ).toEqual({ takeaway: "Cautious outlook" });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).response_format).toBeUndefined();
  });
  it("rejects schema mismatches even if the provider says stop", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn().mockImplementation(async () => completion('{"wrongField":"not a summary"}'));
    await expect(
      generateStructured({
        model: modelWith(fetcher),
        schema,
        instructions: "Summarize",
        prompt: "Call",
      }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("honors the existing configured summary model", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => completion('{"takeaway":"Outlook"}'));
    vi.mocked(chatModel).mockReturnValue(modelWith(fetcher));
    await generateStructured({
      schema,
      instructions: "Summarize",
      prompt: "Call",
    });
    expect(chatModel).toHaveBeenCalledWith("configured-summary-model");
  });
  it("never returns provider messages or payloads in diagnostic logs", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ error: { message: "secret-provider-payload", code: 401 } }, { status: 401 }));
    await expect(
      generateStructured({
        model: modelWith(fetcher),
        schema,
        instructions: "Summarize",
        prompt: "Call",
      }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-provider-payload");
  });
});
