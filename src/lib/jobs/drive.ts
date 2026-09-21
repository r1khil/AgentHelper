import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, notInArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { driveConnection, driveFiles, holdings, jobRuns, teams } from "@/db/schema";
import { DriveNotConnected, driveConfigured, loadConnection } from "@/lib/drive/auth";
import { getStartPageToken, listChanges, stopChannel, watchChanges } from "@/lib/drive/changes";
import { applyChanges } from "@/lib/drive/changes-diff";
import { upsertIndexRows, type DriveFileInsert } from "@/lib/drive/index";
import { deleteDriveDocuments, pruneDriveDocuments } from "@/lib/documents/index";
import { listChildren } from "@/lib/drive/read";
import { FOLDER_MIME, classifyTree, type DriveItem } from "@/lib/drive/tree";
import { WATCH_TTL_MS, lazySyncMaxAge, watchNeedsRenewal } from "@/lib/drive/watch-plan";
import { runIngest, type IngestResult } from "./ingest";
import { createJobReporter } from "./progress";

export type DriveSyncResult = {
  status: "ok" | "skipped" | "failed";
  reason?: string;
  files: number;
  folders: number;
  matched: number;
  unmatched: string[];
  removed: number;
  ingest?: IngestResult;
  mode?: "full" | "incremental";
  changes?: number;
};
export type IngestOpts = { budgetMs: number; maxFiles?: number };

// The Fund's Drive nests sector → sub-sector → Current Holdings → company → document type → semester → file.
const MAX_DEPTH = 12;
const MAX_ITEMS = 20000;
const SYNC_LOCK_STALE_MS = 2 * 60_000;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Rebuild the index of the root folder: breadth-first listing (one request per depth level, never outside the
 * subtree), classify folders into teams/holdings, upsert rows, and drop index rows for files that are gone.
 * Only the index is written; nothing in Drive is touched. Ends by taking a fresh changes cursor so incremental
 * syncs start from this crawl.
 */
export async function runDriveSync(opts: { reason?: string; ingest?: IngestOpts } = {}): Promise<DriveSyncResult> {
  const result: DriveSyncResult = { status: "ok", files: 0, folders: 0, matched: 0, unmatched: [], removed: 0, mode: "full" };
  if (!driveConfigured()) return { ...result, status: "skipped", reason: "not configured" };
  const conn = await loadConnection();
  if (!conn) return { ...result, status: "skipped", reason: "not connected" };
  if (!conn.rootFolderId) return { ...result, status: "skipped", reason: "no root folder" };

  const [jobRow] = await db.insert(jobRuns).values({ job: "drive_sync", summary: { reason: opts.reason ?? "manual", mode: "full" } }).returning({ id: jobRuns.id });
  const progress = createJobReporter(jobRow.id);
  await db.update(driveConnection).set({ syncStartedAt: new Date() }).where(eq(driveConnection.id, 1));
  try {
    // Take the cursor before crawling so changes made during the crawl are replayed by the next incremental sync.
    const cursor = await getStartPageToken().catch(() => null);
    const items: DriveItem[] = [];
    let frontier = [conn.rootFolderId];
    for (let depth = 1; depth <= MAX_DEPTH && frontier.length && items.length < MAX_ITEMS; depth++) {
      progress.step("list folder level", { depth, folders: frontier.length, itemsSoFar: items.length });
      const children = await listChildren(frontier);
      items.push(...children);
      frontier = children.filter((c) => c.mimeType === FOLDER_MIME).map((c) => c.id);
    }

    progress.step("classify folders into teams and holdings", { items: items.length });
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
    progress.step("upsert index rows", { rows: rows.length });
    await upsertIndexRows(rows);
    const ids = rows.map((r) => r.id);
    progress.step("prune removed files");
    const removed = ids.length ? await db.delete(driveFiles).where(notInArray(driveFiles.id, ids)).returning({ id: driveFiles.id }) : await db.delete(driveFiles).returning({ id: driveFiles.id });
    await pruneDriveDocuments(rows.filter((r) => !r.isFolder).map((r) => r.id));

    result.files = rows.filter((r) => !r.isFolder).length;
    result.folders = rows.length - result.files;
    result.matched = rows.filter((r) => !r.isFolder && r.holdingId).length;
    result.unmatched = unmatched;
    result.removed = removed.length;

    progress.step("finished", { files: result.files, folders: result.folders, matched: result.matched, unmatched: result.unmatched.length, removed: result.removed });
    await progress.close();
    await db
      .update(driveConnection)
      .set({ lastSyncAt: now, syncStartedAt: null, lastError: null, ...(cursor ? { startPageToken: cursor } : {}) })
      .where(eq(driveConnection.id, 1));
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: { ...result, reason: opts.reason ?? "manual" } }).where(eq(jobRuns.id, jobRow.id));
    // Content work (text, summaries, embeddings) runs after the index is consistent and the sync lock is released.
    if (opts.ingest) result.ingest = await runIngest({ reason: opts.reason ?? "manual", kinds: ["drive"], budgetMs: opts.ingest.budgetMs, maxDocs: opts.ingest.maxFiles });
    return result;
  } catch (e) {
    const message = msg(e);
    progress.error("failed", { error: message });
    await progress.close();
    // A DriveNotConnected error already recorded "reconnect: …" on the connection row.
    await db.update(driveConnection).set(e instanceof DriveNotConnected ? { syncStartedAt: null } : { syncStartedAt: null, lastError: message }).where(eq(driveConnection.id, 1));
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: { error: message, reason: opts.reason ?? "manual" } }).where(eq(jobRuns.id, jobRow.id));
    return { ...result, status: "failed", reason: message };
  }
}

