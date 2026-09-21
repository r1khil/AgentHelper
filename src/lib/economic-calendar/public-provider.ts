import { DateTime } from "luxon";
import { cached } from "@/lib/providers/cache";
import {
  AGENCY_URLS,
  parseAgencyICS,
  parseAgencyValues,
  parseCensusIndicators,
  parseFedCalendar,
} from "./agency-parsers";
import { inRange } from "./normalize";
import type {
  CalendarSourceStatus,
  EconomicCalendarProvider,
  EconomicEvent,
} from "./types";

type Cache = <T>(
  key: string,
  seconds: number,
  load: () => Promise<T>,
) => Promise<T>;
/** Failed sources are remembered briefly so client polling cannot hammer an agency that is down. */
const FAILURE_TTL_MS = 30_000;
const recentFailures = new Map<string, { error: Error; until: number }>();
/** Test isolation only. */
export function forgetCalendarFailures() {
  recentFailures.clear();
}
const MAX_BODY_BYTES = 5_000_000;
export const REQUEST_TIMEOUT_MS = 10_000;

/** BLS returns 403 to User-Agents containing a URL; its usage policy asks for a contact address instead. */
export function calendarUserAgent(
  env: Record<string, string | undefined> = process.env,
) {
  const contact = env.CALENDAR_CONTACT_EMAIL?.trim();
  return contact ? `OwlFundCalendar/1.0 (${contact})` : "OwlFundCalendar/1.0";
}
export const COVERAGE_MESSAGE =
  "Partial coverage: agency schedules and reported values are live, but private surveys, regional Fed events and consensus estimates are not fully covered. Some reports have separate schedule and value records. This is not yet a complete MarketWatch replacement.";

/** Stop reading as soon as the cap is passed instead of buffering an unbounded body first. */
async function readBounded(response: Response): Promise<string> {
  if (!response.body)
    return (await response.text()).slice(0, MAX_BODY_BYTES + 1);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Source response exceeded expected size");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export function publicCalendarProvider(
  fetcher: typeof fetch = fetch,
  cache: Cache = cached,
): EconomicCalendarProvider {
  return {
    name: "Public agency feeds",
    async getEvents(range) {
      const through = DateTime.fromISO(range.to).plus({ days: 1 }).toISODate()!;
      const valuesURL = `${AGENCY_URLS.xoomar}?${new URLSearchParams({ from: range.from, to: through })}`;
      const sources = [
        {
          name: "BLS schedules",
          url: AGENCY_URLS.bls,
          parse: (s: string) => parseAgencyICS(s, "BLS"),
        },
        {
          name: "BEA schedules",
          url: AGENCY_URLS.bea,
          parse: (s: string) => parseAgencyICS(s, "BEA"),
        },
        {
          name: "Federal Reserve calendar",
          url: AGENCY_URLS.fed,
          parse: (s: string) => parseFedCalendar(JSON.parse(s)),
        },
        {
          name: "Census indicators",
          url: AGENCY_URLS.census,
          parse: parseCensusIndicators,
        },
        {
          name: "Agency values via XOOMAR",
          url: valuesURL,
          parse: (s: string) => parseAgencyValues(JSON.parse(s)),
        },
      ];
      const results = await Promise.allSettled(
        sources.map(async (source) => {
          const failed = recentFailures.get(source.url);
          if (failed && failed.until > Date.now()) throw failed.error;
          try {
            return await cache(
              `public-calendar:v1:${source.url}`,
              300,
              async () => {
                const response = await fetcher(source.url, {
                  cache: "no-store",
                  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                  headers: {
                    Accept: "application/json, text/calendar, text/html",
                    "User-Agent": calendarUserAgent(),
                  },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const declared = Number(
                  response.headers.get("content-length") ?? 0,
                );
                if (declared > MAX_BODY_BYTES)
                  throw new Error("Source response exceeded expected size");
                const body = await readBounded(response);
                return source.parse(body.replace(/^\uFEFF/, ""));
              },
            );
          } catch (error) {
            recentFailures.set(source.url, {
              error: error instanceof Error ? error : new Error(String(error)),
              until: Date.now() + FAILURE_TTL_MS,
            });
            throw error;
          }
        }),
      );
      const statuses: CalendarSourceStatus[] = [];
      const events: EconomicEvent[] = [];
      results.forEach((result, i) => {
        const source = sources[i];
        if (result.status === "fulfilled") {
          const rows = inRange(result.value, range);
          events.push(...rows);
          statuses.push({
            name: source.name,
            url: source.url,
            status: "ok",
            count: rows.length,
          });
        } else {
          // Only expose safe operational codes, never arbitrary upstream response content.
          const status =
            result.reason instanceof Error
              ? result.reason.message.match(/^HTTP \d{3}$/)?.[0]
              : null;
          statuses.push({
            name: source.name,
            url: source.url,
            status: "unavailable",
            count: 0,
            error: status ?? "Feed could not be loaded or validated",
          });
        }
      });
      if (statuses.every((s) => s.status === "unavailable"))
        throw new Error(
          "All public calendar sources are unavailable. Try again shortly.",
        );
      return {
        events: inRange(events, range),
        sources: statuses,
        coverage: { status: "partial", message: COVERAGE_MESSAGE },
      };
    },
  };
}
