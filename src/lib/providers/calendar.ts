import { DateTime } from "luxon";

export const NY = "America/New_York";

// NYSE full-day closures. Extend each year.
const HOLIDAYS = new Set([
  // 2025
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

export function isTradingDay(isoDate: string) {
  const d = DateTime.fromISO(isoDate, { zone: NY });
  if (!d.isValid) return false;
  if (d.weekday >= 6) return false;
  return !HOLIDAYS.has(isoDate);
}

export function todayNY() {
  return DateTime.now().setZone(NY).toISODate()!;
}

export function nextTradingDay(isoDate: string) {
  let d = DateTime.fromISO(isoDate, { zone: NY }).plus({ days: 1 });
  while (!isTradingDay(d.toISODate()!)) d = d.plus({ days: 1 });
  return d.toISODate()!;
}

export function previousTradingDay(isoDate: string) {
  let d = DateTime.fromISO(isoDate, { zone: NY }).minus({ days: 1 });
  while (!isTradingDay(d.toISODate()!)) d = d.minus({ days: 1 });
  return d.toISODate()!;
}

/** Noon Eastern on the next trading day, as a JS Date (UTC instant). */
export function movementDueAt(sessionDate: string) {
  const next = nextTradingDay(sessionDate);
  return DateTime.fromISO(next, { zone: NY }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toJSDate();
}

