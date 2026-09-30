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

// NYSE early closes (13:00 ET). Extend each year.
const EARLY_CLOSES = new Set(["2025-07-03", "2025-11-28", "2025-12-24", "2026-11-27", "2026-12-24", "2027-11-26"]);

export const OPEN_MINUTE = 9 * 60 + 30;

/** Minutes after midnight ET the session closes: 16:00, or 13:00 on an early-close day. */
export function closeMinute(isoDate: string) {
  return EARLY_CLOSES.has(isoDate) ? 13 * 60 : 16 * 60;
}

export type MarketPhase = "pre" | "open" | "closed";

/**
 * Where the market is at `now`: before the bell on a trading day, in the session, or closed (after the bell, a weekend
 * or a holiday). `session` is the latest session that has opened: today once the bell has rung, else the one before.
 */
export function marketPhase(now: Date = new Date()): { phase: MarketPhase; today: string; session: string; closesAt: string | null; opensAt: string } {
  const t = DateTime.fromJSDate(now).setZone(NY);
  const today = t.toISODate()!;
  const minutes = t.hour * 60 + t.minute;
  const trading = isTradingDay(today);
  const at = (iso: string, minute: number) => DateTime.fromISO(iso, { zone: NY }).set({ hour: Math.floor(minute / 60), minute: minute % 60 }).toUTC().toISO()!;
  const nextOpen = trading && minutes < OPEN_MINUTE ? today : nextTradingDay(today);
  const opensAt = at(nextOpen, OPEN_MINUTE);
  if (trading && minutes >= OPEN_MINUTE && minutes < closeMinute(today)) return { phase: "open", today, session: today, closesAt: at(today, closeMinute(today)), opensAt };
  if (trading && minutes < OPEN_MINUTE) return { phase: "pre", today, session: previousTradingDay(today), closesAt: null, opensAt };
  return { phase: "closed", today, session: trading ? today : previousTradingDay(today), closesAt: null, opensAt };
}

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
