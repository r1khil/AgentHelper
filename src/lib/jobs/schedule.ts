import { DateTime } from "luxon";
import { NY } from "@/lib/providers/calendar";

/** How long after its New York slot a scheduled call still counts as on time. */
export const SLOT_TOLERANCE_MIN = 10;

/**
 * The evening jobs run at fixed New York times, but Supabase pg_cron only speaks UTC. Each job is
 * therefore scheduled at both of its possible UTC times (EDT and EST) with `?at=HH:MM`, and this
 * check lets through only the call that lands at the New York slot. Returns the reason to skip, or
 * null when the call is on time (or carries no slot, e.g. a manual run).
 */
export function slotSkipReason(at: string | null, now: Date = new Date()): string | null {
  if (!at) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(at);
  if (!m) return `bad slot "${at}"`;
  const ny = DateTime.fromJSDate(now).setZone(NY);
  const slot = ny.set({ hour: Number(m[1]), minute: Number(m[2]), second: 0, millisecond: 0 });
  const late = ny.diff(slot, "minutes").minutes;
  if (late >= 0 && late < SLOT_TOLERANCE_MIN) return null;
  return `not the ${at} New York slot (it is ${ny.toFormat("HH:mm")} in New York)`;
}

/** Response for a call that fired at the other daylight-saving time's UTC hour. */
export function slotSkipResponse(req: Request): Response | null {
  const reason = slotSkipReason(new URL(req.url).searchParams.get("at"));
  return reason ? Response.json({ status: "skipped", reason }) : null;
}
