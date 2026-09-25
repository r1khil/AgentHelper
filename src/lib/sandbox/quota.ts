import "server-only";
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { NY } from "@/lib/providers/calendar";

/** Python runs each member may start per New York day; the Hobby Sandbox quota is shared by the whole Fund. */
export const DAILY_RUN_LIMIT = 30;

export const runCounterKey = (userId: string, day: string) => `sandbox_runs:${userId}:${day}`;
export const nyDay = () => DateTime.now().setZone(NY).toISODate()!;

/** Counts one run and returns the member's total for today, in a single atomic upsert on app_settings. */
export async function countSandboxRun(userId: string, day = nyDay()): Promise<number> {
  const key = runCounterKey(userId, day);
  const [row] = await db
    .insert(appSettings)
    .values({ key, value: "1", updatedBy: userId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: sql`(coalesce(nullif(${appSettings.value}, ''), '0')::int + 1)::text`, updatedAt: new Date() },
    })
    .returning({ value: appSettings.value });
  return Number(row?.value ?? 1);
}
