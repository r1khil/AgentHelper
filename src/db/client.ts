import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __owlfundDb: ReturnType<typeof createDb> | undefined;
  var __owlfundTxDb: ReturnType<typeof createDb> | undefined;
}

function createDb(pipeline: boolean) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Supabase transaction pooler: no prepared statements. It also drops the reply to a query written onto a
  // connection that is still busy, which postgres.js does once every connection is in use (pipelining). That
  // query never settles, so the request hangs until the function times out. max_pipeline: 0 queues instead.
  // A variable, not a literal: postgres.js accepts max_pipeline but leaves it out of its option types.
  const options = { prepare: false, max: 5, ...(pipeline ? {} : { max_pipeline: 0 }) };
  return drizzle(postgres(url, options), { schema });
}

function getDb() {
  if (!globalThis.__owlfundDb) globalThis.__owlfundDb = createDb(false);
  return globalThis.__owlfundDb;
}

// max_pipeline: 0 makes sql.begin() fail with UNSAFE_TRANSACTION in postgres.js 3.4.9, so transactions get
// their own client. The pooler holds one backend for a whole transaction, so pipelining is safe inside it.
function getTxDb() {
  if (!globalThis.__owlfundTxDb) globalThis.__owlfundTxDb = createDb(true);
  return globalThis.__owlfundTxDb;
}

// Lazy: the connection is created on first query, never at import time, so builds without
// DATABASE_URL still succeed and only requests fail loudly.
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_t, prop) {
    const real = (prop === "transaction" ? getTxDb() : getDb()) as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});
export { schema };
