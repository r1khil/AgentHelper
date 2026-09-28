import { DateTime } from "luxon";
import { previousTradingDay } from "@/lib/providers/calendar";
import { fmtDay } from "@/lib/format";
import type { PillTone } from "@/components/app/panel";

/** A "Needs attention" pill on the Holdings list. Pink only for an overdue write-up (hot); caution for due/missing. */
export type AttentionFlag = { tone: Extract<PillTone, "hoot" | "caution" | "neutral">; label: string; href?: string };

/** The subset of `HoldingSignals` (src/lib/holdings.ts) the flags are derived from; plain data, no server imports. */
export type AttentionInput = {
  openMovement: { id: string; dueAt: Date | null } | null;
  nextReport: { id: string; reportDate: string; reportHour: string | null; locked: boolean } | null;
  modelUpdates: number;
  thesisProposed: boolean;
  hasOwner: boolean;
};

/** How far ahead an upcoming report counts as "reporting soon" (the filter chip and the expectations flag). */
export const REPORT_WINDOW_DAYS = 14;

/** "Tue 27 Oct" for an ISO date, without a timezone shift. */
export function shortDate(iso: string) {
  return fmtDay(iso);
}

export function reportsWithin(reportDate: string | undefined | null, today: string, days = REPORT_WINDOW_DAYS) {
  if (!reportDate) return false;
  const last = DateTime.fromISO(today).plus({ days }).toISODate()!;
  return reportDate >= today && reportDate <= last;
}

/** Expectations have to be written before the numbers: the session before a pre-market report, else the report day. */
export function expectationsDue(reportDate: string, reportHour: string | null) {
  return reportHour === "bmo" ? previousTradingDay(reportDate) : reportDate;
}

/**
 * Everything waiting on a holding, most urgent first: an overdue write-up, a write-up due, expectations due for a
 * report within two weeks, no owner, model values to review, a proposed thesis.
 */
export function attentionFlags(s: AttentionInput, ctx: { teamSlug: string; ticker: string; today: string; now: number }): AttentionFlag[] {
  const out: AttentionFlag[] = [];
  const base = `/t/${ctx.teamSlug}`;
  if (s.openMovement) {
    const due = s.openMovement.dueAt;
    const href = `${base}/movements/${s.openMovement.id}`;
    if (due && due.getTime() < ctx.now) out.push({ tone: "hoot", label: "Write-up overdue", href });
    else out.push({ tone: "caution", label: due ? `Write-up due ${fmtDay(due)}` : "Write-up open", href });
  }
  if (s.nextReport && !s.nextReport.locked && reportsWithin(s.nextReport.reportDate, ctx.today)) {
    out.push({ tone: "caution", label: `Expectations due ${shortDate(expectationsDue(s.nextReport.reportDate, s.nextReport.reportHour))}`, href: `${base}/earnings/${s.nextReport.id}` });
  }
  if (!s.hasOwner) out.push({ tone: "caution", label: "No owner", href: `${base}/h/${encodeURIComponent(ctx.ticker)}` });
  if (s.modelUpdates > 0) out.push({ tone: "neutral", label: `${s.modelUpdates} model update${s.modelUpdates === 1 ? "" : "s"}`, href: `${base}/models` });
  if (s.thesisProposed) out.push({ tone: "neutral", label: "Thesis proposed", href: `${base}/h/${encodeURIComponent(ctx.ticker)}` });
  return out;
}
