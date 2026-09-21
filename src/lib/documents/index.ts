import "server-only";
import { and, count, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { documentChunks, documents, driveFiles, type DocumentInsert, type DocumentRow } from "@/db/schema";

export const DRIVE_PUBLISHER = "Analyst Drive";
export const FILING_PUBLISHER = "SEC EDGAR";

/** The freshness key for a Drive file: its modifiedTime as ISO, so a re-upload requeues every step. */
export function driveVersion(modifiedTime: Date | null | undefined): string {
  return modifiedTime ? modifiedTime.toISOString() : "unknown";
}

export type DriveDocInput = { id: string; name: string; holdingId: string | null; ticker: string | null; webViewLink: string | null; modifiedTime: Date | null };

/** The corpus row for a non-folder Drive file. Text, summary and embedding columns are never touched here. */
export function driveDocumentRow(f: DriveDocInput): DocumentInsert {
  return { id: f.id, kind: "drive", externalId: f.id, holdingId: f.holdingId, ticker: f.ticker, title: f.name, url: f.webViewLink, publisher: DRIVE_PUBLISHER, publishedAt: f.modifiedTime, version: driveVersion(f.modifiedTime) };
}

/** Insert or refresh corpus rows for Drive files and point drive_files.document_id at them. */
export async function upsertDriveDocuments(files: DriveDocInput[]) {
  if (!files.length) return;
  for (let i = 0; i < files.length; i += 200) {
    const slice = files.slice(i, i + 200);
    await db
      .insert(documents)
      .values(slice.map(driveDocumentRow))
      .onConflictDoUpdate({
        target: documents.id,
        set: { holdingId: sql`excluded.holding_id`, ticker: sql`excluded.ticker`, title: sql`excluded.title`, url: sql`excluded.url`, publishedAt: sql`excluded.published_at`, version: sql`excluded.version`, updatedAt: new Date() },
      });
    await db
      .update(driveFiles)
      .set({ documentId: sql`${driveFiles.id}` })
      .where(inArray(driveFiles.id, slice.map((f) => f.id)));
  }
}

export async function deleteDriveDocuments(ids: string[]) {
  if (!ids.length) return;
  await db.delete(documents).where(and(eq(documents.kind, "drive"), inArray(documents.id, ids)));
}

/** Drop corpus rows for Drive files that are no longer indexed (full crawl prune, disconnect). */
export async function pruneDriveDocuments(keepIds: string[]) {
  await db.delete(documents).where(keepIds.length ? and(eq(documents.kind, "drive"), notInArray(documents.id, keepIds)) : eq(documents.kind, "drive"));
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return row ?? null;
}

export type FilingDoc = Pick<DocumentRow, "id" | "title" | "form" | "url" | "publishedAt" | "docDate" | "sectionNote" | "embedFor" | "version" | "textError">;

/** Indexed SEC filings for a holding, newest first, for the holding page and the pinned prompt block. */
export async function listHoldingFilings(holdingId: string, limit = 8): Promise<FilingDoc[]> {
  return db
    .select({ id: documents.id, title: documents.title, form: documents.form, url: documents.url, publishedAt: documents.publishedAt, docDate: documents.docDate, sectionNote: documents.sectionNote, embedFor: documents.embedFor, version: documents.version, textError: documents.textError })
    .from(documents)
    .where(and(eq(documents.kind, "filing"), eq(documents.holdingId, holdingId)))
    .orderBy(desc(documents.publishedAt), desc(documents.createdAt))
    .limit(limit);
}

/** Insert or refresh filing rows; keyed on (kind, external_id) so a re-sync never duplicates. Returns how many were new. */
export async function upsertFilingDocuments(rows: DocumentInsert[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200);
    if (!slice.length) continue;
    const r = await db
      .insert(documents)
      .values(slice)
      .onConflictDoUpdate({
        target: [documents.kind, documents.externalId],
        set: { holdingId: sql`excluded.holding_id`, ticker: sql`excluded.ticker`, title: sql`excluded.title`, url: sql`excluded.url`, publishedAt: sql`excluded.published_at`, docDate: sql`excluded.doc_date`, form: sql`excluded.form`, updatedAt: new Date() },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    inserted += r.filter((x) => x.inserted).length;
  }
  return inserted;
}

/** external_ids of the filings already indexed for a holding, so a sync only lists exhibits for new 8-Ks. */
export async function existingFilingIds(holdingId: string): Promise<Set<string>> {
  const rows = await db.select({ externalId: documents.externalId }).from(documents).where(and(eq(documents.kind, "filing"), eq(documents.holdingId, holdingId)));
  return new Set(rows.map((r) => r.externalId));
}

export type EmbeddingStats = { documents: number; embeddedWithModel: number; chunksTotal: number; chunksWithModel: number };

/** For the Admin Retrieval card: how much of the corpus carries vectors from the current model. */
export async function embeddingStats(model: string): Promise<EmbeddingStats> {
  const [d] = await db
    .select({
      documents: count(),
      embeddedWithModel: sql<number>`count(*) filter (where ${documents.embedModel} = ${model} and ${documents.embedFor} = ${documents.version})`.mapWith(Number),
    })
    .from(documents)
    .where(isNotNull(documents.holdingId));
  const [c] = await db
    .select({ chunksTotal: count(), chunksWithModel: sql<number>`count(*) filter (where ${documentChunks.model} = ${model})`.mapWith(Number) })
    .from(documentChunks);
  return { documents: d?.documents ?? 0, embeddedWithModel: d?.embeddedWithModel ?? 0, chunksTotal: c?.chunksTotal ?? 0, chunksWithModel: c?.chunksWithModel ?? 0 };
}
