import "server-only";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

/**
 * A deployment-wide lock kept in app_settings (value = ISO start time). Claiming is one atomic upsert; a lock
 * older than `staleMs` belongs to a run the platform killed and is taken over.
 */
export async function claimJobLock(name: string, staleMs: number): Promise<boolean> {
  const key = `lock:${name}`;
  const now = new Date();
  const stale = new Date(now.getTime() - staleMs).toISOString();
  const rows = await db
    .insert(appSettings)
    .values({ key, value: now.toISOString(), updatedBy: null })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: now.toISOString(), updatedAt: now },
      setWhere: or(eq(appSettings.value, ""), lt(appSettings.value, stale)),
    })
    .returning({ key: appSettings.key });
  return rows.length > 0;
}

export async function releaseJobLock(name: string): Promise<void> {
  await db
    .update(appSettings)
    .set({ value: "", updatedAt: new Date() })
    .where(and(eq(appSettings.key, `lock:${name}`), sql`true`))
    .catch(() => undefined);
}
