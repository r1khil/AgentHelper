import { DateTime } from "luxon";
import { NY } from "@/lib/providers/calendar";
import type { CalendarRange, EconomicEvent } from "./types";

// Pure helpers behind the calendar page: what has come out, what is next, and how a print compares with consensus.

const due = (e: EconomicEvent) =>
  e.timestamp === null ? null : Date.parse(e.timestamp);

/** The actual to display: never one stamped for a time that has not arrived yet. */
export function shownActual(e: EconomicEvent, now: number | null) {
  const at = due(e);
  return now !== null && at !== null && at > now ? null : e.actual;
}

export function isReleased(e: EconomicEvent, now: number | null) {
  return shownActual(e, now) !== null;
}

/** Scheduled for a known time that is still ahead. Events without a time never count down. */
export function isUpcoming(e: EconomicEvent, now: number) {
  const at = due(e);
  return at !== null && at > now;
}

/** Still to come: a known time ahead, or a day not yet over when the feed has no time. */
export function isAhead(e: EconomicEvent, now: number, today: string) {
  if (isReleased(e, now)) return false;
  return e.timestamp === null ? e.date >= today : isUpcoming(e, now);
}

/** The next release with a known time, in feed order (the service sorts by day, then time). */
export function nextRelease(events: EconomicEvent[], now: number) {
  let next: EconomicEvent | null = null;
  for (const e of events)
    if (isUpcoming(e, now) && (!next || due(e)! < due(next)!)) next = e;
  return next;
}

export function untilText(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

type Parsed = {
  value: number;
  decimals: number;
  dollar: boolean;
  suffix: string;
};
const NUMBER = /^([+-])?(\$)?([+-])?(\d[\d,]*(?:\.\d+)?)(%|[KMBT])?$/i;

function parse(raw: string): Parsed | null {
  const m = raw.replace(/−/g, "-").replace(/\s+/g, "").match(NUMBER);
  if (!m) return null;
  const digits = m[4].replace(/,/g, "");
  return {
    value: (m[1] === "-" || m[3] === "-" ? -1 : 1) * Number(digits),
    decimals: digits.split(".")[1]?.length ?? 0,
    dollar: !!m[2],
    suffix: (m[5] ?? "").toUpperCase(),
  };
}

export type Surprise =
  | { dir: "above" | "below"; text: string }
  | { dir: "inline"; text: string }
  | { dir: "none" };

/**
 * How a released actual compares with consensus. Direction only: higher is not always better, so the page never
 * calls a print good or bad. Null when either value can't be read as a number in the same unit.
 */
export function surprise(
  actual: string | null,
  estimate: string | null,
): Surprise | null {
  if (actual === null) return null;
  if (estimate === null) return { dir: "none" };
  const a = parse(actual);
  const e = parse(estimate);
  if (!a || !e || a.suffix !== e.suffix || a.dollar !== e.dollar) return null;
  const decimals = Math.max(a.decimals, e.decimals);
  const diff = Number((a.value - e.value).toFixed(decimals));
  if (diff === 0) return { dir: "inline", text: "In line" };
  const size = Math.abs(diff).toFixed(decimals);
  const unit = a.suffix === "%" ? " pp" : a.suffix;
  const dir = diff > 0 ? "above" : "below";
  return { dir, text: `${a.dollar ? "$" : ""}${size}${unit} ${dir}` };
}

/** One line for a collapsed day: its most important prints and how they compared with consensus. */
export function daySummary(events: EconomicEvent[], now: number | null) {
  const ranked = byImportance(events);
  const out = ranked.filter((e) => isReleased(e, now)).slice(0, 2);
  if (out.length)
    return out
      .map((e) => {
        const s = surprise(e.actual, e.estimate);
        const vs =
          s && s.dir !== "none"
            ? ` (${s.dir === "inline" ? "in line" : s.text})`
            : "";
        return `${e.name} ${e.actual}${vs}`;
      })
      .join(" · ");
  return [...new Set(ranked.map((e) => e.name))].slice(0, 2).join(" · ");
}

/** Most important first, keeping feed order among equals. */
function byImportance(events: EconomicEvent[]) {
  return events
    .map((e, i) => [e, i] as const)
    .sort(
      ([a, i], [b, j]) => (b.importance ?? 0) - (a.importance ?? 0) || i - j,
    )
    .map(([e]) => e);
}

const shared = <T>(values: T[]) =>
  new Set(values).size === 1 && values[0] !== null ? values[0] : null;

export type ReleaseGroup = {
  /** The slot's time, set only on the slot's first group so it prints once. */
  time: string | null;
  source: string | null;
  /** Period and unit when every event in the group shares them; otherwise they stay on each event. */
  period: string | null;
  unit: string | null;
  events: EconomicEvent[];
};

/**
 * One day's events as report groups: untimed items (all-day, TBA) first, then each time slot, and within a slot one
 * group per source, most important first. Nothing is dropped; shared period and unit just print once.
 */
export function releaseGroups(events: EconomicEvent[]): ReleaseGroup[] {
  const slots = new Map<string, EconomicEvent[]>();
  const untimed = events.filter((e) => e.timestamp === null);
  const timed = events
    .filter((e) => e.timestamp !== null)
    .sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!));
  for (const e of [...untimed, ...timed]) {
    const key = `${e.timestamp ?? ""}|${e.time}`;
    slots.set(key, [...(slots.get(key) ?? []), e]);
  }
  return [...slots.values()].flatMap((slot) => {
    const bySource = new Map<string, EconomicEvent[]>();
    for (const e of slot) {
      const key = e.source ?? "";
      bySource.set(key, [...(bySource.get(key) ?? []), e]);
    }
    const top = (list: EconomicEvent[]) =>
      Math.max(...list.map((e) => e.importance ?? 0));
    return [...bySource.values()]
      .map((list, i) => [list, i] as const)
      .sort(([a, i], [b, j]) => top(b) - top(a) || i - j)
      .map(([list], i) => ({
        time: i === 0 ? slot[0].time : null,
        source: list[0].source,
        period: shared(list.map((e) => e.period)),
        unit: shared(list.map((e) => e.unit ?? null)),
        events: byImportance(list),
      }));
  });
}

/** The tab the calendar opens on: today's weekday while it shows this week, otherwise the whole week. */
export function openingTab(range: CalendarRange, today: string | null) {
  if (!today || today < range.from || today > range.to) return "week";
  return DateTime.fromISO(today).weekday <= 5 ? today : "week";
}

/** "Sep 21 – 27, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2026 – Jan 3, 2027". */
export function rangeLabel(range: CalendarRange) {
  const a = DateTime.fromISO(range.from);
  const b = DateTime.fromISO(range.to);
  if (a.year !== b.year)
    return `${a.toFormat("MMM d, yyyy")} – ${b.toFormat("MMM d, yyyy")}`;
  if (a.month !== b.month)
    return `${a.toFormat("MMM d")} – ${b.toFormat("MMM d, yyyy")}`;
  return `${a.toFormat("MMM d")} – ${b.toFormat("d, yyyy")}`;
}

export function todayIn(now: number) {
  return DateTime.fromMillis(now, { zone: NY }).toISODate()!;
}
