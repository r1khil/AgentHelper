import { DateTime } from "luxon";
import { createHash } from "node:crypto";
import { NY } from "@/lib/providers/calendar";
import type { CalendarRange, EconomicEvent } from "./types";

export const text = (value: unknown): string | null => {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  return String(value).trim();
};
export function makeEvent(
  input: Pick<EconomicEvent, "name" | "source" | "date"> &
    Partial<EconomicEvent>,
): EconomicEvent {
  const day = DateTime.fromISO(input.date, { zone: NY });
  if (!day.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    throw new Error("Invalid source date");
  const instant = input.timestamp
    ? DateTime.fromISO(input.timestamp, { zone: "utc" }).setZone(NY)
    : null;
  if (instant && (!instant.isValid || instant.toISODate() !== input.date))
    throw new Error("Inconsistent source timestamp");
  const id =
    input.id ??
    createHash("sha256")
      .update(
        [
          input.source,
          input.date,
          input.timestamp,
          input.name,
          input.period,
          input.unit,
        ].join("|"),
      )
      .digest("hex")
      .slice(0, 24);
  return {
    timestamp: null,
    time: "TBA",
    tentative: !instant,
    category: null,
    period: null,
    actual: null,
    estimate: null,
    previous: null,
    previousBeforeRevision: null,
    importance: null,
    updatedAt: null,
    ...input,
    id,
    ...(instant
      ? {
          timestamp: instant.toUTC().toISO()!,
          time: instant.toFormat("h:mm a"),
        }
      : {}),
  };
}
export function inRange(
  events: EconomicEvent[],
  range: CalendarRange,
  now = Date.now(),
) {
  const today = DateTime.fromMillis(now, { zone: NY }).toISODate()!;
  const byId = new Map<string, EconomicEvent>();
  for (const event of events) {
    if (event.date < range.from || event.date > range.to) continue;
    const upcoming = event.timestamp
      ? Date.parse(event.timestamp) > now
      : event.date > today;
    const old = byId.get(event.id);
    if (!old || (event.updatedAt ?? "") >= (old.updatedAt ?? ""))
      byId.set(event.id, { ...event, actual: upcoming ? null : event.actual });
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.timestamp ?? `${a.date}T99`).localeCompare(
        b.timestamp ?? `${b.date}T99`,
      ) ||
      a.name.localeCompare(b.name),
  );
}
