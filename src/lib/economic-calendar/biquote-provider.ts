import { DateTime } from "luxon";
import { z } from "zod";
import { NY } from "@/lib/providers/calendar";
import { inRange, makeEvent } from "./normalize";
import type { EconomicCalendarProvider } from "./types";

export const BIQUOTE_URL = "https://biquote.io/api/calendar";
const rowSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  time: z.string().datetime({ offset: true }),
  period: z.string().nullable(),
  countryCode: z.string(),
  currency: z.string().nullable(),
  name: z.string().min(1),
  importance: z.enum(["none", "low", "medium", "high"]),
  type: z.string(),
  sector: z.string().nullable(),
  unit: z.string().nullable(),
  multiplier: z.string().nullable(),
  actual: z.number().finite().nullable(),
  forecast: z.number().finite().nullable(),
  previous: z.number().finite().nullable(),
  revisedPrevious: z.number().finite().nullable(),
  timeMode: z.enum(["exact", "date", "notime", "tentative"]),
  sourceUrl: z.string().nullable(),
  source: z.string(),
});
const stringValue = (n: number | null) => (n === null ? null : String(n));

export function parseBiquote(body: unknown) {
  const rows = z
    .array(rowSchema)
    .parse(body)
    .filter((r) => r.countryCode === "US");
  // Some auctions appear twice: a schedule row and the reported observation,
  // with different value IDs but the same provider series/time/period/units.
  const distinct = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = JSON.stringify([
      row.eventId,
      row.time,
      row.period,
      row.unit,
      row.multiplier,
    ]);
    const old = distinct.get(key);
    if (!old || (old.actual === null && row.actual !== null))
      distinct.set(key, row);
    else if (
      old.actual !== null &&
      row.actual !== null &&
      old.actual !== row.actual
    )
      throw new Error("Conflicting biquote observations for one release");
  }
  return [...distinct.values()].map((r) => {
    const time = DateTime.fromISO(r.time, { setZone: true });
    if (!time.isValid) throw new Error("Invalid biquote release date");
    const exact = r.timeMode === "exact";
    const revised = r.revisedPrevious !== null;
    const units = [
      r.multiplier,
      r.unit === "currency" ? r.currency : r.unit,
    ].filter((v) => v && v !== "none");
    return makeEvent({
      id: `biquote:${r.id}`,
      // A non-exact clock is a placeholder: retain the supplied calendar day.
      date: exact ? time.setZone(NY).toISODate()! : r.time.slice(0, 10),
      timestamp: exact ? time.toUTC().toISO()! : null,
      tentative: !exact,
      name: r.name,
      category: r.sector ?? r.type,
      period: r.period ? r.period.slice(0, 10) : null,
      referenceDate: r.period,
      actual: stringValue(r.actual),
      // This feed's forecast methodology is not verified as economist consensus.
      // Preserve it as separate metadata; never present it as Estimate.
      estimate: null,
      providerForecast: stringValue(r.forecast),
      previous: stringValue(revised ? r.revisedPrevious : r.previous),
      previousBeforeRevision: revised ? stringValue(r.previous) : null,
      unit: units.join(" ") || null,
      currency: r.currency,
      importance: ({ none: null, low: 1, medium: 2, high: 3 } as const)[
        r.importance
      ],
      source: `biquote · ${r.source}`,
      sourceUrl:
        r.sourceUrl && /^https?:\/\//i.test(r.sourceUrl)
          ? r.sourceUrl
          : undefined,
    });
  });
}

export function biquoteProvider(
  fetcher: typeof fetch = fetch,
): EconomicCalendarProvider {
  return {
    name: "biquote (free)",
    async getEvents(range) {
      const start = DateTime.fromISO(range.from, { zone: NY }).startOf("day");
      const end = DateTime.fromISO(range.to, { zone: NY })
        .plus({ days: 1 })
        .startOf("day");
      async function load(
        from: number,
        to: number,
        depth = 0,
      ): Promise<ReturnType<typeof parseBiquote>> {
        const url = new URL(BIQUOTE_URL);
        url.search = new URLSearchParams({
          countries: "US",
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          limit: "500",
        }).toString();
        const response = await fetcher(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.text();
        if (raw.length > 5_000_000)
          throw new Error("Oversized biquote response");
        const body: unknown = JSON.parse(raw);
        const events = parseBiquote(body);
        if ((body as unknown[]).length >= 500) {
          if (depth >= 6)
            throw new Error(
              "biquote result limit reached; refusing truncation",
            );
          const middle = Math.floor((from + to) / 2);
          // Inclusive boundaries can overlap; source IDs dedupe them below.
          return [
            ...(await load(from, middle, depth + 1)),
            ...(await load(middle, to, depth + 1)),
          ];
        }
        return events;
      }
      // Pad for date-only events, whose placeholder UTC clock must not shift days.
      const events = inRange(
        await load(start.minus({ days: 1 }).toMillis(), end.toMillis()),
        range,
      );
      return {
        events,
        sources: [
          {
            name: "biquote",
            url: "https://biquote.io/docs/",
            status: "ok",
            count: events.length,
          },
        ],
        coverage: {
          status: "partial",
          message:
            "Free biquote feed. Estimate is unavailable because its forecasts have not been verified as economist consensus. Coverage and release timing depend on the provider; missing values remain blank.",
        },
      };
    },
  };
}
