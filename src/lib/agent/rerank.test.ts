import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ rerankModelId: vi.fn(async () => "nvidia/llama-nemotron-rerank-vl-1b-v2:free") }));
vi.mock("./retrieval-models", () => ({ rerankModelId: settings.rerankModelId }));

import { rerank } from "./rerank";

const docs = [
  { id: "a", text: "Alpha passage" },
  { id: "b", text: "Beta passage" },
  { id: "c", text: "Gamma passage" },
];

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "sk-test";
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

describe("rerank", () => {
  it("parses the response into ids ordered by relevance and sends top_n", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [{ index: 2, relevance_score: 0.2 }, { index: 0, relevance_score: 0.9 }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await rerank("query", docs, 2);
    expect(r).toEqual([
      { id: "a", score: 0.9 },
      { id: "c", score: 0.2 },
    ]);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ model: "nvidia/llama-nemotron-rerank-vl-1b-v2:free", query: "query", top_n: 2, documents: ["Alpha passage", "Beta passage", "Gamma passage"] });
  });
  it("returns null on 429, on 'off', without a key, and on malformed responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("slow down", { status: 429 })));
    expect(await rerank("q", docs, 3)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ index: 9, relevance_score: 1 }] }), { status: 200 })));
    expect(await rerank("q", docs, 3)).toBeNull();
    settings.rerankModelId.mockResolvedValueOnce("off");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await rerank("q", docs, 3)).toBeNull();
    delete process.env.OPENROUTER_API_KEY;
    expect(await rerank("q", docs, 3)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await rerank("q", [], 3)).toEqual([]);
  });
});
