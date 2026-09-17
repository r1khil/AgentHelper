// Applies one drizzle SQL file to DATABASE_URL, statement by statement.
// Usage: npx tsx scripts/apply-sql.ts drizzle/0003_onboarding.sql
// Use this when the schema was applied outside drizzle-kit (Supabase SQL editor / MCP) and the
// migrations journal is not tracked in the database.
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "node:fs";
import postgres from "postgres";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/apply-sql.ts <path/to/file.sql>");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
        console.log(`ok: ${statement.split("\n").find((l) => !l.startsWith("--"))?.slice(0, 80)}`);
      }
    });
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
