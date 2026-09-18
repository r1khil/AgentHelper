import "server-only";
import { driveFetch } from "./http";
import { DRIVE_API } from "./read";
import type { DriveItem } from "./tree";

/**
 * Drive change notifications: the changes.list cursor and the changes.watch push channel. These are read-scope
 * APIs (drive.readonly covers them); the two POSTs here register and stop a notification channel and never touch
 * a file. writes.test.ts pins this module to exactly those endpoints.
 */
const CHANGE_FIELDS = "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,parents,size,modifiedTime,webViewLink,md5Checksum,trashed))";

export type DriveChange = { fileId: string; removed?: boolean; file?: DriveItem & { trashed?: boolean } };

export async function getStartPageToken(): Promise<string> {
  const res = await driveFetch(`${DRIVE_API}/changes/startPageToken?supportsAllDrives=true`);
  const j = (await res.json()) as { startPageToken?: string };
  if (!j.startPageToken) throw new Error("Google returned no start page token");
  return j.startPageToken;
}

/** Every change since `pageToken`, account-wide (callers ignore what is outside the root), plus the next cursor. */
export async function listChanges(pageToken: string): Promise<{ changes: DriveChange[]; newStartPageToken: string }> {
  const changes: DriveChange[] = [];
  let token: string | undefined = pageToken;
  let newStart: string | undefined;
  while (token) {
    const u = new URL(`${DRIVE_API}/changes`);
    u.searchParams.set("pageToken", token);
    u.searchParams.set("fields", CHANGE_FIELDS);
    u.searchParams.set("pageSize", "1000");
    u.searchParams.set("includeRemoved", "true");
    u.searchParams.set("restrictToMyDrive", "false");
    u.searchParams.set("supportsAllDrives", "true");
    u.searchParams.set("includeItemsFromAllDrives", "true");
    const res = await driveFetch(u.toString());
    const j = (await res.json()) as { changes?: DriveChange[]; nextPageToken?: string; newStartPageToken?: string };
    changes.push(...(j.changes ?? []));
    token = j.nextPageToken;
    if (j.newStartPageToken) newStart = j.newStartPageToken;
  }
  if (!newStart) throw new Error("Google returned no new start page token");
  return { changes, newStartPageToken: newStart };
}

/** Register a web_hook channel for changes after `pageToken`. Google clamps the expiration (about a week at most). */
export async function watchChanges(p: { pageToken: string; channelId: string; token: string; address: string; expiresAt: Date }): Promise<{ resourceId: string; expiration: Date }> {
  const u = new URL(`${DRIVE_API}/changes/watch`);
  u.searchParams.set("pageToken", p.pageToken);
  u.searchParams.set("supportsAllDrives", "true");
  u.searchParams.set("includeItemsFromAllDrives", "true");
  const res = await driveFetch(u.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: p.channelId, type: "web_hook", address: p.address, token: p.token, expiration: String(p.expiresAt.getTime()) }),
  });
  const j = (await res.json()) as { resourceId?: string; expiration?: string };
  if (!j.resourceId) throw new Error("Google returned no resourceId for the watch channel");
  return { resourceId: j.resourceId, expiration: j.expiration ? new Date(Number(j.expiration)) : p.expiresAt };
}

/** Stop a channel we registered. A 404 means it already expired; that is fine. */
export async function stopChannel(p: { channelId: string; resourceId: string }): Promise<void> {
  try {
    await driveFetch(`${DRIVE_API}/channels/stop`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: p.channelId, resourceId: p.resourceId }) });
  } catch (e) {
    if ((e as { status?: number }).status === 404) return;
    throw e;
  }
}
