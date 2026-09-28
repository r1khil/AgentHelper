import { currentTrace } from "@/lib/trace/context";
import { hostFromKey } from "@/lib/trace/events";

type Entry = { payload: unknown; expiresAt: number };
const memory = new Map<string, Entry>();

async function dbGet(key: string): Promise<Entry | null> {
  try {
    const { db } = await import("@/db/client");
    const { providerCache } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(providerCache).where(eq(providerCache.key, key)).limit(1);
    if (!row) return null;
    return { payload: row.payload, expiresAt: row.expiresAt.getTime() };
  } catch {
    return null;
  }
}

async function dbSet(key: string, entry: Entry) {
  try {
    const { db } = await import("@/db/client");
    const { providerCache } = await import("@/db/schema");
    await db
      .insert(providerCache)
      .values({ key, payload: entry.payload as object, expiresAt: new Date(entry.expiresAt), fetchedAt: new Date() })
      .onConflictDoUpdate({ target: providerCache.key, set: { payload: entry.payload as object, expiresAt: new Date(entry.expiresAt), fetchedAt: new Date() } });
  } catch {
    // Cache is best-effort; the in-memory copy still applies for this process.
  }
}

/** Approximate serialized size, only computed when a trace is listening. Large payloads are sampled, not measured. */
const BYTES_CAP = 2_000_000;
function approxBytes(payload: unknown): number | undefined {
  try {
    if (typeof payload === "string") return payload.length;
    const s = JSON.stringify(payload);
    return s === undefined ? undefined : Math.min(s.length, BYTES_CAP);
  } catch {
    return undefined;
  }
}

/**
 * Cache a provider call. Memory first, then the provider_cache table, then the network.
 * The DB layer is optional so providers work in scripts and tests without a database. `persist: false` still reads
 * the table but keeps a fresh result in memory only, for requests that must not write (a page being opened).
 * When a transparency trace is active, each lookup reports which layer answered it.
 */
type CacheOpts = { db?: boolean; persist?: boolean };

export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>, opts: CacheOpts = {}): Promise<T> {
  const trace = currentTrace();
  if (!trace) return cachedUntraced(key, ttlSeconds, fn, opts);

  const host = hostFromKey(key);
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expiresAt > now) {
    trace.emit({ t: "fetch", host, key, layer: "memory", ms: 0, bytes: approxBytes(mem.payload), ttlSeconds, ok: true });
    return mem.payload as T;
  }
  if (opts.db !== false && process.env.DATABASE_URL) {
    const t0 = Date.now();
    const hit = await dbGet(key);
    if (hit && hit.expiresAt > now) {
      memory.set(key, hit);
      trace.emit({ t: "fetch", host, key, layer: "db", ms: Date.now() - t0, bytes: approxBytes(hit.payload), ttlSeconds, ok: true });
      return hit.payload as T;
    }
  }
  const t0 = Date.now();
  let payload: T;
  try {
    payload = await fn();
  } catch (e) {
    trace.emit({ t: "fetch", host, key, layer: "network", ms: Date.now() - t0, ttlSeconds, ok: false, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
  trace.emit({ t: "fetch", host, key, layer: "network", ms: Date.now() - t0, bytes: approxBytes(payload), ttlSeconds, ok: true });
  const entry = { payload, expiresAt: now + ttlSeconds * 1000 };
  memory.set(key, entry);
  if (opts.db !== false && opts.persist !== false && process.env.DATABASE_URL) await dbSet(key, entry);
  return payload;
}

/** Write a value directly, for callers that keep a copy on the side, such as a last good snapshot. */
export async function storeCached(key: string, ttlSeconds: number, payload: unknown, opts: { db?: boolean } = {}) {
  const entry = { payload, expiresAt: Date.now() + ttlSeconds * 1000 };
  memory.set(key, entry);
  if (opts.db !== false && process.env.DATABASE_URL) await dbSet(key, entry);
}

/** Read an unexpired value from memory or the provider_cache table without loading anything. */
export async function readCached<T>(key: string, opts: { db?: boolean } = {}): Promise<T | null> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expiresAt > now) return mem.payload as T;
  if (opts.db !== false && process.env.DATABASE_URL) {
    const hit = await dbGet(key);
    if (hit && hit.expiresAt > now) {
      memory.set(key, hit);
      return hit.payload as T;
    }
  }
  return null;
}

async function cachedUntraced<T>(key: string, ttlSeconds: number, fn: () => Promise<T>, opts: CacheOpts): Promise<T> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expiresAt > now) return mem.payload as T;
  if (opts.db !== false && process.env.DATABASE_URL) {
    const hit = await dbGet(key);
    if (hit && hit.expiresAt > now) {
      memory.set(key, hit);
      return hit.payload as T;
    }
  }
  const payload = await fn();
  const entry = { payload, expiresAt: now + ttlSeconds * 1000 };
  memory.set(key, entry);
  if (opts.db !== false && opts.persist !== false && process.env.DATABASE_URL) await dbSet(key, entry);
  return payload;
}
