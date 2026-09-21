import { rerankModelId } from "./retrieval-models";

/** Each candidate passage is cut to this before reranking; the NVIDIA reranker allows 10,240 tokens per pair. */
export const RERANK_DOC_CHARS = 2_000;

export type RerankDoc = { id: string; text: string };
export type RerankHit = { id: string; score: number };

/**
 * Order candidate passages by relevance to the query with OpenRouter's rerank endpoint. Returns null when
 * reranking is off, unconfigured, rate limited, or fails for any reason; callers keep their fused order then.
 */
export async function rerank(query: string, docs: RerankDoc[], topN: number): Promise<RerankHit[] | null> {
  if (!docs.length) return [];
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  let model: string;
  try {
    model = await rerankModelId();
  } catch {
    return null;
  }
  if (model === "off") return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/rerank", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "HTTP-Referer": process.env.APP_URL ?? "", "X-Title": "The Owl's Nest" },
      body: JSON.stringify({ model, query: query.slice(0, RERANK_DOC_CHARS), documents: docs.map((d) => d.text.slice(0, RERANK_DOC_CHARS)), top_n: Math.max(1, Math.min(topN, docs.length)) }),
    });
    if (!res.ok) {
      if (res.status !== 429) console.warn(`[rerank] ${model} returned ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return null;
    }
    const j = (await res.json()) as { results?: { index: number; relevance_score: number }[] };
    const out: RerankHit[] = [];
    for (const r of j.results ?? []) {
      if (!Number.isInteger(r.index) || r.index < 0 || r.index >= docs.length || typeof r.relevance_score !== "number") continue;
      out.push({ id: docs[r.index].id, score: r.relevance_score });
    }
    if (!out.length) return null;
    return out.sort((a, b) => b.score - a.score);
  } catch (e) {
    console.warn("[rerank] failed", e instanceof Error ? e.message : e);
    return null;
  }
}
