import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __owlfundDb: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Supabase transaction pooler: no prepared statements.
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

function getDb() {
  if (!globalThis.__owlfundDb) globalThis.__owlfundDb = createDb();
  return globalThis.__owlfundDb;
}

// Lazy: the connection is created on first query, never at import time, so builds without
// DATABASE_URL still succeed and only requests fail loudly.
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});
export { schema };
