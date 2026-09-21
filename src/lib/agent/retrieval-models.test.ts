import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("@/lib/settings", () => ({ getSetting: async (key: string) => store.values.get(key) ?? null }));

import { EMBEDDING_MODELS, RERANK_MODELS, embeddingDims, embeddingModelId, embeddingModelSlug, rerankModelId } from "./retrieval-models";

beforeEach(() => {
  store.values.clear();
});
afterEach(() => {
  delete process.env.OPENROUTER_EMBEDDING_MODEL;
  delete process.env.OPENROUTER_RERANK_MODEL;
});

describe("retrieval model resolution", () => {
  it("prefers the Admin setting, then the environment, then the registry default", async () => {
    expect(await embeddingModelId()).toBe(EMBEDDING_MODELS[0].id);
    process.env.OPENROUTER_EMBEDDING_MODEL = "perplexity/pplx-embed-v1-0.6b";
    expect(await embeddingModelId()).toBe("perplexity/pplx-embed-v1-0.6b");
    store.values.set("embedding_model", "openai/text-embedding-3-small");
    expect(await embeddingModelId()).toBe("openai/text-embedding-3-small");

    expect(await rerankModelId()).toBe(RERANK_MODELS[0].id);
    process.env.OPENROUTER_RERANK_MODEL = "off";
    expect(await rerankModelId()).toBe("off");
    store.values.set("rerank_model", "cohere/rerank-v3.5");
    expect(await rerankModelId()).toBe("cohere/rerank-v3.5");
  });
  it("knows every registered model's dimensions and refuses unknown ids", () => {
    expect(embeddingDims("openai/text-embedding-3-small")).toBe(1536);
    expect(embeddingDims("perplexity/pplx-embed-v1-0.6b")).toBe(1024);
    expect(embeddingDims("nvidia/nemotron-3-embed-1b:free")).toBe(2048);
    expect(() => embeddingDims("someone/else")).toThrow(/Unknown embedding model/);
    for (const m of EMBEDDING_MODELS) expect(m.dims).toBeLessThanOrEqual(4000); // halfvec HNSW limit
  });
  it("derives index-safe slugs", () => {
    expect(embeddingModelSlug("nvidia/nemotron-3-embed-1b:free")).toBe("nvidia_nemotron_3_embed_1b_free");
  });
});
