import "server-only";
import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles, type DriveDocKind, type DriveFile } from "@/db/schema";
import { DriveNotConnected, driveConfigured, loadConnection } from "./auth";
import { fetchAndExtract } from "./extract";
import { capText } from "./text";

export const DOC_KIND_LABELS: Record<DriveDocKind, string> = {
  initiating_coverage: "Initiating coverage",
  earnings_update: "Earnings update",
  model: "Model",
  other: "Other",
};
export const DOC_KINDS = Object.keys(DOC_KIND_LABELS) as DriveDocKind[];

/** Everything about a file except the cached text (which can be large). */
export type DriveFileMeta = Omit<DriveFile, "text">;
const metaColumns = {
  id: driveFiles.id,
  name: driveFiles.name,
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
  textModifiedTime: driveFiles.textModifiedTime,
  textError: driveFiles.textError,
  createdAt: driveFiles.createdAt,
};

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
    .where(and(eq(driveFiles.holdingId, holdingId), eq(driveFiles.isFolder, false)))
    .orderBy(sql`${driveFiles.modifiedTime} desc nulls last`)
    .limit(limit);
}

export async function getFileMeta(fileId: string): Promise<DriveFileMeta | null> {
  const [row] = await db.select(metaColumns).from(driveFiles).where(eq(driveFiles.id, fileId)).limit(1);
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
    .where(and(...conds))
    .orderBy(sql`${driveFiles.modifiedTime} desc nulls last`)
    .limit(p.limit ?? 10);
}

export type DriveFileInsert = typeof driveFiles.$inferInsert;

/** Insert or refresh index rows. Never touches the cached text columns; staleness is detected at read time. */
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
  }
}

/**
 * Extracted text for a file, cached on the row and keyed on Drive's modifiedTime. Extraction happens on first read,
 * so sync stays cheap and only files the agent actually opens are downloaded.
 */
export async function getFileText(fileId: string): Promise<{ meta: DriveFileMeta; text: string }> {
  const [row] = await db.select().from(driveFiles).where(eq(driveFiles.id, fileId)).limit(1);
  if (!row) throw new Error("That file is not in the Drive index. Use find_drive_files to look it up.");
  if (row.isFolder) throw new Error("That id is a folder, not a file.");
  const { text: cached, ...meta } = row;
  const fresh = row.textModifiedTime?.getTime() === row.modifiedTime?.getTime();
  if (fresh && cached !== null) return { meta, text: cached };
  if (fresh && row.textError) throw new Error(row.textError);
  try {
    const text = capText(await fetchAndExtract(row));
    await db.update(driveFiles).set({ text, textModifiedTime: row.modifiedTime, textError: null }).where(eq(driveFiles.id, fileId));
    return { meta: { ...meta, textError: null, textModifiedTime: row.modifiedTime }, text };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!(e instanceof DriveNotConnected)) {
      await db.update(driveFiles).set({ text: null, textModifiedTime: row.modifiedTime, textError: message }).where(eq(driveFiles.id, fileId));
    }
    throw e;
  }
}
