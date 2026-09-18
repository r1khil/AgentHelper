import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveFiles, holdings, teams } from "@/db/schema";
import { driveConfigured, loadConnection } from "./auth";
import { XLSM_MIME, XLSX_MIME } from "./extract";
import { upsertIndexRows } from "./index";
import type { DriveItem } from "./tree";
import { ensureHoldingFolders, itemToRow, updateAppFileContent, uploadFile } from "./writes";

/**
 * Keep one app-owned copy of each holding's model in the Drive: `<TICKER> Model (app).xlsx`. Every new app version
 * replaces its content (Drive keeps revisions). Skips silently when Drive is not connected. Callers wrap this in
 * try/catch so a Drive hiccup never blocks the Models page.
 */
export async function mirrorModelToDrive(p: { holdingId: string; buffer: Buffer; ext: "xlsx" | "xlsm"; uploadedBy?: string | null }): Promise<{ fileId: string } | null> {
  if (!driveConfigured()) return null;
  const conn = await loadConnection();
  if (!conn?.rootFolderId) return null;
  const [row] = await db.select({ h: holdings, teamName: teams.name }).from(holdings).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(holdings.id, p.holdingId)).limit(1);
  if (!row) return null;
  const mime = p.ext === "xlsm" ? XLSM_MIME : XLSX_MIME;
  const name = `${row.h.ticker} Model (app).${p.ext}`;
  const [existing] = await db
    .select({ id: driveFiles.id, createdByApp: driveFiles.createdByApp, parentId: driveFiles.parentId, path: driveFiles.path })
    .from(driveFiles)
    .where(and(eq(driveFiles.holdingId, p.holdingId), eq(driveFiles.createdByApp, true), eq(driveFiles.kind, "model"), eq(driveFiles.name, name)))
    .limit(1);

  let item: DriveItem;
  let parentId: string;
  let path: string;
  if (existing?.parentId) {
    item = await updateAppFileContent(existing, p.buffer, mime);
    parentId = existing.parentId;
    path = existing.path;
  } else {
    const folder = await ensureHoldingFolders({ id: row.h.id, ticker: row.h.ticker, companyName: row.h.companyName, teamName: row.teamName });
    item = await uploadFile({ name, mimeType: mime, parentId: folder.folderId, data: p.buffer });
    parentId = folder.folderId;
    path = `${folder.path}/${item.name}`;
  }
  await upsertIndexRows([{ ...itemToRow(item, { parentId, path, isFolder: false, holdingId: row.h.id, ticker: row.h.ticker }), kind: "model", uploadedBy: p.uploadedBy ?? null }]);
  return { fileId: item.id };
}
