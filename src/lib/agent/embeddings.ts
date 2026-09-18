import "server-only";
import { embedMany } from "ai";
import { openrouterProvider } from "./model";

export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
/** Fixed by the drive_chunks.embedding column; only 1536-dimension models are valid. */
export const EMBEDDING_DIMS = 1536;
const BATCH = 64;

export function embeddingConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY) && process.env.OPENROUTER_EMBEDDINGS !== "off";
}

export function embeddingModelId() {
  return process.env.OPENROUTER_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

function check(vectors: number[][], expected: number) {
  if (vectors.length !== expected) throw new Error(`Embedding provider returned ${vectors.length} vectors for ${expected} inputs`);
  for (const v of vectors) if (v.length !== EMBEDDING_DIMS) throw new Error(`Embedding has ${v.length} dimensions; the index expects ${EMBEDDING_DIMS} (check OPENROUTER_EMBEDDING_MODEL)`);
  return vectors;
}

/** Fallback for providers that do not expose embeddings through the SDK: OpenRouter's OpenAI-compatible endpoint. */
async function embedViaFetch(model: string, input: string[]): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json", "HTTP-Referer": process.env.APP_URL ?? "", "X-Title": "Owl Fund Workspace" },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`Embeddings endpoint returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  const rows = [...(j.data ?? [])].sort((a, b) => a.index - b.index);
  return rows.map((r) => r.embedding);
}

/** Embeddings for a list of strings, in order. Batched; throws on a dimension mismatch so nothing bad is stored. */
export async function embedTexts(values: string[]): Promise<number[][]> {
  if (!embeddingConfigured()) throw new Error("Embeddings are not configured (OPENROUTER_API_KEY / OPENROUTER_EMBEDDINGS)");
  if (!values.length) return [];
  const model = embeddingModelId();
  const out: number[][] = [];
  for (let i = 0; i < values.length; i += BATCH) {
    const batch = values.slice(i, i + BATCH);
    const vectors =
      process.env.OPENROUTER_EMBEDDINGS_VIA_FETCH === "1"
        ? await embedViaFetch(model, batch)
        : (await embedMany({ model: openrouterProvider().textEmbeddingModel(model), values: batch, maxRetries: 2 })).embeddings;
    out.push(...check(vectors, batch.length));
  }
  return out;
}
