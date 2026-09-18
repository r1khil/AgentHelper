import "server-only";
import { driveFetch } from "./http";
import { FOLDER_MIME, SHORTCUT_MIME, type DriveItem } from "./tree";

/**
 * Read-only Drive calls. Nothing in this module creates, modifies, trashes, or shares anything;
 * `writes.ts` holds the (deliberately small) write surface.
 */
export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const FILE_FIELDS = "id,name,mimeType,parents,size,modifiedTime,webViewLink,md5Checksum";

export function escapeQuery(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function getFile(id: string): Promise<DriveItem> {
  const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS}&supportsAllDrives=true`);
  return (await res.json()) as DriveItem;
}

async function listAll(q: string, fields = `files(${FILE_FIELDS})`): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  let pageToken: string | undefined;
  do {
    const u = new URL(`${DRIVE_API}/files`);
    u.searchParams.set("q", q);
    u.searchParams.set("fields", `nextPageToken,${fields}`);
    u.searchParams.set("pageSize", "1000");
    u.searchParams.set("supportsAllDrives", "true");
    u.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await driveFetch(u.toString());
    const j = (await res.json()) as { files?: DriveItem[]; nextPageToken?: string };
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

/** Direct children of the given folders (chunked so the query stays short). Shortcuts are skipped. */
export async function listChildren(parentIds: string[]): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  for (let i = 0; i < parentIds.length; i += 25) {
    const chunk = parentIds.slice(i, i + 25);
    const q = `(${chunk.map((id) => `'${escapeQuery(id)}' in parents`).join(" or ")}) and trashed = false`;
    out.push(...(await listAll(q)).filter((f) => f.mimeType !== SHORTCUT_MIME));
  }
  return out;
}

export async function findChildFolder(parentId: string, name: string): Promise<DriveItem | null> {
  const q = `'${escapeQuery(parentId)}' in parents and name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const files = await listAll(q);
  return files[0] ?? null;
}

/** Ids of files whose content matches the query (Google's own full-text index). Callers intersect with the app index. */
export async function searchFullText(query: string): Promise<string[]> {
  const q = `fullText contains '${escapeQuery(query)}' and trashed = false`;
  const u = new URL(`${DRIVE_API}/files`);
  u.searchParams.set("q", q);
  u.searchParams.set("fields", "files(id)");
  u.searchParams.set("pageSize", "100");
  u.searchParams.set("supportsAllDrives", "true");
  u.searchParams.set("includeItemsFromAllDrives", "true");
  const res = await driveFetch(u.toString());
  const j = (await res.json()) as { files?: { id: string }[] };
  return (j.files ?? []).map((f) => f.id);
}

/** Export a Google-native file (Docs, Sheets, Slides) to the given MIME type. Google caps exports at 10MB. */
export async function exportFile(id: string, mimeType: string): Promise<Buffer> {
  const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mimeType)}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadFile(id: string): Promise<Buffer> {
  const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`);
  return Buffer.from(await res.arrayBuffer());
}

/** The connected account. Pass an access token during the OAuth callback, before the connection row exists. */
export async function about(accessToken?: string): Promise<{ emailAddress: string; displayName?: string }> {
  const url = `${DRIVE_API}/about?fields=user(emailAddress,displayName)`;
  const res = accessToken ? await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } }) : await driveFetch(url);
  if (!res.ok) throw new Error(`Could not read the Google account (${res.status})`);
  const j = (await res.json()) as { user?: { emailAddress?: string; displayName?: string } };
  if (!j.user?.emailAddress) throw new Error("Google did not return the account email");
  return { emailAddress: j.user.emailAddress, displayName: j.user.displayName };
}
