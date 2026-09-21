import { getSetting } from "@/lib/settings";

/**
 * Embedding and reranking models an admin can pick on the Admin page. Mirrors AGENT_MODELS in model.ts.
 * `dims` is the vector length the model returns; document_chunks stores vectors of any length (halfvec without a
 * typmod) and gets one partial HNSW index per model, so switching models never needs a schema change.
 *
 * Nemotron's dimension count comes from NVIDIA's model card (2048) and could not be verified against OpenRouter
 * from this checkout (no API key). embedTexts() checks every vector against this table and refuses to store a
 * mismatch, so a wrong entry surfaces as an ingest error, never as corrupt data. Fix the number here if it does.
 */
export const EMBEDDING_MODELS = [
  { id: "nvidia/nemotron-3-embed-1b:free", label: "Nemotron 3 Embed 1B (free)", dims: 2048, maxTokens: 32768 },
  { id: "perplexity/pplx-embed-v1-0.6b", label: "Perplexity Embed 0.6B", dims: 1024, maxTokens: 32000 },
  { id: "openai/text-embedding-3-small", label: "OpenAI text-embedding-3-small", dims: 1536, maxTokens: 8192 },
] as const;

export const RERANK_MODELS = [
  { id: "nvidia/llama-nemotron-rerank-vl-1b-v2:free", label: "Nemotron Rerank VL 1B (free)" },
  { id: "cohere/rerank-v3.5", label: "Cohere Rerank 3.5" },
  { id: "off", label: "Off (fused ranking only)" },
] as const;

export type EmbeddingModelId = (typeof EMBEDDING_MODELS)[number]["id"];
export type RerankModelId = (typeof RERANK_MODELS)[number]["id"];

/** Keys in app_settings holding the admin's choices. */
export const EMBEDDING_MODEL_SETTING = "embedding_model";
export const RERANK_MODEL_SETTING = "rerank_model";

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModelId = EMBEDDING_MODELS[0].id;
export const DEFAULT_RERANK_MODEL: RerankModelId = RERANK_MODELS[0].id;

export function isEmbeddingModelId(id: string): id is EmbeddingModelId {
  return EMBEDDING_MODELS.some((m) => m.id === id);
}

export function isRerankModelId(id: string): id is RerankModelId {
  return RERANK_MODELS.some((m) => m.id === id);
}

/** Vector length for a registered embedding model. Throws for ids outside the registry so nothing unknown is stored. */
export function embeddingDims(id: string): number {
  const m = EMBEDDING_MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown embedding model "${id}"; add it to EMBEDDING_MODELS with its dimension count`);
  return m.dims;
}

export function embeddingLabel(id: string): string {
  return EMBEDDING_MODELS.find((x) => x.id === id)?.label ?? id;
}

export function rerankLabel(id: string): string {
  return RERANK_MODELS.find((x) => x.id === id)?.label ?? id;
}

/** The admin's choice from the Admin page, else OPENROUTER_EMBEDDING_MODEL, else the first registry entry. */
export async function embeddingModelId(): Promise<string> {
  const chosen = await getSetting(EMBEDDING_MODEL_SETTING);
  return chosen || process.env.OPENROUTER_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

/** The admin's choice from the Admin page, else OPENROUTER_RERANK_MODEL, else the first registry entry. */
export async function rerankModelId(): Promise<string> {
  const chosen = await getSetting(RERANK_MODEL_SETTING);
  return chosen || process.env.OPENROUTER_RERANK_MODEL || DEFAULT_RERANK_MODEL;
}

/** Index-safe slug for a model id, used in the per-model HNSW index names. */
export function embeddingModelSlug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}
