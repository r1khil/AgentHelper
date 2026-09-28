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

export type ScoreCell = { label: string; value: number | null; unit: "%" | " bp"; tone: boolean };
export type ScoreHero = { label: string; value: number; unit: "%" | " bp" };

/**
 * The Last session card's big figure and the three under it. It leads with the result against the benchmark, the
 * call Hoot's sentence makes, so a day the book made money but trailed reads red rather than green; the return
 * moves into the row. Without a benchmark the return leads, as it did before.
 */
export function scoreboard(s: { name: string; vs: string; ret: number; diffBps: number | null; benchmark: ScoreCell; third: ScoreCell }): { hero: ScoreHero; cells: ScoreCell[] } {
  if (s.diffBps === null) {
    return { hero: { label: s.name, value: s.ret, unit: "%" }, cells: [s.benchmark, { label: "Difference", value: null, unit: " bp", tone: true }, s.third] };
  }
  return { hero: { label: `${s.name} vs ${s.vs}`, value: s.diffBps, unit: " bp" }, cells: [{ label: s.name, value: s.ret, unit: "%", tone: true }, s.benchmark, s.third] };
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

/** "Fri 12:00 ET" in New York, from an ISO time. */
const dueStamp = (iso: string) => DateTime.fromISO(iso).setZone(NY).toFormat("ccc H:mm 'ET'");

/** "2 days overdue", "3 hours overdue". */
function overdueFor(iso: string, now: Date) {
  const hours = Math.max(1, Math.floor(DateTime.fromJSDate(now).diff(DateTime.fromISO(iso), "hours").hours));
  const days = Math.floor(hours / 24);
  return days >= 1 ? `${days} ${days === 1 ? "day" : "days"} overdue` : `${hours} ${hours === 1 ? "hour" : "hours"} overdue`;
}

/** "12:00 ET today", "12:00 ET Monday": when a write-up is due, as said in a sentence. */
function dueSpoken(iso: string, now: Date) {
  const due = DateTime.fromISO(iso).setZone(NY);
  const days = Math.round(due.startOf("day").diff(DateTime.fromJSDate(now).setZone(NY).startOf("day"), "days").days);
  return `${due.toFormat("H:mm")} ET ${days <= 0 ? "today" : days === 1 ? "tomorrow" : days < 7 ? due.toFormat("cccc") : due.toFormat("LLL d")}`;
}

// A write-up belongs to the whole team, so every one on the member's own team is theirs. Another team's overdue one,
// which a lead or exec is shown, says so in its id.
const isOwnWriteUp = (n: NudgeLike) => n.kind === "movement" && !!n.at && !n.id.includes(":team:");

/**
 * What the analyst's team owes, from its write-ups on the list: "Your team owes 1 write-up, due 12:00 ET Monday.",
 * "Your team owes 1 write-up, 2 days overdue.", "Your team owes 2 write-ups; the next is due 12:00 ET today." Null
 * when it owes none.
 */
export function owedSentence(nudges: NudgeLike[], now: Date = new Date()): string | null {
  const owed = nudges.filter(isOwnWriteUp).sort((a, b) => a.at!.localeCompare(b.at!));
  if (!owed.length) return null;
  const late = owed.filter(isOverdue).length;
  if (owed.length === 1) return `Your team owes 1 write-up, ${late ? overdueFor(owed[0].at!, now) : `due ${dueSpoken(owed[0].at!, now)}`}.`;
  if (!late) return `Your team owes ${owed.length} write-ups; the next is due ${dueSpoken(owed[0].at!, now)}.`;
  return `Your team owes ${owed.length} write-ups; ${late === owed.length ? (late === 2 ? "both are" : "all are") : `${word(late)} ${late === 1 ? "is" : "are"}`} overdue.`;
}

/** An analyst's line under the greeting: what their team owes first, then the rest of the list. */
export function analystSentence(nudges: NudgeLike[], now: Date = new Date()): string {
  const owed = owedSentence(nudges, now);
  if (!owed) return listSentence(nudges.length, nudges.filter(isOverdue).length);
  const rest = nudges.filter((n) => !isOwnWriteUp(n)).length;
  return rest ? `${owed} I found ${word(rest)} more ${rest === 1 ? "thing" : "things"} for you.` : owed;
}

/** "Sep 24" in New York, from an ISO time or date. */
const sinceStamp = (iso: string) => (iso.length === 10 ? day(iso) : DateTime.fromISO(iso).setZone(NY)).toFormat("LLL d");

/** The mono "when" beside a list item, from the nudge's time or, without one, what its id and copy say. */
export function nudgeWhen(n: NudgeLike, now: Date = new Date()): string {
  if (n.kind === "movement") {
    if (n.at) return isOverdue(n) ? overdueFor(n.at, now) : `Due ${dueStamp(n.at)}`;
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
