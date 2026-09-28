import { DateTime } from "luxon";
import type { Bellwether, Earnings, Holding } from "@/db/schema";
import type { GicsSector } from "@/lib/attribution/sectors";
import { NY, isTradingDay } from "@/lib/providers/calendar";
import { fmtMonth } from "@/lib/format";

/** Which events a team's calendar covers: the whole Fund, the team's sectors, or one industry. */
export const CALENDAR_VIEWS = ["fund", "sector", "industry"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export const VIEW_LABELS: Record<CalendarView, string> = { fund: "Fund", sector: "Sector", industry: "Industry" };

/** How the selected week or month is laid out (the `?view=` param). */
export const CALENDAR_LAYOUTS = ["week", "month", "list"] as const;
export type CalendarLayout = (typeof CALENDAR_LAYOUTS)[number];
export const LAYOUT_LABELS: Record<CalendarLayout, string> = { week: "Week", month: "Month", list: "List" };

/** The Show filters: which kinds of event are listed. */
export const CALENDAR_KINDS = ["holdings", "bellwethers", "economic"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export type ExpectationsState = "locked" | "draft" | "not_started";

export type HoldingEventRow = { e: Earnings; h: Holding; teamSlug: string; teamName: string; sector: GicsSector | null; industry: string | null };

export type CalendarEvent = {
  date: string;
  ticker: string;
  name: string;
  kind: "holding" | "bellwether";
  sector: GicsSector | null;
  industry: string | null;
  reportHour: string | null;
  dateStatus: "confirmed" | "estimated" | null;
  epsEstimate: string | null;
  /** ISO code of `epsEstimate`; null when unknown, which shows no symbol. */
  epsCurrency: string | null;
  // Holdings
  earningsId?: string;
  teamId?: string;
  teamSlug?: string;
  teamName?: string;
  status?: Earnings["status"];
  expectations?: ExpectationsState;
  // Bellwethers
  etf?: string;
  weightPct?: string | null;
};

export type CalendarQuery = {
  /** Fund / Sector / Industry (the `?scope=` param; old links carried it in `?view=`). */
  scope: CalendarView;
  /** Week / Month / List (the `?view=` param). */
  layout: CalendarLayout;
  month: string;
  day?: string;
  industry?: string;
  show: CalendarKind[];
};

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const sameKinds = (a: readonly CalendarKind[], b: readonly CalendarKind[]) => a.length === b.length && a.every((k) => b.includes(k));

/**
 * Read the calendar state from the URL; anything invalid falls back quietly. `?view=` is the layout, but a
 * scope in it (fund, sector, industry) still works, so links from before the Calendar merge keep their meaning.
 */
export function parseCalendarQuery(q: SearchParams, today: string, defaultShow: readonly CalendarKind[] = CALENDAR_KINDS): CalendarQuery {
  const rawView = one(q.view);
  const rawScope = one(q.scope);
  const scope = CALENDAR_VIEWS.find((v) => v === rawScope) ?? CALENDAR_VIEWS.find((v) => v === rawView) ?? "sector";
  const layout = CALENDAR_LAYOUTS.find((v) => v === rawView) ?? "week";
  const rawDay = one(q.day);
  const day = rawDay && DAY_RE.test(rawDay) && DateTime.fromISO(rawDay, { zone: NY }).isValid ? rawDay : undefined;
  const rawMonth = one(q.month);
  const month = rawMonth && MONTH_RE.test(rawMonth) ? rawMonth : (day ?? today).slice(0, 7);
  const rawIndustry = one(q.industry)?.trim().slice(0, 80);
  const rawShow = one(q.show);
  const show =
    rawShow === undefined
      ? [...defaultShow]
      : rawShow === "none"
        ? []
        : CALENDAR_KINDS.filter((k) => rawShow.split(",").includes(k));
  return { scope, layout, month, day, industry: rawIndustry || undefined, show };
}

/** The URL for a calendar state. `defaultShow` is the route's default, so the Show filters are written only when they differ. */
export function calendarHref(base: string, q: CalendarQuery, defaultShow: readonly CalendarKind[] = CALENDAR_KINDS): string {
  const p = new URLSearchParams({ scope: q.scope });
  if (q.layout !== "week") p.set("view", q.layout);
  p.set("month", q.month);
  if (q.day) p.set("day", q.day);
  if (q.industry) p.set("industry", q.industry);
  if (!sameKinds(q.show, defaultShow)) p.set("show", q.show.length ? CALENDAR_KINDS.filter((k) => q.show.includes(k)).join(",") : "none");
  return `${base}?${p}`;
}

/** Toggle one kind in the Show filters. */
export function toggleKind(show: readonly CalendarKind[], kind: CalendarKind): CalendarKind[] {
  return show.includes(kind) ? show.filter((k) => k !== kind) : CALENDAR_KINDS.filter((k) => k === kind || show.includes(k));
}

/** Where the expectations for one report stand: locked (automatically on the report date, or by hand), a draft, or nothing yet. */
export function expectationsState(e: Pick<Earnings, "preLockedAt" | "expectations">): ExpectationsState {
  if (e.preLockedAt) return "locked";
  return e.expectations?.trim() ? "draft" : "not_started";
}

/** Monday of the week holding `date`. */
export function weekStart(date: string): string {
  return DateTime.fromISO(date, { zone: NY }).startOf("week").toISODate()!;
}

/** The seven days (Monday to Sunday) of the week holding `date`. */
export function weekDays(date: string): string[] {
  const monday = DateTime.fromISO(weekStart(date), { zone: NY });
  return Array.from({ length: 7 }, (_, i) => monday.plus({ days: i }).toISODate()!);
}

export type MiniMonth = { month: string; label: string; first: string; last: string; weeks: (string | null)[][] };

/** Monday-to-Sunday rows for the month picker; days outside the month are null. */
export function buildMiniMonth(month: string): MiniMonth {
  const first = DateTime.fromISO(`${month}-01`, { zone: NY });
  if (!first.isValid) throw new Error(`Bad month ${month}`);
  const last = first.endOf("month").startOf("day");
  const weeks: (string | null)[][] = [];
  for (let w = first.startOf("week"); w <= last; w = w.plus({ weeks: 1 })) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const d = w.plus({ days: i });
      return d.month === first.month ? d.toISODate()! : null;
    }));
  }
  return { month, label: fmtMonth(first.toISODate()), first: first.toISODate()!, last: last.toISODate()!, weeks };
}