/**
 * Apply what changed since the stored cursor (changes.list), falling back to a full crawl when there is no cursor,
 * the cursor expired (410), or a structural change invalidated descendant paths. After the index is written, a
 * notification that arrived mid-run triggers one more pass. Ingestion is restricted to the files that changed.
 */
export async function runIncrementalSync(opts: { reason: string; ingest?: IngestOpts }): Promise<DriveSyncResult> {
  const result: DriveSyncResult = { status: "ok", files: 0, folders: 0, matched: 0, unmatched: [], removed: 0, mode: "incremental", changes: 0 };
  if (!driveConfigured()) return { ...result, status: "skipped", reason: "not configured" };
  let conn = await loadConnection();
  if (!conn?.rootFolderId) return { ...result, status: "skipped", reason: "not connected" };
  if (!conn.startPageToken) return runDriveSync({ reason: `${opts.reason}:full`, ingest: opts.ingest });
  const rootId = conn.rootFolderId;

  const [jobRow] = await db.insert(jobRuns).values({ job: "drive_sync", summary: { reason: opts.reason, mode: "incremental" } }).returning({ id: jobRuns.id });
  await db.update(driveConnection).set({ syncStartedAt: new Date() }).where(eq(driveConnection.id, 1));
  const changedFileIds = new Set<string>();
  try {
    for (let pass = 0; pass < 2; pass++) {
      const runStart = new Date();
      let listed;
      try {
        listed = await listChanges(conn.startPageToken!);
      } catch (e) {
        if ((e as { status?: number }).status === 410) {
          await db.update(driveConnection).set({ syncStartedAt: null, startPageToken: null }).where(eq(driveConnection.id, 1));
          await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: { ...result, reason: opts.reason, note: "cursor expired; full crawl" } }).where(eq(jobRuns.id, jobRow.id));
          return runDriveSync({ reason: `${opts.reason}:full`, ingest: opts.ingest });
        }
        throw e;
      }
      const existing = new Map(
        (
          await db
            .select({ id: driveFiles.id, name: driveFiles.name, parentId: driveFiles.parentId, path: driveFiles.path, isFolder: driveFiles.isFolder, holdingId: driveFiles.holdingId, ticker: driveFiles.ticker, kind: driveFiles.kind, createdByApp: driveFiles.createdByApp, uploadedBy: driveFiles.uploadedBy })
            .from(driveFiles)
        ).map((r) => [r.id, r]),
      );
      const hs = await db.select({ id: holdings.id, ticker: holdings.ticker, companyName: holdings.companyName, teamId: holdings.teamId }).from(holdings).where(eq(holdings.status, "active"));
      const ts = await db.select({ id: teams.id, name: teams.name }).from(teams);
      const plan = applyChanges({ rootId, changes: listed.changes, existing, holdings: hs, teams: ts, now: new Date() });

      if (plan.upserts.length) await upsertIndexRows(plan.upserts);
      if (plan.deletes.length) {
        await db.delete(driveFiles).where(inArray(driveFiles.id, plan.deletes));
        await deleteDriveDocuments(plan.deletes);
      }
      for (const u of plan.upserts) if (!u.isFolder && u.holdingId) changedFileIds.add(u.id);
      result.changes! += listed.changes.length;
      result.files += plan.upserts.filter((u) => !u.isFolder).length;
      result.folders += plan.upserts.filter((u) => u.isFolder).length;
      result.matched += plan.upserts.filter((u) => !u.isFolder && u.holdingId).length;
      result.removed += plan.deletes.length;
      await db.update(driveConnection).set({ startPageToken: listed.newStartPageToken, lastChangeSyncAt: new Date(), lastError: null }).where(eq(driveConnection.id, 1));

      if (plan.needsFullSync) {
        await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: { ...result, reason: opts.reason, note: `full crawl: ${plan.reasons.join("; ")}` } }).where(eq(jobRuns.id, jobRow.id));
        return runDriveSync({ reason: `${opts.reason}:full`, ingest: opts.ingest });
      }
      conn = await loadConnection();
      if (!conn?.changeNotifiedAt || conn.changeNotifiedAt.getTime() <= runStart.getTime()) break;
    }
    await db.update(driveConnection).set({ syncStartedAt: null }).where(eq(driveConnection.id, 1));
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: { ...result, reason: opts.reason } }).where(eq(jobRuns.id, jobRow.id));
    if (opts.ingest && changedFileIds.size) result.ingest = await runIngest({ reason: opts.reason, kinds: ["drive"], budgetMs: opts.ingest.budgetMs, maxDocs: opts.ingest.maxFiles, documentIds: [...changedFileIds] });
    return result;
  } catch (e) {
    const message = msg(e);
    await db.update(driveConnection).set(e instanceof DriveNotConnected ? { syncStartedAt: null } : { syncStartedAt: null, lastError: message }).where(eq(driveConnection.id, 1));
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, summary: { ...result, error: message, reason: opts.reason } }).where(eq(jobRuns.id, jobRow.id));
    return { ...result, status: "failed", reason: message };
  }
}

