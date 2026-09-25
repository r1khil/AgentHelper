import "server-only";
import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { DeliveryError, isRetryableStatus, parseRetryAfter, withRetries } from "@/lib/email/delivery";
import { getSetting, setSetting } from "@/lib/settings";

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

/**
 * The fund sends all of its email through OpenMail, from Hoot's own inbox (hoot@omail.sh), with an API key, so
 * there is no mailbox login to expire. There is deliberately no second provider.
 */
export function emailConfigured() {
  return Boolean(process.env.OPENMAIL_API_KEY && process.env.OPENMAIL_INBOX);
}

type OutgoingEmail = {
  to: string;
  cc?: string[];
  /** Omit when replying on `threadId`; OpenMail then uses the thread's subject with "Re:". */
  subject?: string;
  text: string;
  /** On the free plan OpenMail only accepts one of our own OpenMail inboxes here; anything else is dropped. */
  replyTo?: string;
  /** Send as a reply in this OpenMail thread (without quoting the previous message). */
  threadId?: string;
  /**
   * OpenMail sends at most one message per key within 24 hours, so repeating a send whose first request may
   * have gone through (it timed out) cannot email anyone twice. A new key per call unless given.
   */
  idempotencyKey?: string;
};

export type EmailDelivery = { id: string; tries: number };

/** Per request. OpenMail's proxy gives up on its own app after about 15 seconds. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Waits before OpenMail's second and third try. */
const OPENMAIL_RETRY_DELAYS_MS = [2_000, 8_000];

/**
 * Send one plain-text email and return OpenMail's message id. `replyTo` is what makes the weekly process-update
 * ask answerable by reply; nothing else in the app sets it.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<string> {
  return (await deliverEmail(msg)).id;
}

/**
 * Send one plain-text email from Hoot's OpenMail inbox. Transient failures (no response, a 5xx, a short rate
 * limit) are tried again with the same idempotency key, so a retry cannot send the email twice. Throws an
 * "OpenMail: …" error carrying `tries` when it could not send.
 */
export async function deliverEmail(msg: OutgoingEmail): Promise<EmailDelivery> {
  if (!emailConfigured()) throw new Error("email is not configured (OPENMAIL_API_KEY, OPENMAIL_INBOX)");
  const key = msg.idempotencyKey ?? randomUUID();
  try {
    const { value, tries } = await withRetries(() => sendWithOpenMail(msg, key), { delaysMs: OPENMAIL_RETRY_DELAYS_MS, maxWaitMs: 20_000 });
    return { id: value, tries };
  } catch (e) {
    const tries = (e as { tries?: number }).tries ?? 1;
    throw Object.assign(new Error(`OpenMail: ${e instanceof Error ? e.message : String(e)}`), { tries });
  }
}

/** A request to OpenMail's API. No response at all (timeout, network) is a retryable DeliveryError. */
async function openmail(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  try {
    return await fetch(`https://api.openmail.sh${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.OPENMAIL_API_KEY}`, ...init.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new DeliveryError(`no response (${e instanceof Error ? e.message : String(e)})`, { retryable: true });
  }
}

async function openmailError(res: Response, what: string): Promise<DeliveryError> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  const message = data.message ?? data.error ?? res.statusText;
  // The cold-recipient cap resets at midnight UTC, so trying again within this request is pointless.
  const quota = res.status === 429 && /new recipients|cold/i.test(message);
  return new DeliveryError(`${what}${res.status} ${message}`, { retryable: isRetryableStatus(res.status) && !quota, retryAfterMs: parseRetryAfter(res.headers.get("retry-after")) });
}

const INBOX_ID_SETTING = "openmail_inbox_id";
let openmailInbox: { address: string; id: string } | undefined;

/**
 * The inbox id the send endpoint wants. OPENMAIL_INBOX may be the id itself or Hoot's address (the webhook
 * reads it as the address). An address is looked up in OpenMail's inbox list once and the id kept in
 * app_settings, so sends stop depending on that list: its 502s stopped the 2026-09-24 brief twice.
 */
export async function resolveOpenMailInbox(): Promise<string> {
  const inbox = process.env.OPENMAIL_INBOX!;
  if (!inbox.includes("@")) return inbox;
  const address = inbox.toLowerCase();
  if (openmailInbox?.address === address) return openmailInbox.id;
  const saved = await getSetting(`${INBOX_ID_SETTING}:${address}`).catch(() => null);
  if (saved) return (openmailInbox = { address, id: saved }).id;
  const res = await openmail("/v1/inboxes?limit=100");
  if (!res.ok) throw await openmailError(res, "inbox lookup failed: ");
  const { data } = (await res.json()) as { data: { id: string; address: string }[] };
  const found = data.find((i) => i.address.toLowerCase() === address);
  if (!found) throw new DeliveryError(`inbox ${inbox} not found`, { retryable: false });
  await setSetting(`${INBOX_ID_SETTING}:${address}`, found.id, null).catch(() => undefined);
  return (openmailInbox = { address, id: found.id }).id;
}

/** Drop a remembered inbox id OpenMail no longer knows (the inbox was recreated), so the next try looks it up. */
async function forgetOpenMailInbox() {
  const address = process.env.OPENMAIL_INBOX?.toLowerCase();
  openmailInbox = undefined;
  if (address?.includes("@")) await setSetting(`${INBOX_ID_SETTING}:${address}`, "", null).catch(() => undefined);
}

async function sendWithOpenMail(msg: OutgoingEmail, idempotencyKey: string): Promise<string> {
  const inboxId = await resolveOpenMailInbox();
  // OpenMail has no custom headers, and on the free plan Reply-To must be one of our own OpenMail inboxes.
  const replyTo = msg.replyTo?.toLowerCase().endsWith("@omail.sh") ? msg.replyTo : undefined;
  const res = await openmail(`/v1/inboxes/${inboxId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      to: msg.to,
      ...(msg.cc?.length ? { cc: msg.cc } : {}),
      ...(msg.subject ? { subject: msg.subject } : {}),
      ...(msg.threadId ? { threadId: msg.threadId, includeQuote: false } : {}),
      body: msg.text,
      ...(replyTo ? { replyTo } : {}),
    }),
  });
  if (res.status === 404 && !msg.threadId && inboxId !== process.env.OPENMAIL_INBOX) {
    await forgetOpenMailInbox();
    throw new DeliveryError("404 inbox not found (looking its id up again)", { retryable: true });
  }
  if (!res.ok) throw await openmailError(res, "");
  const data = (await res.json().catch(() => ({}))) as { messageId?: string; status?: string };
  // A replay of the same key returns the first outcome, so a failed send stays failed.
  if (data.status === "failed") throw new DeliveryError("the send failed", { retryable: false });
  return data.messageId ?? "";
}

/** Whether OpenMail can send right now: the key works and Hoot's inbox answers. Sends nothing. */
export async function checkEmail(): Promise<{ provider: "OpenMail"; ok: boolean; detail: string }> {
  if (!emailConfigured()) return { provider: "OpenMail", ok: false, detail: "not configured" };
  try {
    const id = await resolveOpenMailInbox();
    const res = await openmail(`/v1/inboxes/${id}`);
    if (!res.ok) throw await openmailError(res, "inbox check failed: ");
    const inbox = (await res.json()) as { address?: string };
    return { provider: "OpenMail", ok: true, detail: `sends as ${inbox.address ?? id}` };
  } catch (e) {
    return { provider: "OpenMail", ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
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
