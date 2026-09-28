import type { DriveChange } from "./changes";
import { FOLDER_MIME, SHORTCUT_MIME, inferKind, matchHolding, matchTeam, namedHoldingOverride, parenthesizedTicker, type DriveDocKind, type HoldingRef, type TeamRef } from "./tree";

/** What the incremental sync knows about an indexed row. Pure module. */
export type IndexedRow = {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  isFolder: boolean;
  holdingId: string | null;
  ticker: string | null;
  kind: DriveDocKind | null;
  createdByApp: boolean;
  uploadedBy: string | null;
};

export type ChangeUpsert = {
  id: string;
  name: string;
  mimeType: string;
  parentId: string | null;
  path: string;
  isFolder: boolean;
  size: number | null;
  modifiedTime: Date | null;
  webViewLink: string | null;
  md5: string | null;
  ticker: string | null;
  holdingId: string | null;
  kind: DriveDocKind | null;
  createdByApp: boolean;
  uploadedBy: string | null;
  indexedAt: Date;
};

export type ChangePlan = { upserts: ChangeUpsert[]; deletes: string[]; needsFullSync: boolean; reasons: string[] };

/**
 * Turn a changes.list page into index writes. Folders are processed before files so a new folder and its new files
 * in the same batch resolve. Anything outside the root's subtree (changes.list is account-wide) is ignored.
 * Structural moves and folder renames invalidate descendant paths, which the full crawl repairs (`needsFullSync`).
 */
export function applyChanges(p: { rootId: string; changes: DriveChange[]; existing: Map<string, IndexedRow>; holdings: HoldingRef[]; teams: TeamRef[]; now: Date }): ChangePlan {
  const working = new Map(p.existing);
  const plan: ChangePlan = { upserts: [], deletes: [], needsFullSync: false, reasons: [] };
  const deleted = new Set<string>();
  const flag = (reason: string) => {
    plan.needsFullSync = true;
    if (plan.reasons.length < 10) plan.reasons.push(reason);
  };

  const ordered = [...p.changes].sort((a, b) => Number(b.file?.mimeType === FOLDER_MIME) - Number(a.file?.mimeType === FOLDER_MIME));
  for (const c of ordered) {
    const id = c.fileId ?? c.file?.id;
    if (!id) continue;
    const file = c.file;
    const gone = c.removed || !file || file.trashed;
    const ex = working.get(id);

    if (gone) {
      if (ex && !deleted.has(id)) {
        deleted.add(id);
        plan.deletes.push(id);
        working.delete(id);
        if (ex.isFolder) flag(`folder removed: ${ex.path}`);
      }
      continue;
    }
    if (file.mimeType === SHORTCUT_MIME) continue;

    const parent = file.parents?.[0] ?? null;
    const parentRow = parent && parent !== p.rootId ? working.get(parent) : undefined;
    const parentKnown = parent === p.rootId || Boolean(parentRow);
    if (!parentKnown) {
      // Not in our subtree (or moved out of it).
      if (ex && !deleted.has(id)) {
        deleted.add(id);
        plan.deletes.push(id);
        working.delete(id);
        flag(`moved out of the root: ${ex.path}`);
      }
      continue;
    }

    const isFolder = file.mimeType === FOLDER_MIME;
    const path = parentRow ? `${parentRow.path}/${file.name}` : file.name;
    if (ex && ex.parentId !== parent) flag(`moved: ${ex.path} → ${path}`);
    else if (ex && ex.isFolder && ex.name !== file.name) flag(`folder renamed: ${ex.path} → ${path}`);

    let holdingId = parentRow?.holdingId ?? null;
    let ticker = parentRow?.ticker ?? null;
    const teamId = matchTeam(path.split("/")[0], p.teams)?.id ?? null;
    // Same rule as the full crawl: a name carrying another holding's "(TICKER)" overrides the company folder.
    const named = (!isFolder || holdingId) && namedHoldingOverride(file.name, ticker, p.holdings, teamId);
    if (named) {
      holdingId = named.id;
      ticker = named.ticker;
    } else if (isFolder && !holdingId) {
      const depth = path.split("/").length;
      if (depth > 1 || !matchTeam(file.name, p.teams)) {
        const h = matchHolding(file.name, p.holdings, teamId);
        if (h) {
          holdingId = h.id;
          ticker = h.ticker;
        } else {
          const paren = parenthesizedTicker(file.name);
          if (paren) ticker = paren.toUpperCase();
        }
      }
    }
    let kind: DriveDocKind | null = isFolder ? null : inferKind(file.name, file.mimeType);
    const app = ex?.createdByApp ?? false;
    if (app) {
      holdingId = ex?.holdingId ?? holdingId;
      ticker = ex?.ticker ?? ticker;
      kind = ex?.kind ?? kind;
    }

    const row: ChangeUpsert = {
      id,
      name: file.name,
      mimeType: file.mimeType,
      parentId: parent,
      path,
      isFolder,
      size: file.size !== undefined ? Number(file.size) : null,
      modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
      webViewLink: file.webViewLink ?? null,
      md5: file.md5Checksum ?? null,
      ticker,
      holdingId,
      kind,
      createdByApp: app,
      uploadedBy: ex?.uploadedBy ?? null,
      indexedAt: p.now,
    };
    plan.upserts.push(row);
    working.set(id, { id, name: row.name, parentId: row.parentId, path, isFolder, holdingId, ticker, kind, createdByApp: app, uploadedBy: row.uploadedBy });
  }
  return plan;
}
