import "server-only";
import { db } from "@/db/client";
import { usageEvents } from "@/db/schema";
import type { UsageEventInput } from "./events";

/** production | preview | development: Admin's Usage tab reads production only, since local runs share the database. */
export const usageEnv = () => process.env.VERCEL_ENV ?? "development";

/** Saves usage events for a member. Never throws: losing a usage row must not fail what the member was doing. */
export async function recordUsage(userId: string, events: (UsageEventInput & { sessionId?: string | null })[]) {
  if (events.length === 0) return;
  try {
    const env = usageEnv();
    await db.insert(usageEvents).values(
      events.map((e) => ({
        userId,
        sessionId: e.sessionId ?? null,
        name: e.name,
        at: e.at ? new Date(e.at) : undefined,
        route: e.route ?? null,
        team: e.team ?? null,
        props: e.props ?? {},
        env,
      })),
    );
  } catch (e) {
    console.warn(`[usage] not recorded: ${e instanceof Error ? e.message : String(e)}`);
  }
}
