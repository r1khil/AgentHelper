import "server-only";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { documentChunks, documents, driveFiles, type DocumentKind, type DriveDocKind } from "@/db/schema";
import { RateLimited, embedTexts, embeddingConfigured } from "@/lib/agent/embeddings";
import { rerank } from "@/lib/agent/rerank";
import { embeddingDims, embeddingModelId, embeddingModelSlug } from "@/lib/agent/retrieval-models";
import { cosineDistance, modelLiteral } from "@/lib/agent/vector-sql";
import { documentHeadingColumn } from "@/lib/drive/index";
import { capPerDocument, rrfFuse } from "./fusion";
import type { SectionChunk } from "./sections";

const CANDIDATES = 30;

/** Replace a document's chunks with a fresh set (delete then insert). Returns the number stored. */
export async function replaceChunks(doc: { id: string; holdingId: string | null; ticker: string | null }, chunks: SectionChunk[], vectors: number[][], model: string): Promise<number> {
  if (chunks.length !== vectors.length) throw new Error("chunk/vector count mismatch");
  await db.transaction(async (tx) => {
    await tx.delete(documentChunks).where(eq(documentChunks.documentId, doc.id));
    for (let i = 0; i < chunks.length; i += 100) {
      const slice = chunks.slice(i, i + 100).map((c, j) => ({ documentId: doc.id, holdingId: doc.holdingId, ticker: doc.ticker, seq: c.seq, section: c.section, text: c.text, embedding: vectors[i + j], model }));
      if (slice.length) await tx.insert(documentChunks).values(slice);
    }
  });
  return chunks.length;
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * The partial HNSW index for one embedding model. Idempotent; runs outside a transaction so it can be called from
 * the Admin action when a model is switched. Also covers agent_memories, which share the model.
 */
export async function ensureEmbeddingIndex(model: string): Promise<void> {
  const dims = embeddingDims(model);
  const slug = embeddingModelSlug(model);
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "document_chunks_hnsw_${slug}" ON "document_chunks" USING hnsw (("embedding"::extensions.halfvec(${dims})) extensions.halfvec_cosine_ops) WHERE "model" = ${quote(model)}`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "agent_memories_hnsw_${slug}" ON "agent_memories" USING hnsw (("embedding"::extensions.halfvec(${dims})) extensions.halfvec_cosine_ops) WHERE "embed_model" = ${quote(model)}`));
}

export type ChunkHitMeta = {
  id: string;
  kind: DocumentKind;
  title: string;
  form: string | null;
  url: string | null;
  publisher: string | null;
  publishedAt: Date | null;
  docDate: string | null;
  ticker: string | null;
  holdingId: string | null;
  /** Drive-only fields. */
  name: string;
  driveKind: DriveDocKind | null;
  path: string | null;
  mimeType: string | null;
  modifiedTime: Date | null;
  webViewLink: string | null;
  documentHeading: string | null;
};

export type ChunkHit = { documentId: string; seq: number; section: string | null; text: string; score: number; via: "hybrid" | "vector" | "text"; meta: ChunkHitMeta };

export type SearchParams = { query: string; ticker?: string; holdingId?: string; kinds?: DocumentKind[]; driveKind?: DriveDocKind; limit?: number; perDoc?: number };

const hitColumns = {
  documentId: documentChunks.documentId,
  seq: documentChunks.seq,
  section: documentChunks.section,
  text: documentChunks.text,
  id: documents.id,
  kind: documents.kind,
  title: documents.title,
  form: documents.form,
  url: documents.url,
  publisher: documents.publisher,
  publishedAt: documents.publishedAt,
  docDate: documents.docDate,
  ticker: documents.ticker,
  holdingId: documents.holdingId,
  name: sql<string>`coalesce(${driveFiles.name}, ${documents.title})`,
  driveKind: driveFiles.kind,
  path: driveFiles.path,
  mimeType: driveFiles.mimeType,
  modifiedTime: driveFiles.modifiedTime,
  webViewLink: driveFiles.webViewLink,
  documentHeading: documentHeadingColumn,
};

