/** Reciprocal rank fusion and the per-document cap for hybrid search. Pure. */

export const RRF_K = 60;

export type Ranked = { key: string };

/**
 * Fuse several ranked lists (best first) into one: score(key) = Σ 1 / (k + rank). A candidate appearing high in
 * both the vector and the full-text list beats one that tops only one of them. Ties keep first-list order.
 */
export function rrfFuse<T extends Ranked>(lists: T[][], k = RRF_K): (T & { fused: number })[] {
  const scores = new Map<string, { item: T; fused: number; first: number }>();
  let order = 0;
  for (const list of lists) {
    list.forEach((item, rank) => {
      const s = scores.get(item.key);
      const inc = 1 / (k + rank + 1);
      if (s) s.fused += inc;
      else scores.set(item.key, { item, fused: inc, first: order++ });
    });
  }
  return [...scores.values()].sort((a, b) => b.fused - a.fused || a.first - b.first).map((s) => ({ ...s.item, fused: s.fused }));
}

/** Keep at most `perDoc` hits per document and at most `limit` overall, preserving order. */
export function capPerDocument<T extends { documentId: string }>(hits: T[], perDoc: number, limit: number): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const h of hits) {
    const n = counts.get(h.documentId) ?? 0;
    if (n >= perDoc) continue;
    counts.set(h.documentId, n + 1);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
