import type { HootNudge } from "./types";

// Plain rows, so the ranking is testable without a database. The loader in nudges.ts fills these.
export type NudgeInput = {
  now: Date;
  /** YYYY-MM-DD in New York. */
  today: string;
  /** The next few trading days after today, New York dates. */
  soon: string[];
  myMovements: { id: string; ticker: string; teamSlug: string; dueAt: Date | null }[];
  earnings: { id: string; ticker: string; teamSlug: string; reportDate: string; reportHour: string | null; expectationsLocked: boolean; mine: boolean }[];
  mySellSide: { id: string; ticker: string; teamSlug: string; status: string; updatedAt: Date }[];
  thesisProposals: { ticker: string; teamSlug: string }[];
  modelProposals: { modelId: string; ticker: string; teamSlug: string; count: number }[];
  weeklyDraft: { weekEnding: string } | null;
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
    const href = `/t/${m.teamSlug}/movements/${m.id}`;
    if (left < 0) {
      out.push({ id: `movement:${m.id}:overdue`, kind: "movement", priority: 1, mood: "concerned", href, at: m.dueAt.toISOString(), title: `Your ${m.ticker} write-up is overdue`, detail: "The team is waiting on why it moved. A short update with sources is enough." });
    } else if (left < 48 * HOUR) {
      const hours = Math.max(1, Math.round(left / HOUR));
      out.push({ id: `movement:${m.id}:due`, kind: "movement", priority: 2, mood: "alert", href, at: m.dueAt.toISOString(), title: `Your ${m.ticker} write-up is due in ${hours}h`, detail: "I can pull the filings and news from that session. Open it and ask the agent." });
    }
  }

  const upcoming = i.earnings.filter((e) => e.reportDate === i.today || i.soon.includes(e.reportDate));
  for (const e of upcoming) {
    const href = `/t/${e.teamSlug}/earnings/${e.id}`;
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
      href: later.length === 1 ? `/t/${first.teamSlug}/earnings/${first.id}` : `/t/${first.teamSlug}/earnings`,
      at: first.reportDate,
      title: `${list(later.map((e) => e.ticker))} ${later.length === 1 ? "reports" : "report"} in the next few days`,
    });
  }

  for (const c of i.mySellSide) {
    const href = `/t/${c.teamSlug}/sell-side/${c.id}`;
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
      href: `/t/${first.teamSlug}/h/${first.ticker}`,
      title: `Thesis update proposed for ${list(i.thesisProposals.map((p) => p.ticker))}`,
      detail: "Drafted from new Drive files. Accept or dismiss it on the holding page.",
    });
  }
  for (const m of i.modelProposals) {
    out.push({ id: `proposal:model:${m.modelId}:${m.count}`, kind: "proposal", priority: 6, mood: "idle", href: `/t/${m.teamSlug}/models/${m.modelId}`, title: `${m.count} model ${m.count === 1 ? "update" : "updates"} to review for ${m.ticker}`, detail: "From the latest filing. Nothing is written until you approve it." });
  }

  if (i.weeklyDraft) {
    out.push({ id: `weekly:${i.weeklyDraft.weekEnding}`, kind: "weekly", priority: 6, mood: "idle", href: `/weekly/${i.weeklyDraft.weekEnding}`, at: i.weeklyDraft.weekEnding, title: "This week's update pack is drafted", detail: "Review the figures and agenda before it goes out." });
  }

  if (i.latestChangelog && i.now.getTime() - i.latestChangelog.mergedAt.getTime() < 14 * DAY) {
    out.push({ id: `changelog:${i.latestChangelog.prNumber}`, kind: "changelog", priority: 7, mood: "happy", href: "/changelog", at: i.latestChangelog.mergedAt.toISOString(), title: "New in the app", detail: i.latestChangelog.headline });
  }

  return out.filter((n) => !i.dismissed[n.id]).sort((a, b) => a.priority - b.priority);
}
