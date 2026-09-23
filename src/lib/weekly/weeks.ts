import { DateTime } from "luxon";
import { NY, isTradingDay, nextTradingDay, previousTradingDay } from "@/lib/providers/calendar";

/** Every pack is keyed by the Friday its week ended on. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function at(iso: string) {
  return DateTime.fromISO(iso, { zone: NY });
}

export function isValidIsoDate(iso: string): boolean {
  return ISO_DATE.test(iso) && at(iso).isValid;
}

export function isFriday(iso: string): boolean {
  return isValidIsoDate(iso) && at(iso).weekday === 5;
}

/** The Friday on or before `today`. Sunday's job asks for the Friday two days back. */
export function lastFriday(today: string): string {
  const d = at(today);
  if (!d.isValid) throw new Error(`Bad date ${today}`);
  const back = (d.weekday - 5 + 7) % 7;
  return d.minus({ days: back }).toISODate()!;
}

/** The Friday on or after `today`. */
export function upcomingFriday(today: string): string {
  const d = at(today);
  if (!d.isValid) throw new Error(`Bad date ${today}`);
  const forward = (5 - d.weekday + 7) % 7;
  return d.plus({ days: forward }).toISODate()!;
}

function tradingDayOnOrBefore(iso: string): string {
  return isTradingDay(iso) ? iso : previousTradingDay(iso);
}

function tradingDayOnOrAfter(iso: string): string {
  return isTradingDay(iso) ? iso : nextTradingDay(iso);
}

/**
 * The close-to-close window for a pack's performers: the week's first session (Monday, or the
 * next session after a Monday holiday) to its last (Friday, or the session before a Friday
 * holiday). This is how the execs' decks are computed: the 18-Sep-2026 deck's SOXX 7.2%, EVR
 * (4.7%) and CI (5.1%) reproduce from the Monday close, not the previous Friday's.
 */
export function priceWindow(weekEnding: string): { start: string; end: string } {
  if (!isFriday(weekEnding)) throw new Error(`Week ending must be a Friday, got ${weekEnding}`);
  const end = tradingDayOnOrBefore(weekEnding);
  const start = tradingDayOnOrAfter(at(weekEnding).minus({ days: 4 }).toISODate()!);
  return { start, end };
}

/** The Monday-to-Friday the new agenda covers: the week after the one that just ended. */
export function agendaWeek(weekEnding: string): { from: string; to: string } {
  if (!isFriday(weekEnding)) throw new Error(`Week ending must be a Friday, got ${weekEnding}`);
  const d = at(weekEnding);
  return { from: d.plus({ days: 3 }).toISODate()!, to: d.plus({ days: 7 }).toISODate()! };
}

/** The Monday-to-Friday the pack reports on: the week that just ended. */
export function reviewWeek(weekEnding: string): { from: string; to: string } {
  if (!isFriday(weekEnding)) throw new Error(`Week ending must be a Friday, got ${weekEnding}`);
  const d = at(weekEnding);
  return { from: d.minus({ days: 4 }).toISODate()!, to: weekEnding };
}

/** The previous pack's key, whose agenda rolls into "Last Week's Agenda". */
export function previousWeekEnding(weekEnding: string): string {
  if (!isFriday(weekEnding)) throw new Error(`Week ending must be a Friday, got ${weekEnding}`);
  return at(weekEnding).minus({ days: 7 }).toISODate()!;
}

export function weekdayLabel(iso: string): string {
  const d = at(iso);
  return d.isValid ? d.toFormat("cccc") : "";
}

export function weekEndingLabel(weekEnding: string): string {
  const d = at(weekEnding);
  return d.isValid ? d.toFormat("MMMM d, yyyy") : weekEnding;
}

export function packTitle(weekEnding: string): string {
  return `Update for the week ended ${weekEndingLabel(weekEnding)}`;
}

/** "September 21–25, 2026" for a Monday-to-Friday span. */
export function weekRangeLabel(from: string, to: string): string {
  const a = at(from);
  const b = at(to);
  if (!a.isValid || !b.isValid) return `${from} to ${to}`;
  const tail = a.month === b.month ? b.toFormat("d, yyyy") : b.toFormat("MMMM d, yyyy");
  return `${a.toFormat("MMMM d")}–${tail}`;
}
