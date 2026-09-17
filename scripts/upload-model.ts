// Admin helper: upload a workbook for a holding without the browser. Usage: npx tsx scripts/upload-model.ts NVDA path/to/model.xlsx
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

async function main() {
  const [ticker, file] = process.argv.slice(2);
  if (!ticker || !file) throw new Error("usage: upload-model.ts TICKER file.xlsx");
  const { readWorkbook } = await import("../src/lib/excel/read");
  const buffer = await readFile(file);
  const sheets = (await readWorkbook(buffer)).sheets;
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const [h] = await sql`select id from holdings where ticker = ${ticker.toUpperCase()} and status = 'active' limit 1`;
  if (!h) throw new Error(`No active holding ${ticker}`);
  const [{ max }] = await sql`select coalesce(max(version), 0)::int as max from models where holding_id = ${h.id}`;
  const version = max + 1;
  const path = `${h.id}/v${version}-${Date.now()}.xlsx`;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { error } = await supabase.storage.from("models").upload(path, buffer, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (error) throw error;
  const [m] = await sql`insert into models (holding_id, version, storage_path, file_name, sheets) values (${h.id}, ${version}, ${path}, ${basename(file)}, ${sql.json(sheets as never)}) returning id`;
  console.log(`uploaded ${basename(file)} as v${version}: model ${m.id}`);
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
