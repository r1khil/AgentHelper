// Deploy helper: store a source bundle in the private Supabase bucket and print a 7-day signed link
// for Vercel's install script to fetch. Usage: npx tsx scripts/upload-source-bundle.ts .deploy/source.tgz <sha>
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const [file, sha] = process.argv.slice(2);
  if (!file || !sha) throw new Error("usage: upload-source-bundle.ts file.tgz sha");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const path = `deploy/source-${sha}.tgz`;
  const { error } = await supabase.storage.from("models").upload(path, await readFile(file), { contentType: "application/octet-stream", upsert: true });
  if (error) throw error;
  const { data, error: e2 } = await supabase.storage.from("models").createSignedUrl(path, 60 * 60 * 24 * 7);
  if (e2 || !data) throw e2 ?? new Error("no signed url");
  console.log(data.signedUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
