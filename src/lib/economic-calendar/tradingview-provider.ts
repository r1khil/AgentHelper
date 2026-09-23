import { DateTime } from "luxon";
import { z } from "zod";
import { NY } from "@/lib/providers/calendar";
import { CalendarNotice, inRange, makeEvent, text } from "./normalize";
import type { EconomicCalendarProvider } from "./types";

// The feed behind tradingview.com/economic-calendar. It carries Trading Economics' calendar: exact
// release times, actuals within minutes of a print, previous values and the consensus forecast.
// It is not a documented API and answers only requests carrying the calendar page's Origin.
export const TRADINGVIEW_URL = "https://economic-calendar.tradingview.com/events";
export const TRADINGVIEW_PAGE = "https://www.tradingview.com/economic-calendar/";

const num = z.number().finite().nullish();
const rowSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().min(1),
  country: z.string(),
  indicator: z.string().nullish(),
  category: z.string().nullish(),
  period: z.string().nullish(),
  referenceDate: z.string().nullish(),
  source: z.string().nullish(),
  source_url: z.string().nullish(),
  actual: num,
  previous: num,
  forecast: num,
  currency: z.string().nullish(),
  unit: z.string().nullish(),
  scale: z.string().nullish(),
  importance: z.number().int(),
  date: z.string().datetime({ offset: true }),
});
const bodySchema = z.object({ status: z.literal("ok"), result: z.array(rowSchema) });

const CATEGORY: Record<string, string> = {
  bnd: "Bonds",
  bsnss: "Business",
  cnsm: "Consumer",
  enrg: "Energy",
  gdp: "GDP",
  gov: "Government",
  hse: "Housing",
  lbr: "Labor",
  mny: "Money",
  mrkt: "Markets",
  prce: "Prices",
  trd: "Trade",
};

/** "0.4%", "201K", "-$255B", "53B": the shapes the page reads when it compares a print with consensus. */
export function formatValue(n: number | null | undefined, unit?: string | null, scale?: string | null) {
  if (n === null || n === undefined) return null;
  const suffix = scale ?? "";
  if (unit === "%") return `${n}%`;
  if (unit === "$") return `${n < 0 ? "-" : ""}$${Math.abs(n)}${suffix}`;
  return `${n}${suffix}`;
}

/** "Aug" → "Aug 2026", "Q2" → "Q2 2026", "Sep/19" → "Week ending Sep 19". */
function periodLabel(period: string | null | undefined, referenceDate: string | null | undefined) {
  const p = text(period);
  if (!p) return null;
  const ref = referenceDate ? DateTime.fromISO(referenceDate, { zone: "utc" }) : null;
  const year = ref?.isValid ? ` ${ref.year}` : "";
  if (/^[A-Z][a-z]{2}\/\d{2}$/.test(p)) return `Week ending ${p.replace("/", " ")}`;
  if (/^(?:[A-Z][a-z]{2}|Q[1-4]|H[12])$/.test(p)) return `${p}${year}`;
  return p;
}

export function parseTradingView(body: unknown) {
  return bodySchema
    .parse(body)
    .result.filter((r) => r.country === "US")
    .map((r) => {
      const at = DateTime.fromISO(r.date, { zone: "utc" });
      // Holidays, summits and other all-day items sit at UTC midnight with no clock time.
      const allDay = at.hour === 0 && at.minute === 0 && at.second === 0;
      const unit = r.unit === "%" || r.unit === "$" ? null : text(r.unit);
      const value = (n: number | null | undefined) => formatValue(n, r.unit, r.scale);
      return makeEvent({
        id: `tv:${r.id}`,
        date: allDay ? at.toISODate()! : at.setZone(NY).toISODate()!,
        timestamp: allDay ? null : at.toISO()!,
        ...(allDay ? { time: "All day", tentative: false } : {}),
        name: r.title,
        category: (r.category && CATEGORY[r.category]) ?? text(r.indicator),
        period: periodLabel(r.period, r.referenceDate),
        referenceDate: text(r.referenceDate),
        actual: value(r.actual),
        // TradingView publishes this column as the market's expected value for the release.
        estimate: value(r.forecast),
        previous: value(r.previous),
        unit,
        currency: text(r.currency),
        importance: ({ [-1]: 1, 0: 2, 1: 3 } as Record<number, 1 | 2 | 3>)[r.importance] ?? null,
        source: text(r.source) ?? "TradingView",
        sourceUrl: r.source_url && /^https?:\/\//i.test(r.source_url) ? r.source_url : undefined,
      });
    });
}

export function tradingViewProvider(fetcher: typeof fetch = fetch): EconomicCalendarProvider {
  return {
    name: "TradingView",
    url: TRADINGVIEW_PAGE,
    async getEvents(range) {
      // A day either side, so all-day items stamped at UTC midnight still land on their own day.
      const from = DateTime.fromISO(range.from, { zone: NY }).minus({ days: 1 });
      const to = DateTime.fromISO(range.to, { zone: NY }).plus({ days: 2 });
      const url = new URL(TRADINGVIEW_URL);
      url.search = new URLSearchParams({
        from: from.toUTC().toISO()!,
        to: to.toUTC().toISO()!,
        countries: "US",
      }).toString();
      const response = await fetcher(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { Accept: "application/json", Origin: "https://www.tradingview.com" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.text();
      if (raw.length > 5_000_000) throw new Error("Oversized TradingView response");
      const body: unknown = JSON.parse(raw);
      // About five weeks out the feed answers {"status":"ok"} with no result at all: nothing published yet.
      if (body && typeof body === "object" && !("result" in body))
        throw new CalendarNotice("not published this far ahead");
      const events = inRange(parseTradingView(body), range);
      return {
        events,
        sources: [{ name: "TradingView", url: TRADINGVIEW_PAGE, status: "ok", count: events.length }],
      };
    },
  };
}
