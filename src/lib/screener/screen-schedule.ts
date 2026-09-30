import { DateTime } from "luxon";

/*
 * When the monthly screen runs, and how its picks are paper-tracked afterwards. Pure date arithmetic, New York time.
 */

/** True on the first Saturday of the month (a "YYYY-MM-DD" calendar date). */
export function isFirstSaturday(isoDate: string): boolean {
  const d = DateTime.fromISO(isoDate);
  return d.isValid && d.weekday === 6 && d.day <= 7;
}

/** The first day of the date's month, for "a run already exists this month". */
export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** The calendar date `months` after `isoDate` (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(isoDate: string, months: number): string {
  return DateTime.fromISO(isoDate).plus({ months }).toISODate()!;
}

export const HORIZONS = [3, 6, 12] as const;

/**
 * Price return (a fraction: 0.1 is 10%) from the first close on or after `from` to the first close on or after
 * `from` + `months`. Null until that later date has come (it is after `today`, or there is no close on or after it yet).
 */
export function forwardReturn(bars: { date: string; close: number }[], from: string, months: number, today: string): number | null {
  const target = addMonths(from, months);
  if (target > today) return null;
  const base = bars.find((b) => b.date >= from);
  const end = bars.find((b) => b.date >= target);
  if (!base || !end || base.close <= 0) return null;
  return +(end.close / base.close - 1).toFixed(4);
}

export type ForwardReturns = { r3m: number | null; r6m: number | null; r12m: number | null; spx3m: number | null; spx6m: number | null; spx12m: number | null; excess3m: number | null; excess6m: number | null; excess12m: number | null };

/** A name's returns at each horizon against the S&P 500's over the same days, as fractions (excess is the difference). */
export function forwardReturns(bars: { date: string; close: number }[], spx: { date: string; close: number }[], from: string, today: string): ForwardReturns {
  const [r3m, r6m, r12m] = HORIZONS.map((m) => forwardReturn(bars, from, m, today));
  const [spx3m, spx6m, spx12m] = HORIZONS.map((m) => forwardReturn(spx, from, m, today));
  const ex = (a: number | null, b: number | null) => (a === null || b === null ? null : +(a - b).toFixed(4));
  return { r3m, r6m, r12m, spx3m, spx6m, spx12m, excess3m: ex(r3m, spx3m), excess6m: ex(r6m, spx6m), excess12m: ex(r12m, spx12m) };
}
