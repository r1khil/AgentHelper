import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { NY } from "@/lib/providers/calendar";
import { inRange, makeEvent } from "./normalize";
import type { CalendarRange, EconomicCalendarProvider } from "./types";

const scalar = z.union([z.string(), z.number().finite()]).nullish();
const value = (v: string | number | null | undefined): string | null => {
  const s = v == null ? "" : String(v).trim();
  return !s || /^(null|none|n\/a|nan|--|—)$/i.test(s) ? null : s;
};
const required = (v: string | number | null | undefined) => {
  const s = value(v);
  if (!s) throw new Error("Missing calendar identity");
  return s;
};
const instant = (s: string, zone = "utc") => {
  const d = DateTime.fromISO(s.replace(" ", "T"), { zone });
  if (!d.isValid) throw new Error("Invalid calendar timestamp");
  return d;
};
const safeUrl = (s: string | null | undefined) => {
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
};
const teRow = z.object({
  CalendarId: scalar,
  CalendarID: scalar,
  Country: z.string(),
  Date: z.string(),
  Event: z.string(),
  Category: scalar,
  Reference: scalar,
  ReferenceDate: scalar,
  Actual: scalar,
  Forecast: scalar,
  Previous: scalar,
  Revised: scalar,
  Unit: scalar,
  Currency: scalar,
  Importance: scalar,
  DateSpan: scalar,
  LastUpdate: scalar,
  Source: scalar,
  SourceURL: z.string().nullish(),
});

export function parseTradingEconomics(body: unknown) {
  return z
    .array(teRow)
    .parse(body)
    .filter((r) => r.Country === "United States")
    .map((r) => {
      const d = instant(r.Date);
      const precise = String(r.DateSpan) === "0";
      return makeEvent({
        id: `te:${required(r.CalendarId ?? r.CalendarID)}`,
        date: d.setZone(NY).toISODate()!,
        timestamp: precise ? d.toUTC().toISO()! : null,
        tentative: !precise,
        name: required(r.Event),
        category: value(r.Category),
        period: value(r.Reference) ?? value(r.ReferenceDate),
        // Forecast is the economist survey. TEForecast is deliberately not read.
        estimate: value(r.Forecast),
        actual: value(r.Actual),
        previous: value(r.Previous),
        previousBeforeRevision: value(r.Revised),
        unit: value(r.Unit),
        currency: value(r.Currency),
        referenceDate: value(r.ReferenceDate),
        importance: [1, 2, 3].includes(Number(r.Importance))
          ? (Number(r.Importance) as 1 | 2 | 3)
          : null,
        source: value(r.Source) ?? "Trading Economics",
        sourceUrl: safeUrl(r.SourceURL),
        updatedAt: value(r.LastUpdate)
          ? instant(value(r.LastUpdate)!).toUTC().toISO()
          : null,
      });
    });
}

const eodRow = z.object({
  type: z.string(),
  comparison: scalar,
  period: scalar,
  country: z.string(),
  date: z.string(),
  actual: scalar,
  estimate: scalar,
  previous: scalar,
});
export function parseEodhd(body: unknown, timezone: string) {
  // EODHD's published schema does not specify a timezone. Require confirmation
  // from the account/provider rather than silently treating naive dates as UTC.
  if (!timezone || !DateTime.now().setZone(timezone).isValid)
    throw new Error(
      "Set EODHD_CALENDAR_TIMEZONE to the provider-confirmed timezone",
    );
  return z
    .array(eodRow)
    .parse(body)
    .filter((r) => r.country === "US")
    .map((r) => {
      const d = instant(r.date, timezone);
      const comparison = value(r.comparison);
      const identity = JSON.stringify([
        r.country,
        r.date,
        r.type,
        comparison,
        value(r.period),
      ]);
      return makeEvent({
        id: `eodhd:${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`,
        date: d.setZone(NY).toISODate()!,
        timestamp: d.toUTC().toISO()!,
        name: `${required(r.type)}${comparison ? ` (${comparison})` : ""}`,
        category: r.type,
        period: value(r.period),
        actual: value(r.actual),
        estimate: value(r.estimate),
        previous: value(r.previous),
        // This endpoint does not provide units, revision history or importance.
        source: "EODHD",
        sourceUrl: "https://eodhd.com/financial-apis/economic-events-data-api",
      });
    });
}

async function request(url: URL, fetcher: typeof fetch): Promise<unknown> {
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 5_000_000) throw new Error("Oversized response");
    return JSON.parse(body);
  } catch (error) {
    // Never leak credential-bearing URLs, response bodies or fetch errors.
    const code =
      error instanceof Error && /^HTTP \d{3}$/.test(error.message)
        ? error.message
        : "Calendar request failed";
    throw new Error(code);
  }
}
function through(range: CalendarRange) {
  return DateTime.fromISO(range.to).plus({ days: 1 }).toISODate()!;
}
export function tradingEconomicsProvider(
  key: string,
  fetcher: typeof fetch = fetch,
): EconomicCalendarProvider {
  return {
    name: "Trading Economics",
    async getEvents(range) {
      const url = new URL(
        `https://api.tradingeconomics.com/calendar/country/united%20states/${range.from}/${through(range)}`,
      );
      url.search = new URLSearchParams({ c: key, f: "json" }).toString();
      const events = inRange(
        parseTradingEconomics(await request(url, fetcher)),
        range,
      );
      return {
        events,
        sources: [
          {
            name: "Trading Economics",
            url: "https://docs.tradingeconomics.com/economic_calendar/",
            status: "ok",
            count: events.length,
          },
        ],
      };
    },
  };
}
export function eodhdProvider(
  key: string,
  timezone: string,
  fetcher: typeof fetch = fetch,
): EconomicCalendarProvider {
  return {
    name: "EODHD",
    async getEvents(range) {
      // Validate configuration before spending an API call.
      parseEodhd([], timezone);
      const events = [];
      for (const offset of [0, 1000]) {
        const url = new URL("https://eodhd.com/api/economic-events");
        url.search = new URLSearchParams({
          api_token: key,
          fmt: "json",
          country: "US",
          from: DateTime.fromISO(range.from).minus({ days: 1 }).toISODate()!,
          to: through(range),
          limit: "1000",
          offset: String(offset),
        }).toString();
        const body = await request(url, fetcher);
        const rows = parseEodhd(body, timezone);
        events.push(...rows);
        if ((body as unknown[]).length < 1000) {
          const filtered = inRange(events, range);
          return {
            events: filtered,
            sources: [
              {
                name: "EODHD",
                url: "https://eodhd.com/financial-apis/economic-events-data-api",
                status: "ok" as const,
                count: filtered.length,
              },
            ],
            coverage: {
              status: "partial" as const,
              message:
                "EODHD supplies actual, estimate and previous where available, but this endpoint does not supply units, importance or revision history. Those fields remain unavailable.",
            },
          };
        }
      }
      throw new Error(
        "EODHD pagination limit reached; refusing a truncated calendar",
      );
    },
  };
}