const nthWeekday = (year: number, month: number, weekday: number, n: number) => {
  let d = DateTime.fromObject({ year, month, day: 1 }, { zone: NY });
  while (d.weekday !== weekday) d = d.plus({ days: 1 });
  return d.plus({ weeks: n - 1 }).toISODate()!;
};
const lastWeekday = (year: number, month: number, weekday: number) => {
  let d = DateTime.fromObject({ year, month }, { zone: NY }).endOf("month").startOf("day");
  while (d.weekday !== weekday) d = d.minus({ days: 1 });
  return d.toISODate()!;
};
/** A fixed-date holiday moved to Friday or Monday when it falls on a weekend. */
const observed = (year: number, month: number, day: number) => {
  const d = DateTime.fromObject({ year, month, day }, { zone: NY });
  return (d.weekday === 6 ? d.minus({ days: 1 }) : d.weekday === 7 ? d.plus({ days: 1 }) : d).toISODate()!;
};

/**
 * A line for a weekday the markets treat differently: an NYSE holiday ("Thanksgiving · markets closed"), or a
 * day only the bond market closes ("Columbus Day · bond market closed"). Null on an ordinary day or a weekend.
 */
export function marketDayNote(date: string): string | null {
  const d = DateTime.fromISO(date, { zone: NY });
  if (!d.isValid || d.weekday >= 6) return null;
  const y = d.year;
  const bondOnly: Record<string, string> = { [nthWeekday(y, 10, 1, 2)]: "Columbus Day", [observed(y, 11, 11)]: "Veterans Day" };
  if (bondOnly[date] && isTradingDay(date)) return `${bondOnly[date]} · bond market closed`;
  if (isTradingDay(date)) return null;
  const named: Record<string, string> = {
    [observed(y, 1, 1)]: "New Year's Day",
    [nthWeekday(y, 1, 1, 3)]: "Martin Luther King Jr. Day",
    [nthWeekday(y, 2, 1, 3)]: "Presidents' Day",
    [lastWeekday(y, 5, 1)]: "Memorial Day",
    [observed(y, 6, 19)]: "Juneteenth",
    [observed(y, 7, 4)]: "Independence Day",
    [nthWeekday(y, 9, 1, 1)]: "Labor Day",
    [nthWeekday(y, 11, 4, 4)]: "Thanksgiving",
    [observed(y, 12, 25)]: "Christmas",
    [observed(y + 1, 1, 1)]: "New Year's Day",
  };
  // Good Friday and one-off closures aren't worth a rule: the exchange calendar says the day is closed.
  const name = named[date] ?? (d.weekday === 5 && (d.month === 3 || d.month === 4) ? "Good Friday" : null);
  return name ? `${name} · markets closed` : "Markets closed";
}

