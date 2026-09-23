import { DateTime } from "luxon";
import { z } from "zod";
import { NY } from "@/lib/providers/calendar";
import type { CalendarRange, EconomicEvent } from "./types";

// FXStreet's calendar feed, used as a second opinion on top of whichever provider answered: it fills
// consensus the provider lacks (all of it when TradingView is down) and supplies the value a
// previous reading had before it was revised, which TradingView doesn't carry. Like TradingView's,
// it is not a documented API; it answers only requests carrying fxstreet.com as the Referer.
export const FXSTREET_URL = "https://calendar-api.fxstreet.com/en/api/v1/eventDates";
export const FXSTREET_PAGE = "https://www.fxstreet.com/economic-calendar";

const num = z.number().finite().nullish();
const rowSchema = z.object({
  dateUtc: z.string().datetime({ offset: true }),
  name: z.string().min(1),
  countryCode: z.string(),
  actual: num,
  consensus: num,
  previous: num,
  revised: num,
  unit: z.string().nullish(),
});
export type FxStreetRow = z.infer<typeof rowSchema>;

export function parseFxStreet(body: unknown): FxStreetRow[] {
  return z
    .array(rowSchema)
    .parse(body)
    .filter((r) => r.countryCode === "US");
}

export async function loadFxStreet(
  range: CalendarRange,
  fetcher: typeof fetch = fetch,
): Promise<FxStreetRow[]> {
  const from = DateTime.fromISO(range.from, { zone: NY }).minus({ days: 1 });
  const to = DateTime.fromISO(range.to, { zone: NY }).plus({ days: 2 });
  const iso = (d: DateTime) => d.toUTC().toISO({ suppressMilliseconds: true })!;
  const url = new URL(`${FXSTREET_URL}/${iso(from)}/${iso(to)}`);
  url.search = new URLSearchParams({ countries: "US" }).toString();
  const response = await fetcher(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
    headers: { Accept: "application/json", Referer: "https://www.fxstreet.com/" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await response.text();
  if (raw.length > 5_000_000) throw new Error("Oversized FXStreet response");
  return parseFxStreet(JSON.parse(raw));
}

const VALUE = /^([+-])?(\$)?([+-])?(\d[\d,]*(?:\.\d+)?)(.*)$/;

/** "196K" → 196, "-$255B" → -255, "0.4%" → 0.4. Null for anything that isn't a plain figure. */
export function figure(value: string | null) {
  const m = value?.trim().replace(/−/g, "-").match(VALUE);
  if (!m) return null;
  return (m[1] === "-" || m[3] === "-" ? -1 : 1) * Number(m[4].replace(/,/g, ""));
}

/** Write a number in the same shape as a sibling value, so "196K" lends its K to 201. */
function styledLike(n: number, like: string) {
  const m = like.trim().replace(/−/g, "-").match(VALUE)!;
  const suffix = m[5];
  return m[2] ? `${n < 0 ? "-" : ""}$${Math.abs(n)}${suffix}` : `${n}${suffix}`;
}

/** Providers name one release differently ("Inflation Rate MoM" vs "Consumer Price Index (MoM)"). */
const SYNONYMS: [RegExp, string][] = [
  [/consumer price index|inflation rate/g, "cpi"],
  [/producer price index/g, "ppi"],
  [/personal consumption expenditures?(?: prices?)?(?: price index)?|pce price index/g, "pce"],
  [/gross domestic product/g, "gdp"],
  [/ex food (?:&|and) energy/g, "core"],
  [/non ?farm/g, "nonfarm"],
  [/goods and services trade balance|balance of trade/g, "tradebalance"],
];
const GENERIC = new Set(
  "mom yoy qoq m y q s a sa nsa n index rate change prel preliminary final flash adv advance 2nd 3rd est annualized the of us u and total".split(" "),
);
function words(name: string) {
  let s = name.toLowerCase();
  for (const [pattern, word] of SYNONYMS) s = s.replace(pattern, word);
  return new Set((s.match(/[a-z0-9]+/g) ?? []).filter((w) => !GENERIC.has(w)));
}
const same = (a: number | null | undefined, b: number | null) =>
  a != null && b !== null && Math.abs(a - b) <= 1e-9 + 1e-6 * Math.abs(b);

/**
 * The FXStreet row for an event: released the same minute, with the same previous reading (after
 * revision) and actual, sharing a meaningful word in the name. Anything less than exactly one such
 * row is no match, so a coincidence of values can't borrow another series' consensus.
 */
export function matchFxStreet(event: EconomicEvent, byMinute: Map<string, FxStreetRow[]>) {
  const previous = figure(event.previous);
  if (!event.timestamp || previous === null) return null;
  const actual = figure(event.actual);
  const name = words(event.name);
  const found = (byMinute.get(event.timestamp.slice(0, 16)) ?? []).filter(
    (r) =>
      same(r.revised ?? r.previous, previous) &&
      (actual === null || r.actual == null || same(r.actual, actual)) &&
      [...words(r.name)].some((w) => name.has(w)),
  );
  return found.length === 1 ? found[0] : null;
}

/**
 * Fill each event's missing consensus and pre-revision previous from its FXStreet match. Values the
 * provider already has are never replaced.
 */
export function overlayFxStreet(events: EconomicEvent[], rows: FxStreetRow[]) {
  const byMinute = new Map<string, FxStreetRow[]>();
  for (const r of rows) {
    const minute = DateTime.fromISO(r.dateUtc, { zone: "utc" }).toISO()!.slice(0, 16);
    byMinute.set(minute, [...(byMinute.get(minute) ?? []), r]);
  }
  let matched = 0;
  let consensus = 0;
  const out = events.map((event) => {
    const row = matchFxStreet(event, byMinute);
    if (!row) return event;
    matched++;
    const next = { ...event };
    // TradingView leaves units off releases a few weeks out; FXStreet knows a percent is a percent.
    if (row.unit === "%")
      for (const key of ["actual", "estimate", "previous", "previousBeforeRevision"] as const) {
        const v = next[key];
        if (v && /^[+-]?\d[\d,]*(?:\.\d+)?$/.test(v.trim())) next[key] = `${v.trim()}%`;
      }
    if (next.estimate === null && row.consensus != null) {
      next.estimate = styledLike(row.consensus, next.previous!);
      next.estimateSource = "FXStreet";
      consensus++;
    }
    if (
      next.previousBeforeRevision === null &&
      row.revised != null &&
      row.previous != null &&
      !same(row.previous, row.revised)
    )
      next.previousBeforeRevision = styledLike(row.previous, next.previous!);
    return next;
  });
  return { events: out, matched, consensus };
}
