import "server-only";
import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { documents, driveFiles, holdingProposals, type DriveDocKind, type DriveFile } from "@/db/schema";
import { DriveNotConnected, driveConfigured, loadConnection } from "./auth";
import { fetchAndExtract } from "./extract";
import type { DocSummary } from "./summary";
import { capText } from "./text";
import { driveDocumentRow, driveVersion, upsertDriveDocuments } from "@/lib/documents/index";

import { DOC_KIND_LABELS, DOCUMENT_HEADING_CHARS } from "./labels";
export { DOC_KIND_LABELS } from "./labels";
export const DOC_KINDS = Object.keys(DOC_KIND_LABELS) as DriveDocKind[];

/** Ingest bookkeeping that lives on the file's corpus row (documents), joined onto every Drive file read. */
export type DocumentIngestFields = {
  version: string;
  textFor: string | null;
  textError: string | null;
  summary: DocSummary | null;
  summaryModel: string | null;
  summaryVersion: number | null;
  summaryFor: string | null;
  summaryError: string | null;
  summarizedAt: Date | null;
  docDate: string | null;
  embedModel: string | null;
  embedFor: string | null;
  embedError: string | null;
  embeddedAt: Date | null;
  ingestAttempts: number;
  ingestAttemptedAt: Date | null;
};

/** Everything about a file except the cached text (which can be large): the drive_files row ⨝ its documents row. */
export type DriveFileMeta = DriveFile & DocumentIngestFields & { documentHeading?: string | null };

// A bounded excerpt avoids loading full documents on the company page. Ignore stale text.
export const documentHeadingColumn = sql<string | null>`case
  when ${driveFiles.kind} = 'earnings_update' and ${documents.textFor} = ${documents.version}
  then left(${documents.text}, ${DOCUMENT_HEADING_CHARS}) else null end`;

/** The one place to extend when a column joins DriveFileMeta. */
export const metaColumns = {
  id: driveFiles.id,
  name: driveFiles.name,
  documentHeading: documentHeadingColumn,
  mimeType: driveFiles.mimeType,
  parentId: driveFiles.parentId,
  path: driveFiles.path,
  isFolder: driveFiles.isFolder,
  size: driveFiles.size,
  modifiedTime: driveFiles.modifiedTime,
  webViewLink: driveFiles.webViewLink,
  md5: driveFiles.md5,
  ticker: driveFiles.ticker,
  holdingId: driveFiles.holdingId,
  kind: driveFiles.kind,
  createdByApp: driveFiles.createdByApp,
  uploadedBy: driveFiles.uploadedBy,
  indexedAt: driveFiles.indexedAt,
  documentId: driveFiles.documentId,
  createdAt: driveFiles.createdAt,
  version: sql<string>`coalesce(${documents.version}, '')`,
  textFor: documents.textFor,
  textError: documents.textError,
  summary: documents.summary,
  summaryModel: documents.summaryModel,
  summaryVersion: documents.summaryVersion,
  summaryFor: documents.summaryFor,
  summaryError: documents.summaryError,
  summarizedAt: documents.summarizedAt,
  docDate: documents.docDate,
  embedModel: documents.embedModel,
  embedFor: documents.embedFor,
  embedError: documents.embedError,
  embeddedAt: documents.embeddedAt,
  ingestAttempts: sql<number>`coalesce(${documents.ingestAttempts}, 0)`.mapWith(Number),
  ingestAttemptedAt: documents.ingestAttemptedAt,
};

const docJoin = eq(documents.id, driveFiles.documentId);

export type IngestStats = { matched: number; withText: number; summarized: number; embedded: number; pending: number; errored: number; pendingProposals: number };

