// Stores CRON_SECRET and APP_URL from .env.local in Supabase Vault, where drizzle/0017_evening_schedule.sql's
// pg_cron jobs read them. Re-running updates both. The values never leave this process except to the database.
// Usage: npx tsx scripts/set-cron-secrets.ts   (ENV_FILE=<path> reads another env file, e.g. one from `vercel env pull`)
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });
config();
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  const secret = process.env.CRON_SECRET;
  const appUrl = (process.env.CRON_APP_URL || "https://owlfund-workspace.vercel.app").replace(/\/$/, "");
  if (!url || !secret) throw new Error("DATABASE_URL and CRON_SECRET are required");
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    for (const [name, value] of [["cron_secret", secret], ["app_url", appUrl]] as const) {
      const [row] = await sql`select id from vault.secrets where name = ${name}`;
      if (row) await sql`select vault.update_secret(${row.id}, ${value})`;
      else await sql`select vault.create_secret(${value}, ${name})`;
      console.log(`ok: ${name}${name === "app_url" ? ` = ${value}` : ""}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
