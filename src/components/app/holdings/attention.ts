import { DateTime } from "luxon";
import { previousTradingDay } from "@/lib/providers/calendar";
import { fmtDay, fmtDayMonth } from "@/lib/format";
import type { PillTone } from "@/components/app/panel";

/** A "Needs attention" pill on the Holdings list: caution for something due, neutral for something to review. */
export type AttentionFlag = { tone: Extract<PillTone, "hoot" | "caution" | "neutral">; label: string; /** A grey line under the label: why, or what to do. */ detail?: string; href?: string };

/** The subset of `HoldingSignals` (src/lib/holdings.ts) the flags are derived from; plain data, no server imports. */
export type AttentionInput = {
  nextReport: { id: string; reportDate: string; reportHour: string | null; locked: boolean } | null;
  modelUpdates: number;
  thesisProposed: boolean;
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
 * Everything waiting on a holding, most urgent first: expectations due for a report within two weeks, model values
 * to review, a proposed thesis.
 */
export function attentionFlags(s: AttentionInput, ctx: { teamSlug: string; ticker: string; today: string; now: number }): AttentionFlag[] {
  const out: AttentionFlag[] = [];
  const base = `/t/${ctx.teamSlug}`;
  if (s.nextReport && !s.nextReport.locked && reportsWithin(s.nextReport.reportDate, ctx.today)) {
    out.push({ tone: "caution", label: `Expectations due ${shortDate(expectationsDue(s.nextReport.reportDate, s.nextReport.reportHour))}`, detail: "Lock them before the report", href: `${base}/earnings/${s.nextReport.id}` });
  }
  if (s.modelUpdates > 0) out.push({ tone: "neutral", label: `${s.modelUpdates} model update${s.modelUpdates === 1 ? "" : "s"}`, detail: "Values to decide", href: `${base}/models` });
  if (s.thesisProposed) out.push({ tone: "neutral", label: "Thesis proposed", detail: "Accept or dismiss it", href: `${base}/h/${encodeURIComponent(ctx.ticker)}` });
  return out;
}

/** One row of a holding page's "needs you" notice: a status word, what is waiting, and the one action that settles it. */
export type NeedRow = {
  key: string;
  /** "4 days overdue", "Due Sep 29, 12:00 PM ET", "3 to decide". */
  status: string;
  /** Red for anything overdue (the bell agrees from the first minute); amber for everything else that waits. */
  tone: "overdue" | "caution";
  title: string;
  detail?: string;
  action: string;
  href: string;
};

/** What the holding page knows about each thing that can wait on the team. Plain data, no server imports. */
export type NeedsInput = {
  nextReport: { id: string; reportDate: string; reportHour: string | null; fiscalPeriod: string | null; locked: boolean; drafted: boolean } | null;
  models: { id: string; fileName: string; version: number; toDecide: number }[];
  thesisProposed: boolean;
};

/**
 * Everything waiting on one holding, for the notice on its page: expectations for a report within two weeks, model values to decide, and a proposed thesis. Unlike `attentionFlags`
 * (one flag per kind for the Portfolio's rows) it lists each item with its own action.
 */
export function holdingNeeds(s: NeedsInput, ctx: { base: string; today: string; now: number }): NeedRow[] {
  const out: NeedRow[] = [];
  const r = s.nextReport;
  if (r && !r.locked && reportsWithin(r.reportDate, ctx.today)) {
    const due = expectationsDue(r.reportDate, r.reportHour);
    const late = due < ctx.today;
    out.push({
      key: `report-${r.id}`,
      status: late ? "Overdue" : due === ctx.today ? "Due today" : `Due ${fmtDay(due)}`,
      tone: late ? "overdue" : "caution",
      title: `Expectations for the ${r.fiscalPeriod ? `${r.fiscalPeriod} ` : ""}report on ${fmtDayMonth(r.reportDate)}`,
      detail: r.drafted ? "A draft, not locked yet" : "Lock them before the report",
      action: r.drafted ? "Finish" : "Write them",
      href: `${ctx.base}/earnings/${r.id}`,
    });
  }
  for (const m of s.models) {
    if (m.toDecide <= 0) continue;
    out.push({ key: `model-${m.id}`, status: `${m.toDecide} to decide`, tone: "caution", title: `Model values proposed for ${m.fileName}`, detail: `Version ${m.version}, from the latest filing`, action: "Review", href: `${ctx.base}/models/${m.id}` });
  }
  if (s.thesisProposed) out.push({ key: "thesis", status: "Proposed", tone: "caution", title: "A thesis taken from the team's report", detail: "Accept or dismiss it", action: "Review", href: "#thesis" });
  return out;
}
