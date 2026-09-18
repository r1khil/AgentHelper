import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { MODEL_BUCKET as BUCKET, MODEL_CONTENT_TYPES } from "@/lib/models/upload";

export async function uploadModelFile(path: string, data: Buffer, contentType = MODEL_CONTENT_TYPES.xlsx) {
  const { error } = await createSupabaseAdmin().storage.from(BUCKET).upload(path, data, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

export async function downloadModelFile(path: string): Promise<Buffer> {
  const { data, error } = await createSupabaseAdmin().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Download failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function signedModelUrl(path: string, fileName: string) {
  const { data, error } = await createSupabaseAdmin().storage.from(BUCKET).createSignedUrl(path, 60 * 10, { download: fileName });
  if (error || !data) throw new Error(`Could not sign URL: ${error?.message ?? "unknown"}`);
  return data.signedUrl;
}

/** Token the browser uses with `uploadToSignedUrl` to PUT straight into the bucket (valid two hours, no RLS needed). */
export async function signModelUpload(path: string) {
  const { data, error } = await createSupabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not create upload URL: ${error?.message ?? "unknown"}`);
  return { path: data.path, token: data.token };
}

export async function moveModelFile(from: string, to: string) {
  const { error } = await createSupabaseAdmin().storage.from(BUCKET).move(from, to);
  if (error) throw new Error(`Move failed: ${error.message}`);
  return to;
}

export async function deleteModelFile(path: string) {
  const { error } = await createSupabaseAdmin().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

// ---- staged document uploads (browser → Storage → server → Google Drive) ----
export const STAGING_PREFIX = "staging/";

export async function createStagedUploadUrl(path: string) {
  if (!path.startsWith(STAGING_PREFIX)) throw new Error("Staged uploads must live under staging/");
  return signModelUpload(path);
}

/** Remove the app's own temporary copy after it has been pushed to Drive. Refuses anything outside staging/. */
export async function removeStagedFile(path: string) {
  if (!path.startsWith(STAGING_PREFIX)) throw new Error("Only staged files can be removed");
  await deleteModelFile(path);
}

/** Staged folders are named `<epoch ms>-<uuid>`; drop any older than the window (default 24h). */
export async function purgeStagedUploads(olderThanMs = 24 * 60 * 60 * 1000) {
  const storage = createSupabaseAdmin().storage.from(BUCKET);
  const { data: dirs, error } = await storage.list("staging", { limit: 1000 });
  if (error || !dirs) return 0;
  const cutoff = Date.now() - olderThanMs;
  let removed = 0;
  for (const d of dirs) {
    const stamp = Number(d.name.split("-")[0]);
    if (!Number.isFinite(stamp) || stamp > cutoff) continue;
    const { data: files } = await storage.list(`staging/${d.name}`, { limit: 100 });
    const paths = (files ?? []).map((f) => `staging/${d.name}/${f.name}`);
    if (paths.length) {
      const { error: rmErr } = await storage.remove(paths);
      if (!rmErr) removed += paths.length;
    }
  }
  return removed;
}