type Row = { documentId: string; seq: number; section: string | null; text: string } & ChunkHitMeta;

function filters(p: SearchParams): SQL[] {
  const conds: SQL[] = [];
  if (p.ticker) conds.push(eq(documentChunks.ticker, p.ticker.toUpperCase()));
  if (p.holdingId) conds.push(eq(documentChunks.holdingId, p.holdingId));
  if (p.kinds?.length) conds.push(inArray(documents.kind, p.kinds));
  if (p.driveKind) conds.push(eq(driveFiles.kind, p.driveKind));
  return conds;
}

function base() {
  return db.select(hitColumns).from(documentChunks).innerJoin(documents, eq(documents.id, documentChunks.documentId)).leftJoin(driveFiles, eq(driveFiles.documentId, documents.id));
}

async function vectorCandidates(p: SearchParams): Promise<{ rows: Row[]; model: string } | null> {
  if (!embeddingConfigured()) return null;
  try {
    const { model, vectors } = await embedTexts([p.query]);
    const distance = cosineDistance(documentChunks.embedding, vectors[0], model);
    const rows = await base()
      .where(and(sql`${documentChunks.model} = ${modelLiteral(model)}`, ...filters(p)))
      .orderBy(distance)
      .limit(CANDIDATES);
    return { rows: rows as Row[], model };
  } catch (e) {
    if (!(e instanceof RateLimited)) console.warn("[search] vector leg failed; using full text only", e instanceof Error ? e.message : e);
    return null;
  }
}

async function textCandidates(p: SearchParams, model: string | null): Promise<Row[]> {
  const q = sql`websearch_to_tsquery('english', ${p.query.slice(0, 400)})`;
  const conds = [sql`${documentChunks.tsv} @@ ${q}`, ...filters(p)];
  // Keep the full-text leg on the same model's chunks so a mid-switch corpus does not return duplicate passages.
  if (model) conds.push(sql`${documentChunks.model} = ${modelLiteral(model)}`);
  const rows = await base()
    .where(and(...conds))
    .orderBy(desc(sql`ts_rank_cd(${documentChunks.tsv}, ${q})`))
    .limit(CANDIDATES);
  return rows as Row[];
}

const key = (r: { documentId: string; seq: number }) => `${r.documentId}:${r.seq}`;

/**
 * Hybrid search over the corpus: vector top-30 (current model only) and full-text top-30, fused by reciprocal
 * rank, reranked when a reranker is configured, then capped per document. Works with full text alone when
 * embeddings are off or rate limited. The query is embedded once.
 */
export async function searchChunks(p: SearchParams): Promise<ChunkHit[]> {
  const limit = p.limit ?? 6;
  const perDoc = p.perDoc ?? 2;
  const vec = await vectorCandidates(p);
  const model = vec?.model ?? (embeddingConfigured() ? await embeddingModelId().catch(() => null) : null);
  const text = await textCandidates(p, model);
  const byKey = new Map<string, Row>();
  for (const r of [...(vec?.rows ?? []), ...text]) byKey.set(key(r), r);
  const inVec = new Set((vec?.rows ?? []).map(key));
  const inText = new Set(text.map(key));
  const fused = rrfFuse([(vec?.rows ?? []).map((r) => ({ key: key(r) })), text.map((r) => ({ key: key(r) }))]);
  let ordered = fused.map((f) => ({ key: f.key, score: f.fused }));
  const reranked = ordered.length ? await rerank(p.query, ordered.map((o) => ({ id: o.key, text: byKey.get(o.key)!.text })), limit * 3) : null;
  if (reranked) ordered = reranked.map((r) => ({ key: r.id, score: r.score }));
  const hits: ChunkHit[] = ordered.map((o) => {
    const r = byKey.get(o.key)!;
    const via = inVec.has(o.key) && inText.has(o.key) ? "hybrid" : inVec.has(o.key) ? "vector" : "text";
    const { documentId, seq, section, text: body, ...meta } = r;
    return { documentId, seq, section, text: body, score: +o.score.toFixed(4), via, meta };
  });
  return capPerDocument(hits, perDoc, limit);
}
