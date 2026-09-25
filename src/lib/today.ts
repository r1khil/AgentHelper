import { DateTime } from "luxon";
import { NY } from "@/lib/providers/calendar";

export type UpcomingReport = { ticker: string; reportDate: string; reportHour: string | null; dateStatus: "confirmed" | "estimated" };

const HOUR_LABEL: Record<string, string> = { amc: "after close", bmo: "before the open" };

function listJoin(items: string[]) {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * One day's reports as a sentence: "META and GOOG after close, EVR before the open, MSFT". Reports with no
 * time come last. "(est.)" marks unconfirmed dates: once at the end when none is confirmed, else per ticker.
 */
export function reportsLine(reports: UpcomingReport[]): string {
  const allEstimated = reports.every((r) => r.dateStatus === "estimated");
  const name = (r: UpcomingReport) => (!allEstimated && r.dateStatus === "estimated" ? `${r.ticker} (est.)` : r.ticker);
  const order = ["amc", "bmo", ""];
  const groups = order
    .map((hour) => ({ hour, tickers: reports.filter((r) => (HOUR_LABEL[r.reportHour ?? ""] ? r.reportHour : "") === hour).map(name) }))
    .filter((g) => g.tickers.length);
  const line = groups.map((g) => `${listJoin(g.tickers)}${g.hour ? ` ${HOUR_LABEL[g.hour]}` : ""}`).join(", ");
  return allEstimated ? `${line} (est.)` : line;
}

/** Upcoming reports grouped by date, the first `days` dates, and what is left after them. */
export function reportDays(reports: UpcomingReport[], days: number) {
  const byDate = new Map<string, UpcomingReport[]>();
  for (const r of [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.ticker.localeCompare(b.ticker))) {
    byDate.set(r.reportDate, [...(byDate.get(r.reportDate) ?? []), r]);
  }
  const all = [...byDate.entries()].map(([date, rs]) => ({ date, reports: rs }));
  const shown = all.slice(0, days);
  const rest = all.slice(days).flatMap((d) => d.reports);
  return { shown, moreCount: rest.length, lastDate: rest.length ? rest[rest.length - 1].reportDate : null };
}

/** The first report per ticker on or after today. */
export function nextReportByTicker(reports: UpcomingReport[]): Map<string, UpcomingReport> {
  const out = new Map<string, UpcomingReport>();
  for (const r of reports) {
    const cur = out.get(r.ticker);
    if (!cur || r.reportDate < cur.reportDate) out.set(r.ticker, r);
  }
  return out;
}

const day = (iso: string) => DateTime.fromISO(iso, { zone: NY }).startOf("day");

/** "today", "tomorrow" or "in 20 days". */
export function inDays(today: string, date: string) {
  const n = Math.round(day(date).diff(day(today), "days").days);
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

/** What to call the session a result covers: "Today", "Yesterday" or "Last session". */
export function sessionHeading(today: string, sessionDate: string) {
  if (sessionDate === today) return "Today";
  return sessionDate === day(today).minus({ days: 1 }).toISODate() ? "Yesterday" : "Last session";
}

/** The next Sunday on or after today (the weekly update run). */
export function nextSunday(today: string) {
  const d = day(today);
  return d.plus({ days: (7 - d.weekday) % 7 }).toISODate()!;
}

export function greeting(now: Date = new Date()) {
  const hour = DateTime.fromJSDate(now).setZone(NY).hour;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** "Friday, September 25". */
export const longDate = (iso: string) => day(iso).toFormat("cccc, LLLL d");
/** "Thu, Oct 15". */
export const shortDate = (iso: string) => day(iso).toFormat("ccc, LLL d");
/** "Oct 15". */
export const monthDay = (iso: string) => day(iso).toFormat("LLL d");
