"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
import { ensureDriveWatch, runDriveSync, stopDriveWatch, type DriveSyncResult } from "@/lib/jobs/drive";
import { runIngest, type IngestResult } from "@/lib/jobs/ingest";
import { pruneDriveDocuments } from "@/lib/documents/index";
import { ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES } from "@/lib/drive/uploads";
import { createStagedUploadUrl } from "@/lib/storage";

function syncSummary(r: DriveSyncResult) {
  if (r.status !== "ok") return `Drive sync ${r.status}${r.reason ? `: ${r.reason}` : ""}`;
  return `Drive sync: ${r.files} files in ${r.folders} folders, ${r.matched} matched to holdings${r.unmatched.length ? `; unmatched folders: ${r.unmatched.slice(0, 5).join(", ")}${r.unmatched.length > 5 ? "…" : ""}` : ""}. Reading files continues in the background.`;
}

/** Reading files takes minutes; it runs after the redirect so the admin page never waits on it. */
function ingestInBackground(reason: string, opts: { budgetMs: number; maxFiles: number }) {
  after(async () => {
    const r: IngestResult = await runIngest({ reason, kinds: ["drive"], budgetMs: opts.budgetMs, maxDocs: opts.maxFiles });
    if (r.status !== "ok") console.warn(`[drive] ingest (${reason}) ${r.status}${r.reason ? `: ${r.reason}` : ""}`);
  });
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
      ingestInBackground("root set", { budgetMs: 240_000, maxFiles: 20 });
      ok = r.status !== "failed";
      const w = await ensureDriveWatch({ force: true });
      message = `Root folder set to "${f.name}". ${syncSummary(r)}${w.status === "ok" ? " Live updates on." : w.reason ? ` Live updates off: ${w.reason}.` : ""}`;
    }
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  back(message, ok);
}

export async function syncDriveNow() {
  await requireAdmin();
  const r = await runDriveSync({ reason: "admin" });
  if (r.status === "ok") ingestInBackground("admin", { budgetMs: 240_000, maxFiles: 20 });
  back(syncSummary(r), r.status !== "failed");
}

/** Register (or re-register) the Drive change-notification channel for this deployment. */
export async function renewDriveWatchNow() {
  await requireAdmin();
  const w = await ensureDriveWatch({ force: true });
  back(w.status === "ok" ? `Live updates on${w.expiration ? ` until ${w.expiration.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}.` : `Live updates ${w.status}${w.reason ? `: ${w.reason}` : ""}`, w.status === "ok");
}

/** Summarize and embed matched files that are not current yet, within one function's budget. */
export async function ingestDriveNow() {
  await requireAdmin();
  ingestInBackground("admin", { budgetMs: 240_000, maxFiles: 40 });
  back("Reading files in the background; the counts above update as it goes. A run already in progress is left alone.", true);
}

/** Revokes our own token and clears the index. Nothing in Drive changes. */
export async function disconnectDrive() {
  await requireAdmin();
  const conn = await loadConnection();
  if (conn) {
    await stopDriveWatch().catch(() => undefined);
    await revokeStoredToken(conn);
  }
  await db.delete(driveFiles);
  await pruneDriveDocuments([]);
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
