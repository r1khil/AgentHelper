import type { PillTone } from "@/components/app/panel";
import type { MovementStatus } from "./types";
import { fmtDateTime, fmtDay } from "@/lib/format";
import { toneOf } from "@/components/app/attribution/format";

/** A session (a calendar date): "Tue, Sep 22", or "Sep 22, 2025" in another year. */
export function sessionShort(d: string, now = new Date()) {
  return fmtDay(d, now);
}

/** The session as the movement's heading; the same day format as everywhere else. */
export function sessionLong(d: string, now = new Date()) {
  return fmtDay(d, now);
}

/** "Wed, Sep 23, 12:00 PM ET" */
export function dueLabel(d: Date | null, now = new Date()) {
  return d ? fmtDateTime(d, now) : "—";
}

/** "Overdue by 2h 41m", "Overdue by 2d 3h". */
export function overdueLabel(dueAt: Date | null, now = Date.now()) {
  if (!dueAt) return "Overdue";
  const minutes = Math.max(1, Math.floor((now - dueAt.getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days >= 1) return `Overdue by ${days}d ${hours}h`;
  if (hours >= 1) return `Overdue by ${hours}h ${minutes % 60}m`;
  return `Overdue by ${minutes}m`;
}

export function isOverdue(status: MovementStatus, dueAt: Date | null, now = Date.now()) {
  return status !== "completed" && !!dueAt && dueAt.getTime() < now;
}

/** The list's status word. Red only for overdue (the reader owes it); a draft in progress is not a problem, so it is plain. */
export function movementPill(status: MovementStatus, overdue: boolean): { tone: PillTone; label: string } {
  if (overdue) return { tone: "hoot", label: "Overdue" };
  if (status === "completed") return { tone: "good", label: "Completed" };
  if (status === "in_progress") return { tone: "neutral", label: "In progress" };
  return { tone: "neutral", label: "Open" };
}

/** "Tue, Sep 22, 6:04 PM ET" */
export function gatheredAt(d: Date) {
  return fmtDateTime(d);
}

export function wordCount(text: string | null) {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

/** A source's kind as a citation names it when the publisher is unknown. */
export const KIND_LABEL: Record<string, string> = { news: "News", filing: "SEC filing", peer_move: "Peer move, same session", financial: "Calendar", price: "Prices", release: "Company release" };

/** The evidence column's group headings, in the order the groups run. */
export const GROUP_ORDER = ["price", "news", "filing", "peer_move", "financial", "release"];
export const GROUP_LABEL: Record<string, string> = { price: "Prices", news: "News", filing: "SEC filings", peer_move: "Peer move, same session", financial: "Calendar", release: "Company releases" };

/** "Mon, Sep 21, 6:04 PM ET" in New York time. */
export function sessionShortDateTime(d: Date) {
  return fmtDateTime(d);
}

/** The colour of a signed figure at the precision shown: green up, red down, grey flat or missing. */
export function dirClass(value: number | null | undefined, scale = 1) {
  const tone = toneOf(value, scale);
  return tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-muted-foreground";
}
