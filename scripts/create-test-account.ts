// Creates a username + password account without the browser, the same way the Admin page does.
// Usage: npx tsx scripts/create-test-account.ts <username> <password> --name "Full Name" [--role associate_analyst] [--team tech]
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { createPasswordAccount, passwordAccountSchema } from "../src/lib/members";

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: "string" },
      role: { type: "string", default: "associate_analyst" },
      team: { type: "string" },
    },
  });
  const [username, password] = positionals;
  if (!username || !password || !values.name) {
    throw new Error('Usage: tsx scripts/create-test-account.ts <username> <password> --name "Full Name" [--role associate_analyst] [--team tech]');
  }
  const url = process.env.DATABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("DATABASE_URL and SUPABASE_SECRET_KEY are required");

  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql, { schema });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    let teamId: string | null = null;
    if (values.team) {
      const [team] = await db.select({ id: schema.teams.id }).from(schema.teams).where(eq(schema.teams.slug, values.team)).limit(1);
      if (!team) throw new Error(`No team with slug "${values.team}"`);
      teamId = team.id;
    }
    const parsed = passwordAccountSchema.safeParse({ username, password, fullName: values.name, role: values.role, teamId });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    const result = await createPasswordAccount({ db, supabase }, parsed.data);
    if (!result.ok) throw new Error(result.error);
    console.log(`Created username '${parsed.data.username}' (${parsed.data.role}${values.team ? `, team ${values.team}` : ""}). First sign-in goes through setup.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
