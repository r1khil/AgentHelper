import { DateTime } from "luxon";
import { NY } from "@/lib/providers/calendar";
import type { CalendarRange } from "./types";

export function calendarWeek(
  date = DateTime.now().setZone(NY).toISODate()!,
): CalendarRange {
  const day = DateTime.fromISO(date, { zone: NY });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day.isValid)
    throw new Error("Choose a valid date.");
  const monday = day.startOf("week");
  return {
    from: monday.toISODate()!,
    to: monday.plus({ days: 6 }).toISODate()!,
  };
}
export function validateRange(
  from: string | null,
  to: string | null,
): CalendarRange {
  if (!from && !to) return calendarWeek();
  if (!from || !to) throw new Error("Both from and to dates are required.");
  calendarWeek(from);
  calendarWeek(to);
  const days = DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days;
  if (days < 0 || days > 30) throw new Error("Choose a range of 1–31 days.");
  return { from, to };
}
export function rangeDays(range: CalendarRange) {
  const days: string[] = [];
  for (
    let d = DateTime.fromISO(range.from);
    d.toISODate()! <= range.to;
    d = d.plus({ days: 1 })
  )
    days.push(d.toISODate()!);
  return days;
}
