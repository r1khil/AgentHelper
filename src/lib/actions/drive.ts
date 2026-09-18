"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { driveConnection, driveFiles, holdings } from "@/db/schema";
import { canAccessTeam, getCurrentUser, requireAdmin } from "@/lib/auth";
import { clearTokenCache, loadConnection, revokeStoredToken } from "@/lib/drive/auth";
import { driveStatus } from "@/lib/drive/index";
import { parseFolderId } from "@/lib/drive/oauth";
import { getFile } from "@/lib/drive/read";
import { FOLDER_MIME } from "@/lib/drive/tree";
import { runDriveSync, type DriveSyncResult } from "@/lib/jobs/drive";
import { ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES } from "@/lib/drive/uploads";
import { createStagedUploadUrl } from "@/lib/storage";

function syncSummary(r: DriveSyncResult) {
  if (r.status !== "ok") return `Drive sync ${r.status}${r.reason ? `: ${r.reason}` : ""}`;
  return `Drive sync: ${r.files} files in ${r.folders} folders, ${r.matched} matched to holdings${r.unmatched.length ? `; unmatched folders: ${r.unmatched.slice(0, 5).join(", ")}${r.unmatched.length > 5 ? "…" : ""}` : ""}`;
}

function back(message: string, ok: boolean): never {
  revalidatePath("/admin");
  redirect(`/admin?${ok ? "ok" : "error"}=${encodeURIComponent(message)}`);
}

export async function setDriveRoot(fd: FormData) {
  await requireAdmin();
  const id = parseFolderId(String(fd.get("root") ?? ""));
  if (!id) back("Paste a Google Drive folder URL or folder id", false);
  let message: string;
  let ok = false;
  try {
    const f = await getFile(id);
    if (f.mimeType !== FOLDER_MIME) {
      message = `"${f.name}" is not a folder`;
    } else {
      await db.update(driveConnection).set({ rootFolderId: id, rootFolderName: f.name, lastError: null, lastSyncAt: null }).where(eq(driveConnection.id, 1));
      const r = await runDriveSync({ reason: "root set" });
      ok = r.status !== "failed";
      message = `Root folder set to "${f.name}". ${syncSummary(r)}`;
    }
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  back(message, ok);
}

export async function syncDriveNow() {
  await requireAdmin();
  const r = await runDriveSync({ reason: "admin" });
  back(syncSummary(r), r.status !== "failed");
}

/** Revokes our own token and clears the index. Nothing in Drive changes. */
export async function disconnectDrive() {
  await requireAdmin();
  const conn = await loadConnection();
  if (conn) await revokeStoredToken(conn);
  await db.delete(driveFiles);
  await db.delete(driveConnection);
  clearTokenCache();
  back("Google Drive disconnected. Files in the Drive were not touched.", true);
}

const stageSchema = z.object({
  holdingId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "File is larger than 50MB"),
  mimeType: z.string().max(200).optional(),
});

/** Step 1 of a document upload: validate and hand the browser a signed Storage URL (bypasses request-size limits). */
export async function stageDocumentUpload(input: { holdingId: string; fileName: string; size: number; mimeType?: string }): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in again" };
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid upload" };
  const [h] = await db.select({ teamId: holdings.teamId }).from(holdings).where(eq(holdings.id, parsed.data.holdingId)).limit(1);
  if (!h || !canAccessTeam(user, h.teamId)) return { ok: false, error: "Holding not found" };
  const ext = parsed.data.fileName.toLowerCase().split(".").pop() ?? "";
  if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) return { ok: false, error: `Allowed types: ${ALLOWED_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(", ")}` };
  const status = await driveStatus();
  if (!status.connected || !status.rootFolderId) return { ok: false, error: "Google Drive is not connected. Ask an admin to connect it from the Admin page." };
  if (status.needsReconnect) return { ok: false, error: "Google Drive needs to be reconnected by an admin." };
  const safeName = parsed.data.fileName.replace(/[^\w.\- ()]+/g, "_");
  try {
    const staged = await createStagedUploadUrl(`staging/${Date.now()}-${randomUUID()}/${safeName}`);
    return { ok: true, ...staged };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
