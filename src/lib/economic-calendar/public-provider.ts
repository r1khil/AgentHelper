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
export const COVERAGE_MESSAGE =
  "Partial coverage: agency schedules and reported values are live, but private surveys, regional Fed events and consensus estimates are not fully covered. Some reports have separate schedule and value records. This is not yet a complete MarketWatch replacement.";

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
        sources.map((source) =>
          cache(`public-calendar:v1:${source.url}`, 300, async () => {
            const response = await fetcher(source.url, {
              cache: "no-store",
              signal: AbortSignal.timeout(15_000),
              headers: {
                Accept: "application/json, text/calendar, text/html",
                "User-Agent":
                  "OwlFundCalendar/1.0 (+https://github.com/r1khil/AgentHelper)",
              },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const body = (await response.text()).replace(/^\uFEFF/, "");
            if (body.length > 5_000_000)
              throw new Error("Source response exceeded expected size");
            return source.parse(body);
          }),
        ),
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
