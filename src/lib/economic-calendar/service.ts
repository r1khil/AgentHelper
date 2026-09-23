import "server-only";
import { DateTime } from "luxon";
import { cached, readCached, storeCached } from "@/lib/providers/cache";
import { NY } from "@/lib/providers/calendar";
import {
  CalendarUnavailableError,
  calendarConfiguration,
  loadConfiguredCalendar,
} from "./provider-selection";
import type { CalendarFeed, CalendarRange } from "./types";

/** How long the last copy of a week that loaded is kept to show through an outage. */
const LAST_GOOD_SECONDS = 30 * 86_400;
/** How long a stale copy answers before every source is tried again. */
const STALE_RETRY_SECONDS = 30;

const pending = new Map<string, Promise<CalendarFeed>>();
export async function getEconomicCalendar(
  range: CalendarRange,
): Promise<CalendarFeed> {
  const config = calendarConfiguration();
  const cacheKey = `economic-calendar:feed:v5:${config.cacheScope}:${range.from}:${range.to}`;
  const lastGoodKey = `economic-calendar:last-good:v1:${range.from}:${range.to}`;
  const running = pending.get(cacheKey);
  if (running) return running;
  const request = cached(cacheKey, 60, async () => {
    const feed: CalendarFeed = {
      ...range,
      ...(await loadConfiguredCalendar(range, config)),
      mode: "live",
      fetchedAt: new Date().toISOString(),
    };
    await storeCached(lastGoodKey, LAST_GOOD_SECONDS, feed);
    return feed;
  }).catch(async (error: unknown) => {
    // Every source failed. An older copy of the same week, labeled as such, beats an error page.
    const saved = await readCached<CalendarFeed>(lastGoodKey);
    if (!saved) throw error;
    const loaded = DateTime.fromISO(saved.fetchedAt).setZone(NY);
    const feed: CalendarFeed = {
      ...saved,
      stale: true,
      sources:
        error instanceof CalendarUnavailableError
          ? error.sources
          : saved.sources,
      coverage: {
        status: "partial",
        message: `Live calendar sources are unavailable, so this is the copy loaded ${loaded.toFormat("ccc MMM d 'at' h:mm a")} ET. Anything released or rescheduled since then is missing.`,
      },
    };
    await storeCached(cacheKey, STALE_RETRY_SECONDS, feed);
    return feed;
  });
  pending.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pending.delete(cacheKey);
  }
}
