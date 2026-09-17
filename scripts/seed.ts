import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { invitations, profiles } from "../src/db/schema";

const ADMIN_EMAIL = "rsharma@theowlfund.com";
const ADMIN_NAME = "Rikhil Sharma";
const TEST_ADMIN_USERNAME = "admin";
const TEST_DOMAIN = "accounts.owlfund.local";

async function main() {
  const url = process.env.DATABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!url || !secret) throw new Error("DATABASE_URL and SUPABASE_SECRET_KEY are required");
  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Google admin: an invitation so the first Google sign-in creates the profile.
  const hasProfile = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, ADMIN_EMAIL)).limit(1);
  if (!hasProfile.length) {
    await db
      .insert(invitations)
      .values({ email: ADMIN_EMAIL, fullName: ADMIN_NAME, role: "admin", teamId: null })
      .onConflictDoUpdate({ target: invitations.email, set: { role: "admin", fullName: ADMIN_NAME } });
    console.log(`Invitation ready for ${ADMIN_EMAIL} (admin)`);
  } else {
    console.log(`${ADMIN_EMAIL} already has a profile`);
  }

  // Password admin for local testing before Google is configured.
  if (!password) {
    console.log("SEED_ADMIN_PASSWORD not set; skipping the 'admin' username account");
  } else {
    const email = `${TEST_ADMIN_USERNAME}@${TEST_DOMAIN}`;
    const existing = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, TEST_ADMIN_USERNAME)).limit(1);
    if (existing.length) {
      const { error } = await supabase.auth.admin.updateUserById(existing[0].id, { password });
      if (error) throw error;
      console.log("Updated password for username 'admin'");
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: TEST_ADMIN_USERNAME, full_name: "Fund Admin" },
      });
      if (error || !data.user) throw error ?? new Error("createUser failed");
      await db.insert(profiles).values({
        id: data.user.id,
        email,
        username: TEST_ADMIN_USERNAME,
        fullName: "Fund Admin",
        role: "admin",
        kind: "password",
        teamId: null,
      });
      console.log("Created username 'admin' (role admin)");
    }
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
