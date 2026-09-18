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

export type MorningJobResult = {
  date: string;
  evidenceFinished: number;
  reminders: number;
  overdue: number;
  earnings: Record<string, unknown>;
  bellwethers: Record<string, unknown>;
  email: Record<string, number>;
  drive: Record<string, unknown>;
};

/** Morning sweep: finish pending evidence, remind, flag overdue, refresh earnings, retry email. */
export async function runMorningJob(): Promise<MorningJobResult> {
  const [jobRow] = await db.insert(jobRuns).values({ job: "morning" }).returning({ id: jobRuns.id });
  const date = todayNY();
  const result: MorningJobResult = { date, evidenceFinished: 0, reminders: 0, overdue: 0, earnings: {}, bellwethers: {}, email: {}, drive: {} };

  const pending = await db.select({ id: movements.id }).from(movements).where(and(eq(movements.evidenceStatus, "pending"), ne(movements.status, "completed"))).limit(20);
  for (const p of pending) {
    try {
      await gatherMovementEvidence(p.id);
      result.evidenceFinished++;
    } catch {
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

  try {
    result.earnings = await refreshEarningsCalendar();
  } catch (e) {
    result.earnings = { error: e instanceof Error ? e.message : String(e) };
  }

  // Sector bellwethers and industries come after the holdings so they never crowd them out.
  try {
    const industries = await backfillIndustries();
    result.bellwethers = { ...(await refreshBellwethers()), industries };
  } catch (e) {
    result.bellwethers = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    result.email = await sendPendingNotifications();
  } catch (e) {
    result.email = { error: 1 };
    void e;
  }

  try {
    const watch = await ensureDriveWatch();
    const r = await runDriveSync({ reason: "morning", ingest: { budgetMs: 150_000, maxFiles: 25 } });
    const ingest = r.ingest ? { status: r.ingest.status, considered: r.ingest.considered, summarized: r.ingest.summarized, embedded: r.ingest.embedded, proposals: r.ingest.proposals, failed: r.ingest.failed.length, remaining: r.ingest.remaining } : undefined;
    result.drive = { status: r.status, reason: r.reason, files: r.files, matched: r.matched, unmatched: r.unmatched.length, ingest, watch: { status: watch.status, reason: watch.reason }, purgedStaged: await purgeStagedUploads().catch(() => 0) };
  } catch (e) {
    result.drive = { error: e instanceof Error ? e.message : String(e) };
  }

  await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: result as unknown as Record<string, unknown> }).where(eq(jobRuns.id, jobRow.id));
  return result;
}

async function recipientsFor(teamId: string, ownerId: string | null) {
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
