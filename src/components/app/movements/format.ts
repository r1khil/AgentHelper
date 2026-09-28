import type { PillTone } from "@/components/app/panel";
import type { MovementStatus } from "./types";
import { fmtDateTime, fmtDay } from "@/lib/format";

/** A session (a calendar date): "Tue 22 Sep", or "22 Sep 2025" in another year. */
export function sessionShort(d: string, now = new Date()) {
  return fmtDay(d, now);
}

/** The session as the movement's heading; the same day format as everywhere else. */
export function sessionLong(d: string, now = new Date()) {
  return fmtDay(d, now);
}

/** "Wed 23 Sep, 12:00 ET" */
export function dueLabel(d: Date | null, now = new Date()) {
  return d ? fmtDateTime(d, now) : "—";
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

/** "Tue 22 Sep, 18:04 ET" */
export function gatheredAt(d: Date) {
  return fmtDateTime(d);
}

export function wordCount(text: string | null) {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

export const KIND_LABEL: Record<string, string> = { news: "News", filing: "SEC filing", peer_move: "Peer move, same session", financial: "Calendar", price: "Prices", release: "Company release" };

/** "Mon 21 Sep, 18:04 ET" in New York time. */
export function sessionShortDateTime(d: Date) {
  return fmtDateTime(d);
}
