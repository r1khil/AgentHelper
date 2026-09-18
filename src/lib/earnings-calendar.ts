import { DateTime } from "luxon";
import type { Bellwether, Earnings, Holding } from "@/db/schema";
import type { GicsSector } from "@/lib/attribution/sectors";
import { NY, isTradingDay } from "@/lib/providers/calendar";

export const CALENDAR_VIEWS = ["fund", "sector", "industry"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export const VIEW_LABELS: Record<CalendarView, string> = { fund: "Fund", sector: "Sector", industry: "Industry" };

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
  // Holdings
  earningsId?: string;
  teamId?: string;
  teamSlug?: string;
  teamName?: string;
  // Bellwethers
  etf?: string;
  weightPct?: string | null;
};

export type CalendarQuery = { view: CalendarView; month: string; day?: string; industry?: string };

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Read the calendar state from the URL; anything invalid falls back quietly. */
export function parseCalendarQuery(q: SearchParams, today: string): CalendarQuery {
  const rawView = one(q.view);
  const view = CALENDAR_VIEWS.find((v) => v === rawView) ?? "sector";
  const rawMonth = one(q.month);
  const month = rawMonth && MONTH_RE.test(rawMonth) ? rawMonth : today.slice(0, 7);
  const rawDay = one(q.day);
  const day = rawDay && DAY_RE.test(rawDay) && DateTime.fromISO(rawDay, { zone: NY }).isValid ? rawDay : undefined;
  const rawIndustry = one(q.industry)?.trim().slice(0, 80);
  return { view, month, day, industry: rawIndustry || undefined };
}

export function calendarHref(base: string, q: CalendarQuery): string {
  const p = new URLSearchParams({ view: q.view, month: q.month });
  if (q.day) p.set("day", q.day);
  if (q.industry) p.set("industry", q.industry);
  return `${base}?${p}`;
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
    label: first.toFormat("LLLL yyyy"),
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
      earningsId: r.e.id,
      teamId: r.h.teamId,
      teamSlug: r.teamSlug,
      teamName: r.teamName,
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
