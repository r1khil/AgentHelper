import "server-only";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";

export type NotificationKind = "movement_alert" | "reminder" | "overdue" | "earnings";

/** Queue a notification once. The unique dedupe key makes re-runs a no-op. Returns true if newly queued. */
export async function queueNotification(n: {
  kind: NotificationKind;
  recipientId: string | null;
  recipientEmail: string;
  refId?: string | null;
  dedupeKey: string;
  subject: string;
  body: string;
}) {
  const rows = await db
    .insert(notifications)
    .values({ kind: n.kind, recipientId: n.recipientId, recipientEmail: n.recipientEmail, refId: n.refId ?? null, dedupeKey: n.dedupeKey, subject: n.subject, body: n.body })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return rows.length > 0;
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendOne(to: string, subject: string, text: string) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || "Owl Fund Workspace <onboarding@resend.dev>";
  const { error } = await resend.emails.send({ from, to, subject, text });
  if (error) throw new Error(error.message);
}

/** Send every unsent notification. Test-account addresses (*.owlfund.local) are marked sent without emailing. */
export async function sendPendingNotifications(limit = 50) {
  const pending = await db.select().from(notifications).where(isNull(notifications.sentAt)).limit(limit);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const n of pending) {
    const internal = n.recipientEmail.endsWith(".owlfund.local");
    if (internal || !emailConfigured()) {
      await db.update(notifications).set({ sentAt: new Date(), error: internal ? "skipped: test account" : "skipped: email not configured" }).where(eq(notifications.id, n.id));
      skipped++;
      continue;
    }
    try {
      await sendOne(n.recipientEmail, n.subject, n.body);
      await db.update(notifications).set({ sentAt: new Date(), error: null }).where(eq(notifications.id, n.id));
      sent++;
    } catch (e) {
      await db.update(notifications).set({ error: e instanceof Error ? e.message : String(e) }).where(eq(notifications.id, n.id));
      failed++;
    }
  }
  return { sent, skipped, failed, pending: pending.length };
}
