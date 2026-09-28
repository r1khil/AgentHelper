import { DateTime } from "luxon";
import { NY } from "@/lib/providers/calendar";
import { fmtTime } from "@/lib/format";

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
  return `not the ${at} ET slot (it is ${fmtTime(now)})`;
}

/** Response for a call that fired at the other daylight-saving time's UTC hour. */
export function slotSkipResponse(req: Request): Response | null {
  const reason = slotSkipReason(new URL(req.url).searchParams.get("at"));
  return reason ? Response.json({ status: "skipped", reason }) : null;
}

const minutesNY = (now: Date) => {
  const ny = DateTime.fromJSDate(now).setZone(NY);
  return ny.hour * 60 + ny.minute;
};
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Retries of the 5:15 p.m. brief email act from 5:25 p.m. New York time until midnight, when the session date moves on. */
export const BRIEF_RETRY_FROM_MIN = 17 * 60 + 25;
/** A scheduled send holds the email for closes that have not loaded until 6:30 p.m.; after that it goes out with a note. */
export const BRIEF_WAIT_FOR_CLOSES_UNTIL_MIN = 18 * 60 + 30;
/** Once the 5:30 p.m. retry has failed too, the brief counts as late and the admins hear about it. */
export const BRIEF_LATE_FROM_MIN = 17 * 60 + 30;
/** The evening's last retry. */
export const BRIEF_LAST_TRY_MIN = 23 * 60 + 45;

/**
 * Supabase pg_cron calls the brief's retry every 15 minutes across both UTC offsets New York can have (and a
 * Vercel cron once as a backstop); this lets through only the calls inside the evening window. Null = act.
 */
export function briefRetrySkipReason(now: Date = new Date()): string | null {
  const m = minutesNY(now);
  return m >= BRIEF_RETRY_FROM_MIN ? null : `retries run from ${clock(BRIEF_RETRY_FROM_MIN)} New York time (it is ${clock(m)} in New York)`;
}

export const mayWaitForCloses = (now: Date = new Date()) => minutesNY(now) < BRIEF_WAIT_FOR_CLOSES_UNTIL_MIN;
export const briefIsLate = (now: Date = new Date()) => minutesNY(now) >= BRIEF_LATE_FROM_MIN;
export const isLastBriefTry = (now: Date = new Date()) => minutesNY(now) >= BRIEF_LAST_TRY_MIN;
