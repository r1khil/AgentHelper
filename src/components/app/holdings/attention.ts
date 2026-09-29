import { DateTime } from "luxon";
import { previousTradingDay } from "@/lib/providers/calendar";
import { fmtChangeBp, fmtDay, fmtDayMonth, fmtTime } from "@/lib/format";
import type { PillTone } from "@/components/app/panel";

/** A "Needs attention" pill on the Holdings list. Pink only for an overdue write-up (hot); caution for due/missing. */
export type AttentionFlag = { tone: Extract<PillTone, "hoot" | "caution" | "neutral">; label: string; /** A grey line under the label: why, or what to do. */ detail?: string; href?: string };

/** The subset of `HoldingSignals` (src/lib/holdings.ts) the flags are derived from; plain data, no server imports. */
export type AttentionInput = {
  openMovement: { id: string; dueAt: Date | null; sessionDate?: string; /** Its move against the S&P 500, in percentage points. */ relativeMovePp?: number | null } | null;
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
 * Everything waiting on a holding, most urgent first: an overdue write-up, a write-up due, expectations due for a
 * report within two weeks, model values to review, a proposed thesis.
 */
export function attentionFlags(s: AttentionInput, ctx: { teamSlug: string; ticker: string; today: string; now: number }): AttentionFlag[] {
  const out: AttentionFlag[] = [];
  const base = `/t/${ctx.teamSlug}`;
  if (s.openMovement) {
    const due = s.openMovement.dueAt;
    const href = `${base}/movements/${s.openMovement.id}`;
    const { relativeMovePp, sessionDate } = s.openMovement;
    const moved = relativeMovePp != null && sessionDate ? `Moved ${fmtChangeBp(relativeMovePp * 100)} on ${fmtDayMonth(sessionDate)}` : undefined;
    if (due && due.getTime() < ctx.now) out.push({ tone: "hoot", label: "Write-up overdue", detail: moved, href });
    else out.push({ tone: "caution", label: due ? `Write-up due ${fmtDay(due)}` : "Write-up open", detail: moved, href });
  }
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
  moves: { id: string; sessionDate: string; status: string; dueAt: Date | null; relativeMovePp: number | null; dataQuality: string | null; evidence: number; drafted: boolean }[];
  nextReport: { id: string; reportDate: string; reportHour: string | null; fiscalPeriod: string | null; locked: boolean; drafted: boolean } | null;
  models: { id: string; fileName: string; version: number; toDecide: number }[];
  thesisProposed: boolean;
};

/** "4 days overdue", "1 hour overdue", "12 minutes overdue": the largest whole unit, in words. */
export function overdueWords(dueAt: Date, now: number) {
  const minutes = Math.max(1, Math.floor((now - dueAt.getTime()) / 60_000));
  const [n, unit] = minutes >= 1440 ? [Math.floor(minutes / 1440), "day"] : minutes >= 60 ? [Math.floor(minutes / 60), "hour"] : [minutes, "minute"];
  return `${n} ${unit}${n === 1 ? "" : "s"} overdue`;
}

/**
 * Everything waiting on one holding, for the notice on its page: every unfinished write-up (the most overdue first),
 * expectations for a report within two weeks, model values to decide, and a proposed thesis. Unlike `attentionFlags`
 * (one flag per kind for the Portfolio's rows) it lists each item with its own action.
 */
export function holdingNeeds(s: NeedsInput, ctx: { base: string; today: string; now: number }): NeedRow[] {
  const out: NeedRow[] = [];
  const open = s.moves.filter((m) => m.status !== "completed").sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  for (const m of open) {
    const bp = m.relativeMovePp == null ? null : m.relativeMovePp * 100;
    const late = m.dueAt && m.dueAt.getTime() < ctx.now;
    const status = m.dataQuality ? "Data problem" : late ? overdueWords(m.dueAt!, ctx.now) : m.dueAt ? `Due ${fmtDayMonth(m.dueAt)}, ${fmtTime(m.dueAt)}` : "Open";
    out.push({
      key: `move-${m.id}`,
      status,
      tone: late && !m.dataQuality ? "overdue" : "caution",
      title: `Movement write-up for ${bp == null || m.dataQuality ? "the move" : fmtChangeBp(bp)} on ${fmtDayMonth(m.sessionDate)}`,
      detail: m.dataQuality ? m.dataQuality : m.drafted ? "A draft is started" : m.evidence > 0 ? `Hoot gathered ${m.evidence} ${m.evidence === 1 ? "source" : "sources"}` : undefined,
      action: m.drafted ? "Finish" : m.dataQuality ? "Open" : "Write it",
      href: `${ctx.base}/movements/${m.id}`,
    });
  }
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
