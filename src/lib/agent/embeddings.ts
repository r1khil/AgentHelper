import "server-only";
import { parseTokenLimit, shrinkInputs } from "./embed-limits";
import { embeddingDims, embeddingModelId } from "./retrieval-models";

const BATCH = 64;

/** OpenRouter answered 429: the free-model budget (20 requests/min, 50 or 1,000/day) is spent. Callers stop, never retry-sleep. */
export class RateLimited extends Error {
  readonly status = 429;
  constructor(message = "OpenRouter rate limit reached for the embedding model; try again later") {
    super(message);
    this.name = "RateLimited";
  }
}

export function embeddingConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY) && process.env.OPENROUTER_EMBEDDINGS !== "off";
}

export type EmbedResult = { model: string; dims: number; vectors: number[][] };

function check(vectors: number[][], expected: number, dims: number, model: string) {
  if (vectors.length !== expected) throw new Error(`Embedding provider returned ${vectors.length} vectors for ${expected} inputs`);
  for (const v of vectors) if (v.length !== dims) throw new Error(`${model} returned ${v.length}-dimension vectors; the registry says ${dims} (fix EMBEDDING_MODELS)`);
  return vectors;
}

/**
 * OpenRouter's OpenAI-compatible embeddings endpoint. The fetch path is used for every model so free-tier headers stay
 * consistent. A 422 "input length N exceeds model maximum M" (chunks are cut by characters, tokens vary with the
 * text) shrinks the batch by that ratio and retries, up to three times, so one dense table does not mark the whole
 * document unembeddable.
 */
async function embedViaFetch(model: string, input: string[], attempt = 0): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json", "HTTP-Referer": process.env.APP_URL ?? "", "X-Title": "The Owl's Nest" },
    body: JSON.stringify({ model, input }),
  });
  if (res.status === 429) throw new RateLimited(`OpenRouter rate limit reached for ${model}: ${(await res.text()).slice(0, 160)}`);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    const limit = res.status === 422 ? parseTokenLimit(body) : null;
    if (limit && attempt < 3) return embedViaFetch(model, shrinkInputs(input, limit), attempt + 1);
    throw new Error(`Embeddings endpoint returned ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  const rows = [...(j.data ?? [])].sort((a, b) => a.index - b.index);
  return rows.map((r) => r.embedding);
}

/**
 * Embeddings for a list of strings, in order, with the model that produced them. Batched; throws on a dimension
 * mismatch so nothing bad is stored, and throws RateLimited (no retry) when OpenRouter says the budget is spent.
 */
export async function embedTexts(values: string[]): Promise<EmbedResult> {
  if (!embeddingConfigured()) throw new Error("Embeddings are not configured (OPENROUTER_API_KEY / OPENROUTER_EMBEDDINGS)");
  const model = await embeddingModelId();
  const dims = embeddingDims(model);
  const vectors: number[][] = [];
  for (let i = 0; i < values.length; i += BATCH) {
    const batch = values.slice(i, i + BATCH);
    vectors.push(...check(await embedViaFetch(model, batch), batch.length, dims, model));
  }
  return { model, dims, vectors };
}
