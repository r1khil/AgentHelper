import { DateTime } from "luxon";
import { isTradingDay, nextTradingDay, NY } from "@/lib/providers/calendar";

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

/* --------------------------------------------------------------------------------- Today, Direction B v2 */

/** "Morning", "Afternoon" or "Evening", by New York time. */
export function greetingWord(now: Date = new Date()) {
  return greeting(now).replace(/^Good /, "").replace(/^./, (c) => c.toUpperCase());
}

/** "Friday". */
export const weekdayName = (iso: string) => day(iso).toFormat("cccc");
/** "FRI 25 SEP", the mono session stamp. */
export const sessionStamp = (iso: string) => day(iso).toFormat("ccc d LLL").toUpperCase();
/** "Tue 13 Oct", the mono agenda date. */
export const agendaDate = (iso: string) => day(iso).toFormat("ccc d LLL");

/** "today", "tomorrow" or "15 days". */
export function daysAway(today: string, date: string) {
  const n = Math.round(day(date).diff(day(today), "days").days);
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `${n} days`;
}

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;

function span(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}H ${m}M` : `${m}M`;
}

/**
 * The mono line over the greeting: "MON 28 SEP · MARKET OPENS IN 1H 12M" before the bell, "… · MARKET CLOSES IN
 * 2H 5M" during the session, "… · MARKET CLOSED · OPENS TUE 9:30" after it and on weekends and holidays.
 */
export function marketLine(now: Date = new Date()) {
  const t = DateTime.fromJSDate(now).setZone(NY);
  const date = t.toFormat("ccc d LLL").toUpperCase();
  const iso = t.toISODate()!;
  const minutes = t.hour * 60 + t.minute;
  if (isTradingDay(iso) && minutes < OPEN_MIN) return `${date} · MARKET OPENS IN ${span(OPEN_MIN - minutes)}`;
  if (isTradingDay(iso) && minutes < CLOSE_MIN) return `${date} · MARKET CLOSES IN ${span(CLOSE_MIN - minutes)}`;
  const next = nextTradingDay(iso);
  const when = day(next).diff(day(iso), "days").days === 1 ? "TOMORROW" : day(next).toFormat("ccc").toUpperCase();
  return `${date} · MARKET CLOSED · OPENS ${when} 9:30`;
}

const MINUS = "−";

/** "+0.84%", "−2 bp": signed, with a true minus, for mono figures. */
export function signed(n: number | null | undefined, digits = 2, unit = "") {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const body = Math.abs(n).toFixed(digits);
  if (Number(body) === 0) return `${(0).toFixed(digits)}${unit}`;
  return `${n < 0 ? MINUS : "+"}${body}${unit}`;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => WORDS[n] ?? String(n);

/** Nudges on Today's list: Hoot's feed without the page tips, most urgent first. */
export function listNudges<T extends { kind: string; priority: number }>(nudges: T[]): T[] {
  return nudges.filter((n) => n.kind !== "tip").sort((a, b) => a.priority - b.priority);
}

export const isOverdue = (n: { id: string }) => n.id.endsWith(":overdue");

/**
 * The first sentence of Hoot's line under the greeting, from the last session: "We beat the S&P 500 by 25 bps on
 * Friday." `vs` names the benchmark; a lead reads their team against its sectors.
 */
export function sessionSentence(r: { subject: string; vs: string; diffBps: number | null; ret: number | null; weekday: string }) {
  const we = r.subject === "We";
  if (r.diffBps === null) {
    if (r.ret === null) return null;
    return `${we ? "The Fund" : r.subject} ${r.ret >= 0 ? "made" : "lost"} ${Math.abs(r.ret).toFixed(2)}% on ${r.weekday}.`;
  }
  const bps = Math.abs(r.diffBps);
  if (bps === 0) return `${r.subject} matched ${r.vs} on ${r.weekday}.`;
  return `${r.subject} ${r.diffBps > 0 ? "beat" : "trailed"} ${r.vs} by ${bps} ${bps === 1 ? "bp" : "bps"} on ${r.weekday}.`;
}

/** The second sentence: "I found four things for you, one of them overdue." */
export function listSentence(count: number, overdue: number) {
  if (count === 0) return "Nothing on my list for you right now.";
  const things = `I found ${word(count)} ${count === 1 ? "thing" : "things"} for you`;
  if (!overdue) return `${things}.`;
  if (count === 1) return `${things}, and it's overdue.`;
  return `${things}, ${overdue === count ? (count === 2 ? "both" : "all of them") : `${word(overdue)} of them`} overdue.`;
}

type NudgeLike = { id: string; kind: string; title: string; detail?: string; at?: string };

/** "Fri 12:00" in New York, from an ISO time. */
const dueStamp = (iso: string) => DateTime.fromISO(iso).setZone(NY).toFormat("ccc H:mm");
/** "Sep 24" in New York, from an ISO time or date. */
const sinceStamp = (iso: string) => (iso.length === 10 ? day(iso) : DateTime.fromISO(iso).setZone(NY)).toFormat("LLL d");

/** The mono "when" beside a list item. Nudges carry no timestamps, so this reads what their id and copy say. */
export function nudgeWhen(n: NudgeLike): string {
  if (n.kind === "movement") {
    if (n.at) return `Due ${dueStamp(n.at)}`;
    if (isOverdue(n)) return "Overdue";
    const h = /due in (\d+)h/i.exec(n.title)?.[1];
    return h ? `Due in ${h}h` : "Due soon";
  }
  if (n.kind === "earnings") {
    if (n.id.endsWith(":today")) return "Reports today";
    const wd = /reports (\w+day)/i.exec(n.detail ?? "")?.[1];
    if (wd) return `Reports ${wd.slice(0, 3)}`;
    return "Next few days";
  }
  if (n.kind === "sell_side") return n.at ? `Since ${sinceStamp(n.at)}` : n.id.endsWith(":error") ? "Failed" : "Brief ready";
  if (n.kind === "proposal") return "Awaiting review";
  if (n.kind === "weekly") {
    // The pack goes out at noon New York time on the Sunday after the week ends.
    if (n.at && /^\d{4}-\d{2}-\d{2}$/.test(n.at)) return `Sends ${day(n.at).plus({ days: 2 }).toFormat("ccc")} 12:00`;
    const week = n.id.split(":")[1];
    return week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? `Week to ${monthDay(week)}` : "This week";
  }
  if (n.kind === "changelog") {
    if (n.at) return `Since ${sinceStamp(n.at)}`;
    const pr = n.id.split(":")[1];
    return pr ? `PR #${pr}` : "New";
  }
  return "";
}

/** The button label for a list item. */
export function nudgeAction(n: NudgeLike): string {
  switch (n.kind) {
    case "movement":
      return "Open write-up";
    case "earnings":
      return n.id.endsWith(":expectations") ? "Write them" : "Open";
    case "sell_side":
      return n.id.endsWith(":error") ? "Retry" : "Open brief";
    case "proposal":
      return "Review";
    case "weekly":
      return "Review pack";
    case "changelog":
      return "See what's new";
    default:
      return "Open";
  }
}

/** A brief paragraph split into text and numbered citations: "added 14 bps [1]." → ["added 14 bps ", 1, "."]. */
export function citationParts(text: string): (string | number)[] {
  const out: (string | number)[] = [];
  let last = 0;
  for (const m of text.matchAll(/\s?\[(\d{1,2})\]/g)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(Number(m[1]));
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
