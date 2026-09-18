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
