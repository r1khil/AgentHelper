import { DateTime } from "luxon";
import { z } from "zod";
import { NY } from "@/lib/providers/calendar";
import type {
  CalendarRange,
  EconomicEvent,
  EconomicCalendarProvider,
} from "./types";

const value = z.union([z.string(), z.number()]).nullish();
const rowSchema = z.object({
  CalendarId: z.union([z.string(), z.number()]),
  Date: z.string(),
  Country: z.string(),
  Event: z.string().min(1),
  Category: value,
  Reference: value,
  Actual: value,
  Forecast: value,
  Previous: value,
  Revised: value,
  Importance: value,
  Source: value,
  DateSpan: value,
  LastUpdate: value,
});
const text = (v: unknown): string | null =>
  v === null || v === undefined || String(v).trim() === ""
    ? null
    : String(v).trim();
function utcDate(v: string) {
  const date = DateTime.fromISO(v, { zone: "utc" });
  if (!date.isValid)
    throw new Error("The calendar provider returned an invalid timestamp.");
  return date;
}

/** Validate the whole response; never silently discard malformed releases. TE timestamps are UTC. */
export function normalizeEvents(
  payload: unknown,
  range: CalendarRange,
): EconomicEvent[] {
  const parsed = z.array(rowSchema).safeParse(payload);
  if (!parsed.success)
    throw new Error("The calendar provider returned an unexpected response.");
  const unique = new Map<string, EconomicEvent>();
  for (const r of parsed.data) {
    if (r.Country.toLowerCase() !== "united states")
      throw new Error(
        "The provider did not honor the U.S. calendar request. Check calendar access.",
      );
    const date = utcDate(r.Date).setZone(NY);
    const localDay = date.toISODate()!;
    if (localDay < range.from || localDay > range.to) continue;
    const importance = Number(r.Importance);
    const event: EconomicEvent = {
      id: String(r.CalendarId),
      timestamp: date.toUTC().toISO()!,
      date: localDay,
      time: date.toFormat("h:mm a"),
      tentative: String(r.DateSpan) === "1",
      name: r.Event,
      category: text(r.Category),
      period: text(r.Reference),
      actual: text(r.Actual),
      estimate: text(r.Forecast),
      previous: text(r.Previous),
      previousBeforeRevision: text(r.Revised),
      importance:
        importance === 1 || importance === 2 || importance === 3
          ? importance
          : null,
      source: text(r.Source),
      updatedAt: text(r.LastUpdate)
        ? utcDate(String(r.LastUpdate)).toISO()
        : null,
    };
    const old = unique.get(event.id);
    if (!old || (event.updatedAt ?? "") >= (old.updatedAt ?? ""))
      unique.set(event.id, event);
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
  );
}

export function tradingEconomicsProvider(
  key: string,
  fetcher: typeof fetch = fetch,
): EconomicCalendarProvider {
  return {
    name: "Trading Economics",
    async getEvents(range) {
      // Include the extra UTC day covering late Eastern releases, including DST transitions.
      const through = DateTime.fromISO(range.to).plus({ days: 1 }).toISODate()!;
      const url = new URL(
        `https://api.tradingeconomics.com/calendar/country/united%20states/${range.from}/${through}`,
      );
      url.searchParams.set("f", "json");
      const response = await fetcher(url, {
        headers: { Authorization: key, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new Error(
          `Calendar provider unavailable (HTTP ${response.status}). Check API access or try again shortly.`,
        );
      const payload: unknown = await response.json();
      // TE documents a 1,000-row cap. Fail visibly instead of presenting truncated coverage.
      if (Array.isArray(payload) && payload.length >= 1000)
        throw new Error(
          "Provider result limit reached. Select a shorter date range.",
        );
      return normalizeEvents(payload, range);
    },
  };
}
