import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { driveChunks, driveFiles, type DriveDocKind } from "@/db/schema";
import { embedTexts } from "@/lib/agent/embeddings";
import type { Chunk } from "./chunk";
import type { DriveFileMeta } from "./index";

/** Replace a file's chunks with a fresh set (delete then insert). Returns the number stored. */
export async function replaceFileChunks(file: Pick<DriveFileMeta, "id" | "holdingId" | "ticker">, chunks: Chunk[], vectors: number[][], model: string): Promise<number> {
  if (chunks.length !== vectors.length) throw new Error("chunk/vector count mismatch");
  await db.transaction(async (tx) => {
    await tx.delete(driveChunks).where(eq(driveChunks.fileId, file.id));
    for (let i = 0; i < chunks.length; i += 100) {
      const slice = chunks.slice(i, i + 100).map((c, j) => ({ fileId: file.id, holdingId: file.holdingId, ticker: file.ticker, seq: c.seq, text: c.text, embedding: vectors[i + j], model }));
      if (slice.length) await tx.insert(driveChunks).values(slice);
    }
  });
  return chunks.length;
}

export type ChunkHit = { fileId: string; seq: number; text: string; score: number; meta: Pick<DriveFileMeta, "id" | "name" | "kind" | "ticker" | "path" | "mimeType" | "modifiedTime" | "webViewLink" | "docDate"> };

/** Nearest chunks by cosine similarity, at most `perFile` per document. The query is embedded once. */
export async function searchChunks(p: { query: string; ticker?: string; holdingId?: string; kind?: DriveDocKind; limit?: number; perFile?: number }): Promise<ChunkHit[]> {
  const limit = p.limit ?? 6;
  const perFile = p.perFile ?? 2;
  const [vec] = await embedTexts([p.query]);
  const literal = JSON.stringify(vec);
  const distance = sql<number>`${driveChunks.embedding} <=> ${literal}::vector`;
  const conds = [];
  if (p.ticker) conds.push(eq(driveChunks.ticker, p.ticker.toUpperCase()));
  if (p.holdingId) conds.push(eq(driveChunks.holdingId, p.holdingId));
  if (p.kind) conds.push(eq(driveFiles.kind, p.kind));
  const rows = await db
    .select({
      fileId: driveChunks.fileId,
      seq: driveChunks.seq,
      text: driveChunks.text,
      distance: distance.mapWith(Number),
      id: driveFiles.id,
      name: driveFiles.name,
      kind: driveFiles.kind,
      fileTicker: driveFiles.ticker,
      path: driveFiles.path,
      mimeType: driveFiles.mimeType,
      modifiedTime: driveFiles.modifiedTime,
      webViewLink: driveFiles.webViewLink,
      docDate: driveFiles.docDate,
    })
    .from(driveChunks)
    .innerJoin(driveFiles, eq(driveFiles.id, driveChunks.fileId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(distance)
    .limit(limit * 3);
  const perFileCount = new Map<string, number>();
  const out: ChunkHit[] = [];
  for (const r of rows) {
    const n = perFileCount.get(r.fileId) ?? 0;
    if (n >= perFile) continue;
    perFileCount.set(r.fileId, n + 1);
    out.push({
      fileId: r.fileId,
      seq: r.seq,
      text: r.text,
      score: +(1 - r.distance).toFixed(4),
      meta: { id: r.id, name: r.name, kind: r.kind, ticker: r.fileTicker, path: r.path, mimeType: r.mimeType, modifiedTime: r.modifiedTime, webViewLink: r.webViewLink, docDate: r.docDate },
    });
    if (out.length >= limit) break;
  }
  return out;
}
