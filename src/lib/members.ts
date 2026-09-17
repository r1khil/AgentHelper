// Password (test) account creation, shared by the Admin action and scripts/create-test-account.ts.
// Takes its clients as parameters because the app's db and admin modules are server-only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import * as schema from "@/db/schema";
import { ROLES, usernameToEmail } from "@/lib/constants";

export const passwordAccountSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "3-32 chars: letters, digits, . _ -"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().min(1, "Enter a full name").max(120),
  role: z.enum(ROLES),
  teamId: z.string().uuid().nullable(),
});

export type PasswordAccountInput = z.infer<typeof passwordAccountSchema>;

export type PasswordAccountDeps = {
  db: PostgresJsDatabase<typeof schema>;
  supabase: SupabaseClient;
};

export type PasswordAccountResult = { ok: true; id: string; email: string } | { ok: false; error: string };

/** Creates the auth user and its profile. New accounts have not been through first-sign-in setup. */
export async function createPasswordAccount(deps: PasswordAccountDeps, input: PasswordAccountInput): Promise<PasswordAccountResult> {
  const { username, password, fullName, role, teamId } = input;
  const email = usernameToEmail(username);
  const { data, error } = await deps.supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "Could not create the account" };
  const authUser = data.user;
  try {
    await deps.db.insert(schema.profiles).values({ id: authUser.id, email, username, fullName, role, kind: "password", teamId });
  } catch (e) {
    await deps.supabase.auth.admin.deleteUser(authUser.id);
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the profile" };
  }
  return { ok: true, id: authUser.id, email };
}
