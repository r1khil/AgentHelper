import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "models";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function uploadModelFile(path: string, data: Buffer, contentType = XLSX) {
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
