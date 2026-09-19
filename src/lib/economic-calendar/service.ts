import "server-only";
import { createHash } from "node:crypto";
import { cached } from "@/lib/providers/cache";
import { spaced } from "@/lib/providers/limiter";
import { tradingEconomicsProvider } from "./trading-economics";
import type { CalendarFeed, CalendarRange } from "./types";

export class CalendarNotConfigured extends Error {}
const pending = new Map<string, Promise<CalendarFeed>>();
export async function getEconomicCalendar(
  range: CalendarRange,
): Promise<CalendarFeed> {
  const key = process.env.TRADING_ECONOMICS_API_KEY?.trim();
  if (!key)
    throw new CalendarNotConfigured(
      "Economic calendar is not connected. An administrator must configure Trading Economics calendar access.",
    );
  const provider = tradingEconomicsProvider(key);
  const cacheKey = `tradingeconomics:calendar:v1:${createHash("sha256").update(key).digest("hex").slice(0, 16)}:${range.from}:${range.to}`;
  const running = pending.get(cacheKey);
  if (running) return running;
  const request = cached(cacheKey, 15, () =>
    spaced("tradingeconomics", 1000, async () => ({
      ...range,
      events: await provider.getEvents(range),
      provider: provider.name,
      mode: "live" as const,
      fetchedAt: new Date().toISOString(),
    })),
  );
  pending.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pending.delete(cacheKey);
  }
}
