import "server-only";
import { and, eq, isNull, lt, notInArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { driveConnection, driveFiles, holdings, jobRuns, teams } from "@/db/schema";
import { DriveNotConnected, driveConfigured, loadConnection } from "@/lib/drive/auth";
import { upsertIndexRows, type DriveFileInsert } from "@/lib/drive/index";
import { listChildren } from "@/lib/drive/read";
import { FOLDER_MIME, classifyTree, type DriveItem } from "@/lib/drive/tree";

export type DriveSyncResult = { status: "ok" | "skipped" | "failed"; reason?: string; files: number; folders: number; matched: number; unmatched: string[]; removed: number };

// The Fund's Drive nests sector → sub-sector → Current Holdings → company → document type → semester → file.
const MAX_DEPTH = 12;
const MAX_ITEMS = 20000;

/**
 * Rebuild the index of the root folder: breadth-first listing (one request per depth level, never outside the
 * subtree), classify folders into teams/holdings, upsert rows, and drop index rows for files that are gone.
 * Only the index is written; nothing in Drive is touched.
 */
export async function runDriveSync(opts: { reason?: string } = {}): Promise<DriveSyncResult> {
  const result: DriveSyncResult = { status: "ok", files: 0, folders: 0, matched: 0, unmatched: [], removed: 0 };
  if (!driveConfigured()) return { ...result, status: "skipped", reason: "not configured" };
  const conn = await loadConnection();
  if (!conn) return { ...result, status: "skipped", reason: "not connected" };
  if (!conn.rootFolderId) return { ...result, status: "skipped", reason: "no root folder" };

  const [jobRow] = await db.insert(jobRuns).values({ job: "drive_sync", summary: { reason: opts.reason ?? "manual" } }).returning({ id: jobRuns.id });
  await db.update(driveConnection).set({ syncStartedAt: new Date() }).where(eq(driveConnection.id, 1));
  try {
    const items: DriveItem[] = [];
    let frontier = [conn.rootFolderId];
    for (let depth = 1; depth <= MAX_DEPTH && frontier.length && items.length < MAX_ITEMS; depth++) {
      const children = await listChildren(frontier);
      items.push(...children);
      frontier = children.filter((c) => c.mimeType === FOLDER_MIME).map((c) => c.id);
    }

    const hs = await db.select({ id: holdings.id, ticker: holdings.ticker, companyName: holdings.companyName, teamId: holdings.teamId }).from(holdings).where(eq(holdings.status, "active"));
    const ts = await db.select({ id: teams.id, name: teams.name }).from(teams);
    const { items: classified, unmatched } = classifyTree(conn.rootFolderId, items, hs, ts);

    const existing = new Map(
      (await db.select({ id: driveFiles.id, createdByApp: driveFiles.createdByApp, holdingId: driveFiles.holdingId, ticker: driveFiles.ticker, kind: driveFiles.kind, uploadedBy: driveFiles.uploadedBy }).from(driveFiles)).map((r) => [r.id, r]),
    );
    const now = new Date();
    const rows: DriveFileInsert[] = classified.map((c) => {
      const ex = existing.get(c.id);
      const app = ex?.createdByApp ?? false;
      return {
        id: c.id,
        name: c.name,
        mimeType: c.mimeType,
        parentId: c.parentId,
        path: c.path,
        isFolder: c.isFolder,
        size: c.size !== undefined ? Number(c.size) : null,
        modifiedTime: c.modifiedTime ? new Date(c.modifiedTime) : null,
        webViewLink: c.webViewLink ?? null,
        md5: c.md5Checksum ?? null,
        ticker: c.ticker ?? (app ? (ex?.ticker ?? null) : null),
        holdingId: app ? (ex?.holdingId ?? c.holdingId) : c.holdingId,
        kind: app ? (ex?.kind ?? c.kind) : c.kind,
        createdByApp: app,
        uploadedBy: ex?.uploadedBy ?? null,
        indexedAt: now,
      };
    });
    await upsertIndexRows(rows);
    const ids = rows.map((r) => r.id);
    const removed = ids.length ? await db.delete(driveFiles).where(notInArray(driveFiles.id, ids)).returning({ id: driveFiles.id }) : await db.delete(driveFiles).returning({ id: driveFiles.id });

    result.files = rows.filter((r) => !r.isFolder).length;
    result.folders = rows.length - result.files;
    result.matched = rows.filter((r) => !r.isFolder && r.holdingId).length;
    result.unmatched = unmatched;
    result.removed = removed.length;

    await db.update(driveConnection).set({ lastSyncAt: now, syncStartedAt: null, lastError: null }).where(eq(driveConnection.id, 1));
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: { ...result, reason: opts.reason ?? "manual" } }).where(eq(jobRuns.id, jobRow.id));
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A DriveNotConnected error already recorded "reconnect: …" on the connection row.
    await db.update(driveConnection).set(e instanceof DriveNotConnected ? { syncStartedAt: null } : { syncStartedAt: null, lastError: message }).where(eq(driveConnection.id, 1));
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: { error: message, reason: opts.reason ?? "manual" } }).where(eq(jobRuns.id, jobRow.id));
    return { ...result, status: "failed", reason: message };
  }
}

const g = globalThis as unknown as { __driveFreshCheckedAt?: number };

/**
 * Cheap freshness gate for request paths (the chat route): at most one DB read per minute per process, and a
 * claimed full sync only when the index is older than `maxAgeMs`. Never throws.
 */
export async function ensureDriveIndexFresh(maxAgeMs = 10 * 60_000) {
  if (!driveConfigured()) return;
  if (g.__driveFreshCheckedAt && Date.now() - g.__driveFreshCheckedAt < 60_000) return;
  g.__driveFreshCheckedAt = Date.now();
  try {
    const conn = await loadConnection();
    if (!conn?.rootFolderId || conn.lastError?.startsWith("reconnect:")) return;
    if (conn.lastSyncAt && Date.now() - conn.lastSyncAt.getTime() < maxAgeMs) return;
    const claimed = await db
      .update(driveConnection)
      .set({ syncStartedAt: new Date() })
      .where(and(eq(driveConnection.id, 1), or(isNull(driveConnection.syncStartedAt), lt(driveConnection.syncStartedAt, new Date(Date.now() - 2 * 60_000)))))
      .returning({ id: driveConnection.id });
    if (!claimed.length) return;
    await runDriveSync({ reason: "lazy" });
  } catch (e) {
    console.warn("[drive] lazy sync failed", e);
  }
}
