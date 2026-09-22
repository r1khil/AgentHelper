import "server-only";
import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { holdings, jobRuns, movements, profiles, teams } from "@/db/schema";
import { NY, formatNY, todayNY } from "@/lib/providers/calendar";
import { gatherMovementEvidence } from "./evidence";
import { queueNotification, sendPendingNotifications } from "./notify";
import { refreshEarningsCalendar } from "./earnings";
import { backfillIndustries, refreshBellwethers } from "./bellwethers";
import { ensureDriveWatch, runDriveSync } from "./drive";
import { purgeStagedUploads } from "@/lib/storage";
import { createJobReporter } from "./progress";
import { purgeExpiredMemories } from "@/lib/agent/memory/store";
import { prepEarnings } from "./earnings-prep";
import { syncFilings } from "./filings";
import { runPricesJob } from "./prices";

export type MorningJobResult = {
  date: string;
  evidenceFinished: number;
  reminders: number;
  overdue: number;
  earnings: Record<string, unknown>;
  bellwethers: Record<string, unknown>;
  email: Record<string, number>;
  drive: Record<string, unknown>;
  filings: Record<string, unknown>;
  memories: Record<string, unknown>;
  prep: Record<string, unknown>;
  prices: Record<string, unknown>;
};

/** Morning sweep: finish pending evidence, remind, flag overdue, refresh earnings, retry email. */
export async function runMorningJob(): Promise<MorningJobResult> {
  const [jobRow] = await db.insert(jobRuns).values({ job: "morning" }).returning({ id: jobRuns.id });
  const progress = createJobReporter(jobRow.id);
  const date = todayNY();
  const result: MorningJobResult = { date, evidenceFinished: 0, reminders: 0, overdue: 0, earnings: {}, bellwethers: {}, email: {}, drive: {}, filings: {}, memories: {}, prep: {}, prices: {} };

  const pending = await db.select({ id: movements.id }).from(movements).where(and(eq(movements.evidenceStatus, "pending"), ne(movements.status, "completed"))).limit(20);
  progress.step("finish pending evidence", { movements: pending.length });
  for (const [i, p] of pending.entries()) {
    try {
      await gatherMovementEvidence(p.id);
      result.evidenceFinished++;
      progress.item("evidence", i + 1, pending.length, { movementId: p.id });
    } catch (e) {
      progress.item("evidence", i + 1, pending.length, { movementId: p.id, error: e instanceof Error ? e.message : String(e) });
      // stays pending
    }
  }

  const now = DateTime.now().setZone(NY);
  const open = await db
    .select({ m: movements, h: holdings, teamSlug: teams.slug })
    .from(movements)
    .innerJoin(holdings, eq(holdings.id, movements.holdingId))
    .innerJoin(teams, eq(teams.id, holdings.teamId))
    .where(and(ne(movements.status, "completed"), isNull(movements.dataQuality)));
  progress.step("reminders and overdue", { open: open.length });

  for (const { m, h, teamSlug } of open) {
    if (!m.dueAt) continue;
    const due = DateTime.fromJSDate(m.dueAt).setZone(NY);
    const link = `${process.env.APP_URL ?? ""}/t/${teamSlug}/movements/${m.id}`;
    const recipients = await recipientsFor(h.teamId, m.ownerId);
    const isDueToday = due.hasSame(now, "day");
    if (isDueToday && now < due) {
      for (const r of recipients) {
        const q = await queueNotification({
          kind: "reminder",
          recipientId: r.id,
          recipientEmail: r.email,
          refId: m.id,
          dedupeKey: `reminder:${m.id}:${r.id}`,
          subject: `Reminder: ${h.ticker} movement update due ${formatNY(m.dueAt, "h:mm a")} ET today`,
          body: `The ${h.ticker} major-movement update for ${m.sessionDate} is due at ${formatNY(m.dueAt, "h:mm a")} ET today.\n\nWorkspace: ${link}`,
        });
        if (q) result.reminders++;
      }
    } else if (now > due) {
      for (const r of recipients) {
        const q = await queueNotification({
          kind: "overdue",
          recipientId: r.id,
          recipientEmail: r.email,
          refId: m.id,
          dedupeKey: `overdue:${m.id}:${r.id}`,
          subject: `Overdue: ${h.ticker} movement update (${m.sessionDate})`,
          body: `The ${h.ticker} major-movement update for ${m.sessionDate} was due ${formatNY(m.dueAt, "cccc MMM d, h:mm a")} ET and is still open.\n\nWorkspace: ${link}`,
        });
        if (q) result.overdue++;
      }
    }
  }

  progress.step("refresh earnings calendar", { reminders: result.reminders, overdue: result.overdue });
  try {
    result.earnings = await refreshEarningsCalendar();
  } catch (e) {
    result.earnings = { error: e instanceof Error ? e.message : String(e) };
    progress.warn("earnings calendar failed", { error: result.earnings.error });
  }

  // Yahoo's daily bars for ETFs and stocks can lag the evening prices run (seen 2026-09-21: the
  // benchmark ETFs stopped a session short while the index had closed), which holds the
  // attribution calendar back a day. By morning the bars are final, so catch up here.
  progress.step("catch up closes");
  try {
    const prices = await runPricesJob({ budgetMs: 60_000 });
    result.prices = { status: prices.status, updated: prices.updated.length, failed: Object.keys(prices.failed).length, remaining: prices.remaining.length, ...(prices.reason ? { reason: prices.reason } : {}) };
  } catch (e) {
    result.prices = { error: e instanceof Error ? e.message : String(e) };
    progress.warn("closes catch-up failed", { error: result.prices.error });
  }

  // Sector bellwethers and industries come after the holdings so they never crowd them out.
  progress.step("refresh bellwethers and industries");
  try {
    const industries = await backfillIndustries();
    result.bellwethers = { ...(await refreshBellwethers()), industries };
  } catch (e) {
    result.bellwethers = { error: e instanceof Error ? e.message : String(e) };
    progress.warn("bellwethers failed", { error: result.bellwethers.error });
  }

  progress.step("send pending email");
  try {
    result.email = await sendPendingNotifications();
  } catch (e) {
    result.email = { error: 1 };
    progress.warn("email failed", { error: e instanceof Error ? e.message : String(e) });
  }

  // Evidence packs for reports in the next few trading days; a few per run so chat keeps its request budget.
  progress.step("build earnings prep packs");
  try {
    const r = await prepEarnings();
    result.prep = { candidates: r.candidates, built: r.built, failed: r.failed, window: r.window };
    if (Object.keys(r.failed).length) progress.warn("some prep packs failed", { failed: r.failed });
  } catch (e) {
    result.prep = { error: e instanceof Error ? e.message : String(e) };
    progress.warn("prep packs failed", { error: result.prep.error });
  }

  progress.step("purge expired agent memories");
  try {
    result.memories = { purged: await purgeExpiredMemories() };
  } catch (e) {
    result.memories = { error: e instanceof Error ? e.message : String(e) };
    progress.warn("memory purge failed", { error: result.memories.error });
  }

  progress.step("sync Google Drive index");
  try {
    const watch = await ensureDriveWatch();
    const r = await runDriveSync({ reason: "morning", ingest: { budgetMs: 150_000, maxFiles: 25 } });
    const ingest = r.ingest ? { status: r.ingest.status, considered: r.ingest.considered, summarized: r.ingest.summarized, embedded: r.ingest.embedded, proposals: r.ingest.proposals, failed: r.ingest.failed.length, remaining: r.ingest.remaining } : undefined;
    result.drive = { status: r.status, reason: r.reason, files: r.files, matched: r.matched, unmatched: r.unmatched.length, ingest, watch: { status: watch.status, reason: watch.reason }, purgedStaged: await purgeStagedUploads().catch(() => 0) };
  } catch (e) {
    result.drive = { error: e instanceof Error ? e.message : String(e) };
    progress.warn("drive sync failed", { error: result.drive.error });
  }

  // New SEC filings for every holding, then a bounded embedding pass; the shared free-model budget is respected (429 stops it).
  progress.step("sync SEC filings");
  try {
    const r = await syncFilings({ budgetMs: 60_000, reason: "morning" });
    result.filings = { status: r.status, reason: r.reason, holdings: r.holdings, listed: r.listed, added: r.added, failed: r.failed.length, ingest: r.ingest ? { status: r.ingest.status, embedded: r.ingest.embedded, remaining: r.ingest.remaining } : undefined };
    if (r.failed.length) progress.warn("some holdings failed to list filings", { failed: r.failed });
  } catch (e) {
    result.filings = { error: e instanceof Error ? e.message : String(e) };
    progress.warn("filings sync failed", { error: result.filings.error });
  }

  progress.step("finished", { evidenceFinished: result.evidenceFinished, reminders: result.reminders, overdue: result.overdue });
  await progress.close();
  await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: result as unknown as Record<string, unknown> }).where(eq(jobRuns.id, jobRow.id));
  return result;
}

export async function recipientsFor(teamId: string, ownerId: string | null) {
  const leads = await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(and(eq(profiles.teamId, teamId), eq(profiles.role, "lead_analyst")));
  const out = new Map(leads.map((l) => [l.id, l]));
  if (ownerId) {
    const [o] = await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(eq(profiles.id, ownerId)).limit(1);
    if (o) out.set(o.id, o);
  }
  return [...out.values()];
}

// Used by the overdue query typing above.
void lt;
