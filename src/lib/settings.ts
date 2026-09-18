import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string, updatedBy: string | null) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy, updatedAt: new Date() } });
}