export type GridDay = { date: string; inMonth: boolean; trading: boolean };
export type MonthGrid = { month: string; label: string; start: string; end: string; prevMonth: string; nextMonth: string; weeks: GridDay[][] };

/** Monday-to-Friday rows from the week holding the month's first weekday to the week holding its last. */
export function buildMonthGrid(month: string): MonthGrid {
  const first = DateTime.fromISO(`${month}-01`, { zone: NY });
  if (!first.isValid) throw new Error(`Bad month ${month}`);
  const last = first.endOf("month").startOf("day");
  let firstWeekday = first;
  while (firstWeekday.weekday >= 6) firstWeekday = firstWeekday.plus({ days: 1 });
  let lastWeekday = last;
  while (lastWeekday.weekday >= 6) lastWeekday = lastWeekday.minus({ days: 1 });
  const start = firstWeekday.startOf("week");
  const end = lastWeekday.startOf("week").plus({ days: 4 });
  const weeks: GridDay[][] = [];
  for (let w = start; w <= end; w = w.plus({ weeks: 1 })) {
    const row: GridDay[] = [];
    for (let i = 0; i < 5; i++) {
      const d = w.plus({ days: i });
      const date = d.toISODate()!;
      row.push({ date, inMonth: d.month === first.month, trading: isTradingDay(date) });
    }
    weeks.push(row);
  }
  return {
    month,
    label: fmtMonth(first.toISODate()),
    start: start.toISODate()!,
    end: end.toISODate()!,
    prevMonth: first.minus({ months: 1 }).toFormat("yyyy-LL"),
    nextMonth: first.plus({ months: 1 }).toFormat("yyyy-LL"),
    weeks,
  };
}

