import "server-only";
import { cached } from "@/lib/providers/cache";
import { publicCalendarProvider } from "./public-provider";
import type { CalendarFeed, CalendarRange } from "./types";

const pending = new Map<string, Promise<CalendarFeed>>();
export async function getEconomicCalendar(
  range: CalendarRange,
): Promise<CalendarFeed> {
  const provider = publicCalendarProvider();
  const cacheKey = `public-calendar:feed:v1:${range.from}:${range.to}`;
  const running = pending.get(cacheKey);
  if (running) return running;
  const request = cached(cacheKey, 60, async () => ({
    ...range,
    ...(await provider.getEvents(range)),
    provider: provider.name,
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
