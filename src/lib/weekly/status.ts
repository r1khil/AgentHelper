import { DateTime } from "luxon";
import type { SourceEntry } from "./types";

/**
 * The one status a weekly pack shows, wherever it shows: the packs list, the pack's Email tab, the Manage tab badge and
 * Hoot's nudge. Two things are stored: the pack's own status (an exec can mark it sent, which locks it) and the record
 * of the Sunday email. Either one saying it went out makes the pack Sent.
 */
export type PackStatus = "draft" | "scheduled" | "sent" | "failed";

export const PACK_STATUS_LABELS: Record<PackStatus, string> = { draft: "Draft", scheduled: "Scheduled", sent: "Sent", failed: "Failed" };

const NY = "America/New_York";

/** When the Sunday job emails the pack for this Friday: the Sunday after it, 12:00 New York time. */
export function scheduledSendAt(weekEnding: string): DateTime {
  return DateTime.fromISO(weekEnding, { zone: NY }).plus({ days: 2 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
}

/**
 * - Sent: the email to the list went out, or an exec marked the pack sent.
 * - Failed: the last send to the list failed, and nothing has gone out since.
 * - Scheduled: not sent, and the Sunday 12:00 job will still email it (it hasn't run yet and the list isn't paused).
 * - Draft: not sent, and nothing will send it on its own.
 */
export function packStatus(
  pack: { weekEnding: string; status: "draft" | "sent"; email?: Pick<SourceEntry, "status"> | null },
  opts: { now?: Date; paused?: boolean } = {},
): PackStatus {
  if (pack.status === "sent" || pack.email?.status === "ok") return "sent";
  if (pack.email?.status === "failed") return "failed";
  const now = opts.now ?? new Date();
  if (!opts.paused && now.getTime() < scheduledSendAt(pack.weekEnding).toMillis()) return "scheduled";
  return "draft";
}
