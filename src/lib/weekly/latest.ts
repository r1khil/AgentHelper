import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { weeklyUpdates } from "@/db/schema";
import { weeklyEmailRecipients } from "./email";
import { packStatus, type PackStatus } from "./status";

/** The newest pack and its status, for the Weekly update tab badge and Hoot's nudge. Null when there are no packs. */
export async function latestPackStatus(): Promise<{ weekEnding: string; state: PackStatus } | null> {
  const [[row], recipients] = await Promise.all([
    db
      .select({ weekEnding: weeklyUpdates.weekEnding, status: weeklyUpdates.status, sources: weeklyUpdates.sources })
      .from(weeklyUpdates)
      .orderBy(desc(weeklyUpdates.weekEnding))
      .limit(1),
    weeklyEmailRecipients(),
  ]);
  if (!row) return null;
  return { weekEnding: row.weekEnding, state: packStatus({ weekEnding: row.weekEnding, status: row.status, email: row.sources?.email }, { paused: !recipients.to }) };
}
