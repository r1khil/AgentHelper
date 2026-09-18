import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles } from "@/db/schema";
import { DriveError, driveFetch } from "./http";
import { DRIVE_API, FILE_FIELDS, findChildFolder } from "./read";
import { FOLDER_MIME, type DriveItem } from "./tree";
import { loadRoot, upsertIndexRows } from "./index";

/**
 * The app's entire write surface against Google Drive. Three operations, all additive:
 *   - create a folder
 *   - upload a new file
 *   - replace the content of a file the app itself created (model re-uploads; Drive keeps revisions)
 * There is no delete, trash, move, rename, or permission change here or anywhere else, and the OAuth scopes
 * (drive.readonly + drive.file) mean Google would refuse edits to the admin's own files even if code tried.
 */
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export async function ensureFolder(name: string, parentId: string): Promise<DriveItem> {
  const existing = await findChildFolder(parentId, name);
  if (existing) return existing;
  const res = await driveFetch(`${DRIVE_API}/files?fields=${FILE_FIELDS}&supportsAllDrives=true`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return (await res.json()) as DriveItem;
}

async function resumableUpload(startUrl: string, method: "POST" | "PATCH", metadata: Record<string, unknown>, data: Buffer, mimeType: string): Promise<DriveItem> {
  const start = await driveFetch(startUrl, {
    method,
    headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-type": mimeType, "x-upload-content-length": String(data.length) },
    body: JSON.stringify(metadata),
  });
  const location = start.headers.get("location");
  if (!location) throw new DriveError("Google Drive did not open an upload session", start.status);
  const put = await driveFetch(location, { method: "PUT", headers: { "content-type": mimeType, "content-length": String(data.length) }, body: new Uint8Array(data) });
  return (await put.json()) as DriveItem;
}

export async function uploadFile(p: { name: string; mimeType: string; parentId: string; data: Buffer }): Promise<DriveItem> {
  return resumableUpload(`${UPLOAD_API}/files?uploadType=resumable&fields=${FILE_FIELDS}&supportsAllDrives=true`, "POST", { name: p.name, parents: [p.parentId], mimeType: p.mimeType }, p.data, p.mimeType);
}

export async function updateAppFileContent(row: { id: string; createdByApp: boolean }, data: Buffer, mimeType: string): Promise<DriveItem> {
  if (!row.createdByApp) throw new Error("Refusing to modify a Drive file the app did not create");
  return resumableUpload(`${UPLOAD_API}/files/${encodeURIComponent(row.id)}?uploadType=resumable&fields=${FILE_FIELDS}&supportsAllDrives=true`, "PATCH", {}, data, mimeType);
}

function itemToRow(f: DriveItem, extra: { parentId: string; path: string; isFolder: boolean; holdingId?: string | null; ticker?: string | null }) {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    parentId: extra.parentId,
    path: extra.path,
    isFolder: extra.isFolder,
    size: f.size !== undefined ? Number(f.size) : null,
    modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : null,
    webViewLink: f.webViewLink ?? null,
    md5: f.md5Checksum ?? null,
    ticker: extra.ticker ?? null,
    holdingId: extra.holdingId ?? null,
    createdByApp: true,
    indexedAt: new Date(),
  };
}

/**
 * `<Team name>/<Company (TICKER)>` under the root, reusing folders already in the index (even when the company
 * folder is named differently) and creating what is missing.
 */
export async function ensureHoldingFolders(h: { id: string; ticker: string; companyName: string; teamName: string }): Promise<{ folderId: string; path: string }> {
  const root = await loadRoot();

  const [matched] = await db
    .select({ id: driveFiles.id, path: driveFiles.path })
    .from(driveFiles)
    .where(and(eq(driveFiles.holdingId, h.id), eq(driveFiles.isFolder, true)))
    .orderBy(sql`length(${driveFiles.path})`)
    .limit(1);
  if (matched) return { folderId: matched.id, path: matched.path };

  const [teamRow] = await db
    .select({ id: driveFiles.id, path: driveFiles.path })
    .from(driveFiles)
    .where(and(eq(driveFiles.parentId, root.id), eq(driveFiles.isFolder, true), eq(driveFiles.name, h.teamName)))
    .limit(1);
  let teamFolder = teamRow;
  if (!teamFolder) {
    const f = await ensureFolder(h.teamName, root.id);
    teamFolder = { id: f.id, path: f.name };
    await upsertIndexRows([itemToRow(f, { parentId: root.id, path: f.name, isFolder: true })]);
  }

  const companyName = `${h.companyName} (${h.ticker})`;
  const f = await ensureFolder(companyName, teamFolder.id);
  const path = `${teamFolder.path}/${f.name}`;
  await upsertIndexRows([itemToRow(f, { parentId: teamFolder.id, path, isFolder: true, holdingId: h.id, ticker: h.ticker })]);
  return { folderId: f.id, path };
}

export { itemToRow };
