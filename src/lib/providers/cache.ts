
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

/**
 * Cache a provider call. Memory first, then the provider_cache table, then the network.
 * The DB layer is optional so providers work in scripts and tests without a database.
 */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>, opts: { db?: boolean } = {}): Promise<T> {
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
  if (opts.db !== false && process.env.DATABASE_URL) await dbSet(key, entry);
  return payload;
}