/** Ingestion progress across the Drive index, one query. "pending" counts matched files whose summary is not current. */
export async function ingestStats(): Promise<IngestStats> {
  const [c] = await db
    .select({
      matched: sql<number>`count(*) filter (where ${driveFiles.holdingId} is not null)`.mapWith(Number),
      withText: sql<number>`count(*) filter (where ${driveFiles.holdingId} is not null and ${documents.textFor} = ${documents.version} and ${documents.text} is not null)`.mapWith(Number),
      summarized: sql<number>`count(*) filter (where ${driveFiles.holdingId} is not null and ${documents.summaryFor} = ${documents.version} and ${documents.summary} is not null)`.mapWith(Number),
      embedded: sql<number>`count(*) filter (where ${driveFiles.holdingId} is not null and ${documents.embedFor} = ${documents.version})`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${driveFiles.holdingId} is not null and (${documents.summaryFor} is distinct from ${documents.version}) and not (${documents.textFor} = ${documents.version} and ${documents.textError} is not null))`.mapWith(Number),
      errored: sql<number>`count(*) filter (where ${driveFiles.holdingId} is not null and ((${documents.textError} is not null and ${documents.textFor} = ${documents.version}) or (${documents.summaryError} is not null and ${documents.summaryFor} = ${documents.version}) or (${documents.embedError} is not null and ${documents.embedFor} = ${documents.version})))`.mapWith(Number),
    })
    .from(driveFiles)
    .leftJoin(documents, docJoin)
    .where(eq(driveFiles.isFolder, false));
  const [p] = await db.select({ n: count() }).from(holdingProposals).where(eq(holdingProposals.status, "pending"));
  return { matched: c?.matched ?? 0, withText: c?.withText ?? 0, summarized: c?.summarized ?? 0, embedded: c?.embedded ?? 0, pending: c?.pending ?? 0, errored: c?.errored ?? 0, pendingProposals: p?.n ?? 0 };
}

export type DriveStatus = {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  accountEmail?: string;
  rootFolderId?: string | null;
  rootFolderName?: string | null;
  lastSyncAt?: Date | null;
  lastError?: string | null;
  fileCount: number;
  matchedCount: number;
  ingest?: IngestStats;
  watch?: { active: boolean; expiration: Date | null; error: string | null; lastChangeSyncAt: Date | null };
};

export async function driveStatus(): Promise<DriveStatus> {
  if (!driveConfigured()) return { configured: false, connected: false, needsReconnect: false, fileCount: 0, matchedCount: 0 };
  const conn = await loadConnection();
  if (!conn) return { configured: true, connected: false, needsReconnect: false, fileCount: 0, matchedCount: 0 };
  const [c] = await db
    .select({ files: count(), matched: sql<number>`count(*) filter (where ${driveFiles.holdingId} is not null)`.mapWith(Number) })
    .from(driveFiles)
    .where(eq(driveFiles.isFolder, false));
  return {
    configured: true,
    connected: true,
    needsReconnect: Boolean(conn.lastError?.startsWith("reconnect:")),
    accountEmail: conn.accountEmail,
    rootFolderId: conn.rootFolderId,
    rootFolderName: conn.rootFolderName,
    lastSyncAt: conn.lastSyncAt,
    lastError: conn.lastError,
    fileCount: c?.files ?? 0,
    matchedCount: c?.matched ?? 0,
    ingest: await ingestStats(),
    watch: {
      active: Boolean(conn.channelId && conn.channelExpiration && conn.channelExpiration.getTime() > Date.now()),
      expiration: conn.channelExpiration,
      error: conn.watchError,
      lastChangeSyncAt: conn.lastChangeSyncAt,
    },
  };
}

/** The configured root folder, or a DriveNotConnected error explaining what is missing. */
export async function loadRoot(): Promise<{ id: string; name: string }> {
  if (!driveConfigured()) throw new DriveNotConnected("Google Drive is not configured.");
  const conn = await loadConnection();
  if (!conn) throw new DriveNotConnected();
  if (!conn.rootFolderId) throw new DriveNotConnected("Google Drive is connected but no root folder is set. An admin can set it from the Admin page.");
  return { id: conn.rootFolderId, name: conn.rootFolderName ?? "Analyst Drive" };
}

export async function listHoldingFiles(holdingId: string, limit = 20): Promise<DriveFileMeta[]> {
  return db
    .select(metaColumns)
    .from(driveFiles)
    .leftJoin(documents, docJoin)
    .where(and(eq(driveFiles.holdingId, holdingId), eq(driveFiles.isFolder, false)))
    .orderBy(sql`${driveFiles.modifiedTime} desc nulls last`)
    .limit(limit);
}

export async function getFileMeta(fileId: string): Promise<DriveFileMeta | null> {
  const [row] = await db.select(metaColumns).from(driveFiles).leftJoin(documents, docJoin).where(eq(driveFiles.id, fileId)).limit(1);
  return row ?? null;
}

export async function searchIndex(p: { ticker?: string; query?: string; kind?: DriveDocKind; ids?: string[]; limit?: number }): Promise<DriveFileMeta[]> {
  const conds = [eq(driveFiles.isFolder, false)];
  if (p.ticker) conds.push(eq(driveFiles.ticker, p.ticker.toUpperCase()));
  if (p.kind) conds.push(eq(driveFiles.kind, p.kind));
  if (p.query) {
    const like = `%${p.query.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(or(ilike(driveFiles.name, like), ilike(driveFiles.path, like))!);
  }
  if (p.ids) {
    if (!p.ids.length) return [];
    conds.push(sql`${driveFiles.id} in ${p.ids}`);
  }
  return db
    .select(metaColumns)
    .from(driveFiles)
    .leftJoin(documents, docJoin)
    .where(and(...conds))
    .orderBy(sql`${driveFiles.modifiedTime} desc nulls last`)
    .limit(p.limit ?? 10);
}

export type DriveFileInsert = typeof driveFiles.$inferInsert;

/**
 * Insert or refresh index rows, and the corpus row behind each non-folder file. Never touches the cached text
 * columns; staleness is detected at read time through documents.version.
 */
export async function upsertIndexRows(rows: DriveFileInsert[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await db
      .insert(driveFiles)
      .values(chunk)
      .onConflictDoUpdate({
        target: driveFiles.id,
        set: {
          name: sql`excluded.name`,
          mimeType: sql`excluded.mime_type`,
          parentId: sql`excluded.parent_id`,
          path: sql`excluded.path`,
          isFolder: sql`excluded.is_folder`,
          size: sql`excluded.size`,
          modifiedTime: sql`excluded.modified_time`,
          webViewLink: sql`excluded.web_view_link`,
          md5: sql`excluded.md5`,
          ticker: sql`excluded.ticker`,
          holdingId: sql`excluded.holding_id`,
          kind: sql`excluded.kind`,
          createdByApp: sql`excluded.created_by_app`,
          uploadedBy: sql`excluded.uploaded_by`,
          indexedAt: sql`excluded.indexed_at`,
        },
      });
    await upsertDriveDocuments(chunk.filter((r) => !r.isFolder).map((r) => ({ id: r.id, name: r.name, holdingId: r.holdingId ?? null, ticker: r.ticker ?? null, webViewLink: r.webViewLink ?? null, modifiedTime: r.modifiedTime ?? null })));
  }
}

/**
 * Extracted text for a file, cached on its corpus row and keyed on Drive's modifiedTime. Extraction happens on
 * first read, so sync stays cheap and only files the agent actually opens are downloaded.
 */
export async function getFileText(fileId: string): Promise<{ meta: DriveFileMeta; text: string }> {
  const [row] = await db.select({ file: driveFiles, doc: documents }).from(driveFiles).leftJoin(documents, docJoin).where(eq(driveFiles.id, fileId)).limit(1);
  if (!row) throw new Error("That file is not in the Drive index. Use find_documents to look it up.");
  if (row.file.isFolder) throw new Error("That id is a folder, not a file.");
  const version = driveVersion(row.file.modifiedTime);
  if (!row.doc) {
    // A row indexed before the corpus existed; give it one now.
    await db.insert(documents).values(driveDocumentRow(row.file)).onConflictDoNothing();
    await db.update(driveFiles).set({ documentId: row.file.id }).where(eq(driveFiles.id, fileId));
  }
  const doc = row.doc;
  const fresh = doc?.textFor === version;
  const base = await getFileMeta(fileId);
  if (!base) throw new Error("That file is not in the Drive index.");
  if (fresh && doc?.text != null) return { meta: { ...base, documentHeading: doc.text.slice(0, DOCUMENT_HEADING_CHARS) }, text: doc.text };
  if (fresh && doc?.textError) throw new Error(doc.textError);
  try {
    const text = capText(await fetchAndExtract(row.file));
    await db.update(documents).set({ text, textFor: version, textError: null, updatedAt: new Date() }).where(eq(documents.id, fileId));
    return { meta: { ...base, documentHeading: text.slice(0, DOCUMENT_HEADING_CHARS), textError: null, textFor: version }, text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!(e instanceof DriveNotConnected)) {
      await db.update(documents).set({ text: null, textFor: version, textError: message, updatedAt: new Date() }).where(eq(documents.id, fileId));
    }
    throw e;
  }
}
