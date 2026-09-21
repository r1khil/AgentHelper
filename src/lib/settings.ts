import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

/** Settings are read on every chat turn and ingest step; a short in-process memo keeps that off the database. */
const MEMO_TTL_MS = 60_000;
const memo = new Map<string, { value: string | null; at: number }>();

export async function getSetting(key: string, opts: { fresh?: boolean } = {}): Promise<string | null> {
  const hit = memo.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.value;
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  const value = row?.value ?? null;
  memo.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(key: string, value: string, updatedBy: string | null) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy, updatedAt: new Date() } });
  memo.delete(key);
}

/** Forget memoized values (tests, or after a write made outside setSetting). */
export function clearSettingsMemo(key?: string) {
  if (key) memo.delete(key);
  else memo.clear();
}
