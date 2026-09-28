import type { PillTone } from "@/components/app/panel";
import type { MovementStatus } from "./types";

const NY = "America/New_York";

function sessionDay(d: string) {
  // Session dates are calendar dates; noon UTC keeps them on the same day in every US zone.
  return new Date(`${d}T12:00:00Z`);
}

/** "Tue Sep 22" (with the year when it isn't this year). */
export function sessionShort(d: string, now = new Date()) {
  const dt = sessionDay(d);
  const base = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
  return dt.getUTCFullYear() === now.getUTCFullYear() ? base : `${base}, ${dt.getUTCFullYear()}`;
}

/** "Tuesday, September 22" (with the year when it isn't this year). */
export function sessionLong(d: string, now = new Date()) {
  const dt = sessionDay(d);
  const sameYear = dt.getUTCFullYear() === now.getUTCFullYear();
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: sameYear ? undefined : "numeric", timeZone: "UTC" });
}

/** "Wed Sep 23, 12:00 ET" */
export function dueLabel(d: Date | null) {
  if (!d) return "—";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: NY })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.month} ${parts.day}, ${parts.hour}:${parts.minute} ET`;
}

/** "5 days overdue", "3 hours overdue". */
export function overdueLabel(dueAt: Date | null, now = Date.now()) {
  if (!dueAt) return "Overdue";
  const ms = now - dueAt.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} overdue`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hours} hour${hours === 1 ? "" : "s"} overdue`;
}

export function isOverdue(status: MovementStatus, dueAt: Date | null, now = Date.now()) {
  return status !== "completed" && !!dueAt && dueAt.getTime() < now;
}

/** The list's status pill. Pink only for overdue (the reader owes it); caution for a draft in progress. */
export function movementPill(status: MovementStatus, overdue: boolean): { tone: PillTone; label: string } {
  if (overdue) return { tone: "hoot", label: "Overdue" };
  if (status === "completed") return { tone: "good", label: "Completed" };
  if (status === "in_progress") return { tone: "caution", label: "In progress" };
  return { tone: "neutral", label: "Open" };
}

/** "6:04 pm Tue" */
export function gatheredAt(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: NY }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${parts.hour}:${parts.minute} ${String(parts.dayPeriod ?? "").toLowerCase()} ${parts.weekday}`;
}

export function wordCount(text: string | null) {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

export const KIND_LABEL: Record<string, string> = { news: "News", filing: "SEC filing", peer_move: "Peer move, same session", financial: "Calendar", price: "Prices", release: "Company release" };

/** "Sep 21, 6:04 pm" in New York time. */
export function sessionShortDateTime(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: NY }).replace(/ (AM|PM)$/, (m) => m.toLowerCase());
}
