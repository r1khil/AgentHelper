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

export const db = globalThis.__owlfundDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__owlfundDb = db;
export { schema };
