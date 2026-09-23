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

/** OpenMail sends from Hoot's own inbox (hoot@omail.sh) with an API key, so there is no mailbox login to expire. */
function openmailConfigured() {
  return Boolean(process.env.OPENMAIL_API_KEY && process.env.OPENMAIL_INBOX);
}

/** The fund has no domain verified in Resend, so outgoing mail goes through a Gmail account when one is set. */
function gmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export function emailConfigured() {
  return openmailConfigured() || gmailConfigured() || Boolean(process.env.RESEND_API_KEY);
}

type OutgoingEmail = { to: string; cc?: string[]; subject: string; text: string; replyTo?: string; headers?: Record<string, string> };

/**
 * Send one plain-text email and return the provider's id: OpenMail when OPENMAIL_API_KEY and OPENMAIL_INBOX
 * are set, then Gmail SMTP when GMAIL_USER and GMAIL_APP_PASSWORD are, Resend otherwise. `replyTo` is what makes
 * the weekly process-update ask answerable by reply; nothing else in the app sets it.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<string> {
  if (openmailConfigured()) return sendWithOpenMail(msg);
  return gmailConfigured() ? sendWithGmail(msg) : sendWithResend(msg);
}

let openmailInboxId: string | undefined;

/** OPENMAIL_INBOX may be the inbox id or its address; the send endpoint wants the id. */
async function resolveOpenMailInbox(key: string): Promise<string> {
  const inbox = process.env.OPENMAIL_INBOX!;
  if (!inbox.includes("@")) return inbox;
  if (openmailInboxId) return openmailInboxId;
  const res = await fetch("https://api.openmail.sh/v1/inboxes", { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`OpenMail inbox lookup failed: ${res.status} ${await res.text()}`);
  const { data } = (await res.json()) as { data: { id: string; address: string }[] };
  const found = data.find((i) => i.address.toLowerCase() === inbox.toLowerCase());
  if (!found) throw new Error(`OpenMail inbox ${inbox} not found`);
  return (openmailInboxId = found.id);
}

async function sendWithOpenMail(msg: OutgoingEmail): Promise<string> {
  const key = process.env.OPENMAIL_API_KEY!;
  const inboxId = await resolveOpenMailInbox(key);
  // OpenMail has no custom headers, and on the free plan Reply-To must be one of our own OpenMail inboxes.
  const replyTo = msg.replyTo?.toLowerCase().endsWith("@omail.sh") ? msg.replyTo : undefined;
  const res = await fetch(`https://api.openmail.sh/v1/inboxes/${inboxId}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: msg.to, ...(msg.cc?.length ? { cc: msg.cc } : {}), subject: msg.subject, body: msg.text, ...(replyTo ? { replyTo } : {}) }),
  });
  const data = (await res.json().catch(() => ({}))) as { messageId?: string; status?: string; error?: string; message?: string };
  if (!res.ok || data.status === "failed") throw new Error(`OpenMail ${res.status}: ${data.message ?? data.error ?? data.status ?? "send failed"}`);
  return data.messageId ?? "";
}

async function sendWithGmail(msg: OutgoingEmail): Promise<string> {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  // Gmail always sends from the signed-in address, so only the display name is ours to choose.
  const info = await transport.sendMail({
    from: { name: process.env.GMAIL_FROM_NAME || "The Owl's Nest", address: process.env.GMAIL_USER! },
    to: msg.to,
    ...(msg.cc?.length ? { cc: msg.cc } : {}),
    subject: msg.subject,
    text: msg.text,
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    ...(msg.headers ? { headers: msg.headers } : {}),
  });
  return info.messageId ?? "";
}

async function sendWithResend(msg: OutgoingEmail): Promise<string> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || "The Owl's Nest <onboarding@resend.dev>";
  const { data, error } = await resend.emails.send({
    from,
    to: msg.to,
    ...(msg.cc?.length ? { cc: msg.cc } : {}),
    subject: msg.subject,
    text: msg.text,
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    ...(msg.headers ? { headers: msg.headers } : {}),
  });
  if (error) throw new Error(error.message);
  return data?.id ?? "";
}

async function sendOne(to: string, subject: string, text: string) {
  await sendEmail({ to, subject, text });
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