/** Atomically claim the sync lock (syncStartedAt) unless a run started within the last two minutes. */
export async function claimSyncLock(): Promise<boolean> {
  const claimed = await db
    .update(driveConnection)
    .set({ syncStartedAt: new Date() })
    .where(and(eq(driveConnection.id, 1), or(isNull(driveConnection.syncStartedAt), lt(driveConnection.syncStartedAt, new Date(Date.now() - SYNC_LOCK_STALE_MS)))))
    .returning({ id: driveConnection.id });
  return claimed.length > 0;
}

const g = globalThis as unknown as { __driveFreshCheckedAt?: number };

/**
 * Cheap freshness gate for request paths (the chat route): at most one DB read per minute per process, and a
 * claimed sync only when the index is older than allowed (10 minutes without a live notification channel,
 * 6 hours with one). Incremental when a cursor exists. Never throws.
 */
export async function ensureDriveIndexFresh(maxAgeMs?: number) {
  if (!driveConfigured()) return;
  if (g.__driveFreshCheckedAt && Date.now() - g.__driveFreshCheckedAt < 60_000) return;
  g.__driveFreshCheckedAt = Date.now();
  try {
    const conn = await loadConnection();
    if (!conn?.rootFolderId || conn.lastError?.startsWith("reconnect:")) return;
    const maxAge = maxAgeMs ?? lazySyncMaxAge(conn, new Date());
    const last = Math.max(conn.lastSyncAt?.getTime() ?? 0, conn.lastChangeSyncAt?.getTime() ?? 0);
    if (last && Date.now() - last < maxAge) return;
    if (!(await claimSyncLock())) return;
    if (conn.startPageToken) await runIncrementalSync({ reason: "lazy" });
    else await runDriveSync({ reason: "lazy" });
  } catch (e) {
    console.warn("[drive] lazy sync failed", e);
  }
}

export type WatchResult = { status: "ok" | "skipped" | "failed"; reason?: string; expiration?: Date | null };

/**
 * Make sure a changes.watch channel points at this deployment. Needs a public https APP_URL; renews when the
 * channel is missing or within 36 hours of expiry (the morning job calls this daily). Never throws.
 */
export async function ensureDriveWatch(opts: { force?: boolean } = {}): Promise<WatchResult> {
  if (!driveConfigured()) return { status: "skipped", reason: "not configured" };
  const conn = await loadConnection();
  if (!conn?.rootFolderId) return { status: "skipped", reason: "not connected" };
  if (conn.lastError?.startsWith("reconnect:")) return { status: "skipped", reason: "needs reconnect" };
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl.startsWith("https://")) {
    const reason = "APP_URL must be a public https origin for Drive notifications";
    if (conn.watchError !== reason) await db.update(driveConnection).set({ watchError: reason }).where(eq(driveConnection.id, 1));
    return { status: "skipped", reason };
  }
  if (!opts.force && !watchNeedsRenewal(conn, new Date())) return { status: "ok", expiration: conn.channelExpiration };
  try {
    if (conn.channelId && conn.channelResourceId) await stopChannel({ channelId: conn.channelId, resourceId: conn.channelResourceId }).catch(() => undefined);
    const pageToken = conn.startPageToken ?? (await getStartPageToken());
    const channelId = randomUUID();
    const secret = randomBytes(32).toString("hex");
    const r = await watchChanges({ pageToken, channelId, token: secret, address: `${appUrl}/api/drive/webhook`, expiresAt: new Date(Date.now() + WATCH_TTL_MS) });
    await db
      .update(driveConnection)
      .set({ startPageToken: pageToken, channelId, channelResourceId: r.resourceId, channelSecret: secret, channelExpiration: r.expiration, watchError: null })
      .where(eq(driveConnection.id, 1));
    return { status: "ok", expiration: r.expiration };
  } catch (e) {
    const reason = msg(e);
    await db.update(driveConnection).set({ watchError: reason }).where(eq(driveConnection.id, 1)).catch(() => undefined);
    return { status: "failed", reason };
  }
}

/** Stop the channel (best effort) and forget it. Used before disconnecting. */
export async function stopDriveWatch(): Promise<void> {
  const conn = await loadConnection();
  if (!conn) return;
  if (conn.channelId && conn.channelResourceId) await stopChannel({ channelId: conn.channelId, resourceId: conn.channelResourceId }).catch(() => undefined);
  await db.update(driveConnection).set({ channelId: null, channelResourceId: null, channelSecret: null, channelExpiration: null, watchError: null }).where(eq(driveConnection.id, 1));
}
