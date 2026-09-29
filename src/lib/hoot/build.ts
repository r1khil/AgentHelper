import { earningsHref, holdingHref, modelHref, movementHref, sellSideHref } from "@/lib/scope";
import { fmtDateTime, fmtDay } from "@/lib/format";

/** "META's Sep 24 move": which write-up, when a holding has two open at once. */
const moveName = (m: { ticker: string; sessionDate?: string | null }, now: Date) => (m.sessionDate ? `${m.ticker} ${fmtDay(m.sessionDate, now)}` : m.ticker);
import type { HootNudge } from "./types";

// Plain rows, so the ranking is testable without a database. The loader in nudges.ts fills these.
export type NudgeInput = {
  /** The scope the member is in; links open there when it shows the item (see scopeFor), else in the item's team. */
  scope?: string | null;
  now: Date;
  /** YYYY-MM-DD in New York. */
  today: string;
  /** The next few trading days after today, New York dates. */
  soon: string[];
  /** Unfinished write-ups on this member's own team. A write-up belongs to the whole team, so each one is theirs. */
  myMovements: { id: string; ticker: string; teamSlug: string; dueAt: Date | null; sessionDate?: string | null }[];
  /** Unfinished write-ups on the other teams this member runs (an exec or admin runs every team, and has none of their own). */
  teamMovements: { id: string; ticker: string; teamSlug: string; teamName: string; dueAt: Date | null; sessionDate?: string | null }[];
  /** `mine`: the holding is on this member's own team. */
  earnings: { id: string; ticker: string; teamSlug: string; reportDate: string; reportHour: string | null; expectationsLocked: boolean; mine: boolean }[];
  mySellSide: { id: string; ticker: string; teamSlug: string; status: string; updatedAt: Date }[];
  thesisProposals: { ticker: string; teamSlug: string }[];
  modelProposals: { modelId: string; ticker: string; teamSlug: string; count: number }[];
  /** This week's pack while it is not Sent yet. */
  weeklyPack: { weekEnding: string; state: "draft" | "scheduled" | "failed" } | null;
  latestChangelog: { prNumber: number; headline: string; mergedAt: Date } | null;
  dismissed: Record<string, string>;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const when = (hour: string | null) => (hour === "bmo" ? " before the open" : hour === "amc" ? " after the close" : "");

function list(tickers: string[]) {
  const uniq = [...new Set(tickers)];
  return uniq.length <= 3 ? uniq.join(", ") : `${uniq.slice(0, 3).join(", ")} and ${uniq.length - 3} more`;
}

function weekday(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** Everything Hoot could mention, most urgent first, minus what this member already dismissed. */
export function buildNudges(i: NudgeInput): HootNudge[] {
  const out: HootNudge[] = [];

  for (const m of i.myMovements) {
    if (!m.dueAt) continue;
    const left = m.dueAt.getTime() - i.now.getTime();
    const href = movementHref(i.scope, m.teamSlug, m.id);
    const at = m.dueAt.toISOString();
    if (left < 0) {
      out.push({ id: `movement:${m.id}:overdue`, kind: "movement", priority: 1, mood: "concerned", href, at, title: `Your team's ${moveName(m, i.now)} write-up is overdue`, detail: "Anyone on the team can write it. A short update on why it moved, with sources, is enough." });
    } else if (left < 48 * HOUR) {
      const hours = Math.max(1, Math.round(left / HOUR));
      out.push({ id: `movement:${m.id}:due`, kind: "movement", priority: 2, mood: "alert", href, at, title: `Your team's ${moveName(m, i.now)} write-up is due in ${hours}h`, detail: "I can pull the filings and news from that session. Open it and ask me." });
    } else {
      // Due after a weekend or holiday: still owed, just not pressing yet.
      const day = m.dueAt.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
      out.push({ id: `movement:${m.id}:due`, kind: "movement", priority: 5, mood: "idle", href, at, title: `Your team's ${moveName(m, i.now)} write-up is due ${day}`, detail: "I can pull the filings and news from that session. Open it and ask me." });
    }
  }

  for (const m of i.teamMovements) {
    if (!m.dueAt) continue;
    const href = movementHref(i.scope, m.teamSlug, m.id);
    const at = m.dueAt.toISOString();
    if (m.dueAt.getTime() < i.now.getTime()) {
      out.push({ id: `movement:${m.id}:team:overdue`, kind: "movement", priority: 3, mood: "concerned", href, at, title: `${moveName(m, i.now)} write-up is overdue`, detail: `${m.teamName} hasn't finished it yet. Check in with the team.` });
    } else {
      // Not late yet: worth knowing about, not worth a speech bubble.
      out.push({ id: `movement:${m.id}:team:due`, kind: "movement", priority: 5, mood: "idle", href, at, title: `${moveName(m, i.now)} write-up is due ${fmtDateTime(at, i.now)}`, detail: `${m.teamName} is on it.` });
    }
  }

  const upcoming = i.earnings.filter((e) => e.reportDate === i.today || i.soon.includes(e.reportDate));
  for (const e of upcoming) {
    const href = earningsHref(i.scope, e.teamSlug, e.id);
    if (e.reportDate === i.today) {
      out.push({ id: `earnings:${e.id}:today`, kind: "earnings", priority: 2, mood: "alert", href, at: e.reportDate, title: `${e.ticker} reports today${when(e.reportHour)}`, detail: e.expectationsLocked ? "Your expectations are locked in. Check back for the reflection." : "Expectations aren't written down yet. There's still time before the numbers land." });
    } else if (e.mine && !e.expectationsLocked) {
      out.push({ id: `earnings:${e.id}:expectations`, kind: "earnings", priority: 3, mood: "alert", href, at: e.reportDate, title: `Write down expectations for ${e.ticker}`, detail: `It reports ${weekday(e.reportDate)}${when(e.reportHour)}. Locking them in first keeps the reflection honest.` });
    }
  }
  const later = upcoming.filter((e) => e.reportDate !== i.today);
  if (later.length) {
    const first = later[0];
    out.push({
      id: `earnings:week:${later.map((e) => e.id).sort().join(",")}`,
      kind: "earnings",
      priority: 5,
      mood: "idle",
      href: later.length === 1 ? earningsHref(i.scope, first.teamSlug, first.id) : "/markets",
      at: first.reportDate,
      title: `${list(later.map((e) => e.ticker))} ${later.length === 1 ? "reports" : "report"} in the next few days`,
    });
  }

  for (const c of i.mySellSide) {
    const href = sellSideHref(i.scope, c.teamSlug, c.id);
    const fresh = i.now.getTime() - c.updatedAt.getTime() < 7 * DAY;
    if (c.status === "ready" && fresh) {
      out.push({ id: `sell_side:${c.id}:ready`, kind: "sell_side", priority: 4, mood: "happy", href, at: c.updatedAt.toISOString(), title: `Your ${c.ticker} call brief is ready`, detail: "Transcript, key points and cross-checks against your team's files." });
    } else if (c.status === "error" && fresh) {
      out.push({ id: `sell_side:${c.id}:error`, kind: "sell_side", priority: 3, mood: "concerned", href, at: c.updatedAt.toISOString(), title: `Your ${c.ticker} call needs a retry`, detail: "Nothing was lost. Retry picks up from the last saved step." });
    }
  }

  if (i.thesisProposals.length) {
    const first = i.thesisProposals[0];
    out.push({
      id: `proposal:thesis:${i.thesisProposals.map((p) => p.ticker).sort().join(",")}`,
      kind: "proposal",
      priority: 5,
      mood: "idle",
      href: holdingHref(i.scope, first.teamSlug, first.ticker),
      title: `Thesis update proposed for ${list(i.thesisProposals.map((p) => p.ticker))}`,
      detail: "Drafted from new Drive files. Accept or dismiss it on the holding page.",
    });
  }
  for (const m of i.modelProposals) {
    out.push({ id: `proposal:model:${m.modelId}:${m.count}`, kind: "proposal", priority: 6, mood: "idle", href: modelHref(i.scope, m.teamSlug, m.modelId), title: `${m.count} model ${m.count === 1 ? "update" : "updates"} to review for ${m.ticker}`, detail: "From the latest filing. Nothing is written until you approve it." });
  }

  if (i.weeklyPack) {
    // Same words as the Weekly page. Only a Scheduled pack has `at`, which the list shows as "Sends Sun 12:00".
    // A failure gets its own id, so it shows even after the scheduled nudge was dismissed.
    const { weekEnding, state } = i.weeklyPack;
    const base = { kind: "weekly", priority: 6, href: `/weekly/${weekEnding}` } as const;
    const byState: Record<typeof state, HootNudge> = {
      scheduled: { ...base, id: `weekly:${weekEnding}`, mood: "idle", at: weekEnding, title: "This week's update pack is scheduled", detail: "Review the figures and agenda before it goes out." },
      draft: { ...base, id: `weekly:${weekEnding}`, mood: "idle", title: "This week's update pack is a draft", detail: "It has not been sent. Review it, then send it from the pack." },
      failed: { ...base, id: `weekly:${weekEnding}:failed`, mood: "concerned", title: "This week's update pack failed to send", detail: "The Email tab says why. Send it again from there." },
    };
    out.push(byState[state]);
  }

  if (i.latestChangelog && i.now.getTime() - i.latestChangelog.mergedAt.getTime() < 14 * DAY) {
    out.push({ id: `changelog:${i.latestChangelog.prNumber}`, kind: "changelog", priority: 7, mood: "happy", href: "/changelog", at: i.latestChangelog.mergedAt.toISOString(), title: "New in the app", detail: i.latestChangelog.headline });
  }

  return out.filter((n) => !i.dismissed[n.id]).sort((a, b) => a.priority - b.priority);
}
