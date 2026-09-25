import "server-only";
import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import {
  DeliveryError,
  isRetryableStatus,
  parseRetryAfter,
  sendWithFailover,
  withRetries,
  type ProviderAttempt,
  type ProviderName,
  type ProviderSend,
} from "@/lib/email/delivery";
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

/** OpenMail sends from Hoot's own inbox (hoot@omail.sh) with an API key, so there is no mailbox login to expire. */
function openmailConfigured() {
  return Boolean(process.env.OPENMAIL_API_KEY && process.env.OPENMAIL_INBOX);
}

/** The fund has no domain verified in Resend, so outgoing mail goes through a Gmail account when one is set. */
function gmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function emailConfigured() {
  return openmailConfigured() || gmailConfigured() || resendConfigured();
}

type OutgoingEmail = {
  to: string;
  cc?: string[];
  /** Omit when replying on `threadId`; OpenMail then uses the thread's subject with "Re:". */
  subject?: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** OpenMail only: send as a reply in this thread (without quoting the previous message). */
  threadId?: string;
  /** Gmail only: the sender's display name. OpenMail shows the inbox's own name, Resend EMAIL_FROM's. */
  fromName?: string;
  /**
   * OpenMail sends at most one message per key within 24 hours, so repeating a send whose first request may
   * have gone through (it timed out) cannot email anyone twice. A new key per call unless given.
   */
  idempotencyKey?: string;
};

export type EmailDelivery = { provider: ProviderName; id: string; attempts: ProviderAttempt[] };

/** Per request. OpenMail's proxy gives up on its own app after about 15 seconds. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Waits before OpenMail's second and third try. */
const OPENMAIL_RETRY_DELAYS_MS = [2_000, 8_000];

/**
 * Send one plain-text email and return the provider's id. `replyTo` is what makes the weekly process-update
 * ask answerable by reply; nothing else in the app sets it. See deliverEmail for how providers are chosen.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<string> {
  return (await deliverEmail(msg)).id;
}

/**
 * Send one plain-text email through the first provider that takes it: OpenMail (Hoot's own inbox, when
 * OPENMAIL_API_KEY and OPENMAIL_INBOX are set), then Gmail SMTP (GMAIL_USER, GMAIL_APP_PASSWORD), then Resend,
 * so one provider's outage or quota does not stop the app's email. OpenMail's transient failures (no response,
 * 5xx, a short rate limit) are retried first with the same idempotency key. A reply inside an OpenMail thread
 * can only go through OpenMail. Throws EmailNotSentError, which lists every provider's error.
 */
export async function deliverEmail(msg: OutgoingEmail): Promise<EmailDelivery> {
  const key = msg.idempotencyKey ?? randomUUID();
  // Replies to an email a fallback provider sent still reach Hoot's inbox.
  const fallback = { ...msg, replyTo: msg.replyTo ?? hootAddress() };
  const providers: ProviderSend<string>[] = [];
  if (openmailConfigured()) providers.push({ name: "OpenMail", send: () => withRetries(() => sendWithOpenMail(msg, key), { delaysMs: OPENMAIL_RETRY_DELAYS_MS, maxWaitMs: 20_000 }) });
  if (!msg.threadId) {
    if (gmailConfigured()) providers.push({ name: "Gmail", send: async () => ({ value: await sendWithGmail(fallback), tries: 1 }) });
    if (resendConfigured()) providers.push({ name: "Resend", send: async () => ({ value: await sendWithResend(fallback), tries: 1 }) });
  }
  const { provider, value, attempts } = await sendWithFailover(providers);
  return { provider, id: value, attempts };
}

/** Hoot's OpenMail address, when OPENMAIL_INBOX holds the address rather than the inbox id. */
function hootAddress() {
  const inbox = process.env.OPENMAIL_INBOX;
  return openmailConfigured() && inbox?.includes("@") ? inbox : undefined;
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
  // A replay of the same key returns the first outcome, so a failed send stays failed: fall through to the next provider.
  if (data.status === "failed") throw new DeliveryError("the send failed", { retryable: false });
  return data.messageId ?? "";
}

async function gmailTransport() {
  const nodemailer = await import("nodemailer");
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function sendWithGmail(msg: OutgoingEmail): Promise<string> {
  const transport = await gmailTransport();
  // Gmail always sends from the signed-in address, so only the display name is ours to choose.
  const info = await transport.sendMail({
    from: { name: msg.fromName || process.env.GMAIL_FROM_NAME || "The Owl's Nest", address: process.env.GMAIL_USER! },
    to: msg.to,
    ...(msg.cc?.length ? { cc: msg.cc } : {}),
    subject: msg.subject ?? "",
    text: msg.text,
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    ...(msg.headers ? { headers: msg.headers } : {}),
  });
  return info.messageId ?? "";
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function sendWithResend(msg: OutgoingEmail): Promise<string> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM || "The Owl's Nest <onboarding@resend.dev>";
  const { data, error } = await withTimeout(
    resend.emails.send({
      from,
      to: msg.to,
      ...(msg.cc?.length ? { cc: msg.cc } : {}),
      subject: msg.subject ?? "",
      text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      ...(msg.headers ? { headers: msg.headers } : {}),
    }),
    REQUEST_TIMEOUT_MS,
    "the send",
  );
  if (error) throw new Error(error.message);
  return data?.id ?? "";
}

export type ProviderHealth = { provider: ProviderName; configured: boolean; ok: boolean; detail: string };

/** Whether each provider could send right now: sign-in and sending identity, checked without sending anything. */
export async function checkEmailProviders(): Promise<ProviderHealth[]> {
  const check = async (provider: ProviderName, configured: boolean, run: () => Promise<string>): Promise<ProviderHealth> => {
    if (!configured) return { provider, configured, ok: false, detail: "not configured" };
    try {
      return { provider, configured, ok: true, detail: await run() };
    } catch (e) {
      return { provider, configured, ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  };
  return Promise.all([
    check("OpenMail", openmailConfigured(), async () => {
      const id = await resolveOpenMailInbox();
      const res = await openmail(`/v1/inboxes/${id}`);
      if (!res.ok) throw await openmailError(res, "inbox check failed: ");
      const inbox = (await res.json()) as { address?: string };
      return `sends as ${inbox.address ?? id}`;
    }),
    check("Gmail", gmailConfigured(), async () => {
      await withTimeout((await gmailTransport()).verify(), REQUEST_TIMEOUT_MS * 2, "the sign-in");
      return `signed in as ${process.env.GMAIL_USER}`;
    }),
    check("Resend", resendConfigured(), async () => {
      const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`domain check failed: ${res.status} ${await res.text()}`);
      const { data } = (await res.json()) as { data?: { name: string; status: string }[] };
      const domain = /@([^>\s]+)/.exec(process.env.EMAIL_FROM || "onboarding@resend.dev")?.[1]?.toLowerCase() ?? "";
      if (!(data ?? []).some((d) => d.status === "verified" && d.name.toLowerCase() === domain)) {
        throw new Error(`${domain} is not a verified domain, so Resend can only email the account's owner`);
      }
      return `sends from ${domain}`;
    }),
  ]);
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
