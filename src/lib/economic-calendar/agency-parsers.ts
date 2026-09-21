import { DateTime } from "luxon";
import { z } from "zod";
import { NY } from "@/lib/providers/calendar";
import { makeEvent, text } from "./normalize";
import type { EconomicEvent } from "./types";

export const AGENCY_URLS = {
  bls: "https://www.bls.gov/schedule/news_release/bls.ics",
  bea: "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics",
  fed: "https://www.federalreserve.gov/json/calendar.json",
  census: "https://www.census.gov/economic-indicators/",
  xoomar: "https://xoomar.com/api/markets/calendar",
};
const unescapeICS = (s: string) =>
  s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

/** RFC5545 event records only; never parse the rendered calendar table. */
export function parseAgencyICS(
  body: string,
  source: "BLS" | "BEA",
): EconomicEvent[] {
  if (!body.includes("BEGIN:VCALENDAR") || !body.includes("END:VCALENDAR"))
    throw new Error("Invalid iCalendar response");
  const unfolded = body.replace(/\r?\n[ \t]/g, "");
  const events: EconomicEvent[] = [];
  for (const block of unfolded.matchAll(
    /BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g,
  )) {
    const fields = new Map<string, { params: string; value: string }>();
    for (const line of block[1].split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const [name, ...params] = line.slice(0, colon).split(";");
      fields.set(name.toUpperCase(), {
        params: params.join(";"),
        value: unescapeICS(line.slice(colon + 1)),
      });
    }
    if (fields.get("STATUS")?.value === "CANCELLED") continue;
    // Agency feeds currently enumerate releases. Refuse unknown recurrence instead of quietly dropping dates.
    if (fields.has("RRULE") || fields.has("RDATE"))
      throw new Error(
        "Agency changed to recurring events; recurrence support is required",
      );
    const start = fields.get("DTSTART");
    const summary = fields.get("SUMMARY")?.value;
    if (!start || !summary)
      throw new Error("Calendar event is missing date or name");
    const zone = start.value.endsWith("Z")
      ? "utc"
      : (start.params.match(/TZID="?([^;\"]+)/)?.[1] ?? NY);
    const allDay = /^\d{8}$/.test(start.value);
    const instant = DateTime.fromFormat(
      start.value,
      allDay
        ? "yyyyMMdd"
        : start.value.endsWith("Z")
          ? "yyyyMMdd'T'HHmmss'Z'"
          : "yyyyMMdd'T'HHmmss",
      { zone: zone === "US-Eastern" ? NY : zone },
    );
    if (!instant.isValid) throw new Error("Invalid agency calendar time");
    const period =
      summary.match(
        /(?:, | for )((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}|(?:[1-4](?:st|nd|rd|th) [Qq]uarter).*?\d{4})/,
      )?.[1] ?? null;
    const updated = fields.get("DTSTAMP")?.value;
    const stamp = updated
      ? DateTime.fromFormat(updated, "yyyyMMdd'T'HHmmss'Z'", { zone: "utc" })
      : null;
    events.push(
      makeEvent({
        id: `${source}:${fields.get("UID")?.value ?? summary}:${instant.toISODate()}`,
        date: instant.setZone(NY).toISODate()!,
        timestamp: allDay ? null : instant.toUTC().toISO()!,
        name: summary,
        source,
        sourceUrl: source === "BLS" ? AGENCY_URLS.bls : AGENCY_URLS.bea,
        period,
        category: "Agency release",
        updatedAt: stamp?.isValid ? stamp.toISO() : null,
      }),
    );
  }
  return events;
}

const fedSchema = z.object({
  events: z.array(
    z.object({
      month: z.string().optional(),
      days: z.string().optional(),
      title: z.string().optional(),
      time: z.string().optional(),
      type: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
});
export function parseFedCalendar(body: unknown): EconomicEvent[] {
  const { events } = fedSchema.parse(body);
  return events.flatMap((row) => {
    if (Object.keys(row).length === 0 || row.month === "") return []; // Publisher includes undated archive records and a trailing empty sentinel.
    if (!row.month || !row.days || !row.title)
      throw new Error("Malformed Federal Reserve event");
    return row.days.split(",").map((day) => {
      const date = `${row.month}-${day.trim().padStart(2, "0")}`;
      const cleaned = row.time?.replaceAll(".", "").trim().toUpperCase();
      const parsed = cleaned
        ? DateTime.fromFormat(`${date} ${cleaned}`, "yyyy-MM-dd h:mm a", {
            zone: NY,
          })
        : null;
      const timestamp = parsed?.isValid ? parsed.toUTC().toISO()! : null;
      return makeEvent({
        date,
        timestamp,
        time: timestamp ? undefined : row.time || "TBA",
        name: row.title!,
        category: row.type ?? "Federal Reserve",
        source: "Federal Reserve Board",
        sourceUrl: "https://www.federalreserve.gov/newsevents/calendar.htm",
      });
    });
  });
}

/** Read the Census publisher's embedded JSON object; no table/DOM scraping or JS evaluation. */
export function extractCensusJSON(body: string): unknown {
  const match = /\b(?:let|const|var)\s+g_cidrOutput\s*=\s*/.exec(body);
  if (!match) throw new Error("Census structured data is missing");
  const start = match.index + match[0].length;
  if (body[start] !== "{") throw new Error("Invalid Census data object");
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0)
      return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error("Truncated Census structured data");
}
const val = z.union([z.string(), z.number()]).nullish();
const censusSchema = z.record(
  z.string(),
  z.object({
    programName: z.string(),
    indicatorName: z.string(),
    relDate: z.string(),
    nextRelDate: z.string().optional(),
    statPeriod: val,
    value: val,
    compValue: val,
    unitsOfMeasure: val,
    lastUpdated: val,
  }),
);
function censusDate(s: string) {
  const parsed = DateTime.fromFormat(
    s.replace(/(\d+)(?:st|nd|rd|th)/g, "$1"),
    "MMMM d, yyyy",
    { zone: NY, locale: "en-US" },
  );
  if (!parsed.isValid) throw new Error("Invalid Census release date");
  return parsed.toISODate()!;
}
export function parseCensusIndicators(body: string): EconomicEvent[] {
  const data = censusSchema.parse(extractCensusJSON(body));
  return Object.entries(data).flatMap(([key, row]) => {
    // relTime in the embedded object does not consistently match the published schedule.
    // Keep time unknown; do not invent a timezone or reuse it for future releases.
    const shared = {
      name: row.indicatorName,
      category: row.programName,
      source: "U.S. Census Bureau",
      sourceUrl: AGENCY_URLS.census,
      unit: text(row.unitsOfMeasure),
      updatedAt:
        row.lastUpdated && Number.isFinite(Number(row.lastUpdated))
          ? DateTime.fromSeconds(Number(row.lastUpdated)).toUTC().toISO()
          : null,
    };
    const date = censusDate(row.relDate);
    const latest = makeEvent({
      ...shared,
      id: `census:${key}:${date}`,
      date,
      period: text(row.statPeriod),
      actual: text(row.value),
      previous: text(row.compValue),
    });
    const next = row.nextRelDate ? censusDate(row.nextRelDate) : null;
    return [
      latest,
      ...(next && next !== date
        ? [
            makeEvent({
              ...shared,
              id: `census:${key}:${next}`,
              date: next,
              previous: text(row.value),
            }),
          ]
        : []),
    ];
  });
}
const xoomarSchema = z.object({
  data: z.array(
    z.object({
      source: z.string(),
      eventName: z.string(),
      scheduledAt: z.string(),
      periodLabel: val,
      actual: val,
      previous: val,
      unit: val,
      importance: z.string().nullish(),
    }),
  ),
  updatedAt: z.string(),
});
export function parseAgencyValues(body: unknown): EconomicEvent[] {
  const data = xoomarSchema.parse(body);
  return data.data.map((row) => {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(row.scheduledAt))
      throw new Error("Value source timestamp needs a timezone");
    const instant = DateTime.fromISO(row.scheduledAt).setZone(NY);
    if (!instant.isValid) throw new Error("Invalid value source timestamp");
    return makeEvent({
      date: instant.toISODate()!,
      timestamp: instant.toUTC().toISO()!,
      name: row.eventName,
      source: `${row.source.toUpperCase()} via XOOMAR`,
      sourceUrl: "https://xoomar.com/markets/api/calendar",
      category: row.source,
      period: text(row.periodLabel),
      actual: text(row.actual),
      previous: text(row.previous),
      unit: text(row.unit),
      importance:
        row.importance === "high"
          ? 3
          : row.importance === "med"
            ? 2
            : row.importance === "low"
              ? 1
              : null,
      updatedAt: data.updatedAt,
    });
  });
}