/** Merge holdings and bellwethers into one event list. A holding missing a classification borrows the bellwether's. */
export function toCalendarEvents(rows: HoldingEventRow[], bellwethers: Bellwether[]): CalendarEvent[] {
  const byTicker = new Map(bellwethers.map((b) => [b.ticker, b]));
  const out: CalendarEvent[] = [];
  for (const r of rows) {
    const b = byTicker.get(r.h.ticker);
    out.push({
      date: r.e.reportDate,
      ticker: r.h.ticker,
      name: r.h.companyName ?? b?.name ?? r.h.ticker,
      kind: "holding",
      sector: r.sector ?? b?.sector ?? null,
      industry: r.industry ?? b?.industry ?? null,
      reportHour: r.e.reportHour,
      dateStatus: r.e.dateStatus,
      epsEstimate: r.e.epsEstimate,
      epsCurrency: r.e.epsCurrency,
      earningsId: r.e.id,
      teamId: r.h.teamId,
      teamSlug: r.teamSlug,
      teamName: r.teamName,
      status: r.e.status,
      expectations: expectationsState(r.e),
    });
  }
  for (const b of bellwethers) {
    if (!b.reportDate) continue;
    out.push({
      date: b.reportDate,
      ticker: b.ticker,
      name: b.name,
      kind: "bellwether",
      sector: b.sector,
      industry: b.industry,
      reportHour: b.reportHour,
      dateStatus: b.dateStatus,
      epsEstimate: b.epsEstimate,
      // Bellwethers are top constituents of the sector SPDRs, so S&P 500 companies reporting in dollars.
      epsCurrency: "USD",
      etf: b.etf,
      weightPct: b.weightPct,
    });
  }
  return out;
}

export type ScopeOptions = { view: CalendarView; teamId: string; teamSectors: GicsSector[]; industry?: string };

/**
 * Fund: everything. Sector: the team's own holdings plus anything classified into the team's
 * sectors. Industry: the sector set narrowed to one industry. A bellwether the Fund also holds
 * is dropped so each name appears once, as the holding.
 */
export function filterCalendarEvents(events: CalendarEvent[], opts: ScopeOptions): CalendarEvent[] {
  const sectors = new Set<GicsSector>(opts.teamSectors);
  const inScope = (ev: CalendarEvent) => {
    if (opts.view === "fund") return true;
    if (ev.kind === "holding" && ev.teamId === opts.teamId) return true;
    return ev.sector !== null && sectors.has(ev.sector);
  };
  let kept = events.filter(inScope);
  const held = new Set(kept.filter((e) => e.kind === "holding").map((e) => e.ticker));
  kept = kept.filter((ev) => ev.kind === "holding" || !held.has(ev.ticker));
  if (opts.view === "industry") kept = opts.industry ? kept.filter((ev) => ev.industry === opts.industry) : [];
  return kept.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "holding" ? -1 : 1;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });
}

export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const out = new Map<string, CalendarEvent[]>();
  for (const ev of events) out.set(ev.date, [...(out.get(ev.date) ?? []), ev]);
  return out;
}

/** Today when it is on the grid; otherwise the first day with events at or after today, then any day with events, then the 1st. */
export function defaultSelectedDay(grid: MonthGrid, byDate: Map<string, CalendarEvent[]>, today: string): string {
  const days = grid.weeks.flat();
  if (days.some((d) => d.date === today)) return today;
  // On a weekend the week worth seeing is the one starting Monday, whether or not anything is loaded for it yet.
  const t = DateTime.fromISO(today, { zone: NY });
  if (t.weekday >= 6) {
    const monday = t.plus({ days: 8 - t.weekday }).toISODate()!;
    if (days.some((d) => d.date === monday)) return monday;
  }
  const upcoming = days.find((d) => d.date >= today && byDate.has(d.date));
  if (upcoming) return upcoming.date;
  const any = days.find((d) => d.inMonth && byDate.has(d.date));
  if (any) return any.date;
  return days.find((d) => d.inMonth)!.date;
}

export function inGrid(grid: MonthGrid, date: string) {
  return date >= grid.start && date <= grid.end;
}

/** Industries offered in the Industry view: the team's holdings plus bellwethers in its sectors. */
export function industryOptions(holdingIndustries: string[], bellwethers: Pick<Bellwether, "sector" | "industry">[], teamSectors: GicsSector[]): string[] {
  const sectors = new Set<GicsSector>(teamSectors);
  const out = new Set(holdingIndustries);
  for (const b of bellwethers) if (b.industry && sectors.has(b.sector)) out.add(b.industry);
  return [...out].sort((a, b) => a.localeCompare(b));
}
