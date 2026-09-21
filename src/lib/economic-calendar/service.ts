import "server-only";
import { cached } from "@/lib/providers/cache";
import {
  calendarConfiguration,
  loadConfiguredCalendar,
} from "./provider-selection";
import type { CalendarFeed, CalendarRange } from "./types";

const pending = new Map<string, Promise<CalendarFeed>>();
export async function getEconomicCalendar(
  range: CalendarRange,
): Promise<CalendarFeed> {
  const config = calendarConfiguration();
  const cacheKey = `economic-calendar:feed:v3:${config.cacheScope}:${range.from}:${range.to}`;
  const running = pending.get(cacheKey);
  if (running) return running;
  const request = cached(cacheKey, 60, async () => ({
    ...range,
    ...(await loadConfiguredCalendar(range, config)),
    mode: "live" as const,
    fetchedAt: new Date().toISOString(),
  }));
  pending.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pending.delete(cacheKey);
  }
}
