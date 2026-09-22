import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, weeklyRequests, type WeeklyRequest } from "@/db/schema";
import { emailConfigured, sendEmail } from "@/lib/jobs/notify";
import { getSetting } from "@/lib/settings";
import { askEmailText, askSubject } from "./ask-text";
import { replyAddress } from "./inbound";
import { getPack, normalizeAgenda } from "./store";
import { previousWeekEnding } from "./weeks";

/** Optional override: a comma or newline separated list of addresses. Default is every exec. */
export const WEEKLY_RECIPIENTS_SETTING = "weekly_recipients";

export type Recipient = { id: string | null; email: string };

export function inboundConfigured() {
  return Boolean(process.env.INBOUND_EMAIL_DOMAIN);
}

/** Test accounts never receive real email; their request row records the skip instead. */
export function isTestAddress(email: string) {
  return email.endsWith(".owlfund.local");
}

export async function weeklyRecipients(): Promise<Recipient[]> {
  const override = (await getSetting(WEEKLY_RECIPIENTS_SETTING))?.trim();
  if (override) {
    const emails = [...new Set(override.split(/[,\n]/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (emails.length) {
      const known = await db.select({ id: profiles.id, email: profiles.email }).from(profiles);
      const byEmail = new Map(known.map((p) => [p.email.toLowerCase(), p.id]));
      return emails.map((email) => ({ id: byEmail.get(email) ?? null, email }));
    }
  }
  const execs = await db.select({ id: profiles.id, email: profiles.email }).from(profiles).where(eq(profiles.role, "exec")).orderBy(profiles.email);
  return execs.map((e) => ({ id: e.id, email: e.email }));
}

function newToken() {
  return randomBytes(16).toString("hex");
}

export type AskResult = { sent: number; skipped: number; failed: number; recipients: string[]; reason?: string };

/**
 * One ask per exec per week. The row (and its token) is created even when nothing can be sent, so
 * the page always shows who was asked and why an email did not go out.
 */
export async function sendProcessUpdateAsks(weekEnding: string, opts: { resend?: boolean; only?: string } = {}): Promise<AskResult> {
  const all = await weeklyRecipients();
  const recipients = opts.only ? all.filter((r) => r.email.toLowerCase() === opts.only!.toLowerCase()) : all;
  const result: AskResult = { sent: 0, skipped: 0, failed: 0, recipients: recipients.map((r) => r.email) };
  if (!recipients.length) return { ...result, reason: opts.only ? `${opts.only} is not on the recipient list` : "no exec recipients" };

  const prev = await getPack(previousWeekEnding(weekEnding));
  const lastWeekProcessUpdates = prev ? normalizeAgenda(prev.agenda).processUpdates : [];
  const domain = process.env.INBOUND_EMAIL_DOMAIN ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const packUrl = appUrl ? `${appUrl}/weekly/${weekEnding}` : null;
  const subject = askSubject(weekEnding);
  const text = askEmailText({ weekEnding, lastWeekProcessUpdates, packUrl });

  for (const recipient of recipients) {
    const existing = await db
      .select()
      .from(weeklyRequests)
      .where(and(eq(weeklyRequests.weekEnding, weekEnding), eq(weeklyRequests.recipientEmail, recipient.email)))
      .limit(1)
      .then((r) => r[0] ?? null);
    // An ask that already went out is only repeated when someone asks for it.
    if (existing?.sentAt && !opts.resend) {
      result.skipped++;
      continue;
    }
    const token = existing?.token ?? newToken();
    const address = domain ? replyAddress(weekEnding, token, domain) : "";
    const row: WeeklyRequest | null =
      existing ??
      (await db
        .insert(weeklyRequests)
        .values({ weekEnding, recipientId: recipient.id, recipientEmail: recipient.email, token, replyAddress: address })
        .onConflictDoNothing({ target: [weeklyRequests.weekEnding, weeklyRequests.recipientEmail] })
        .returning()
        .then((r) => r[0] ?? null));
    if (!row) {
      result.failed++;
      continue;
    }
    if (address && row.replyAddress !== address) await db.update(weeklyRequests).set({ replyAddress: address }).where(eq(weeklyRequests.id, row.id));

    const skipReason = isTestAddress(recipient.email)
      ? "skipped: test account"
      : !emailConfigured()
        ? "skipped: email not configured"
        : !domain
          ? "skipped: INBOUND_EMAIL_DOMAIN is not set"
          : null;
    if (skipReason) {
      await db.update(weeklyRequests).set({ sendError: skipReason, sentAt: new Date(), resendId: null }).where(eq(weeklyRequests.id, row.id));
      result.skipped++;
      continue;
    }
    try {
      const id = await sendEmail({ to: recipient.email, subject, text, replyTo: address });
      await db.update(weeklyRequests).set({ sentAt: new Date(), sendError: null, resendId: id || null }).where(eq(weeklyRequests.id, row.id));
      result.sent++;
    } catch (e) {
      await db.update(weeklyRequests).set({ sendError: e instanceof Error ? e.message : String(e) }).where(eq(weeklyRequests.id, row.id));
      result.failed++;
    }
  }
  return result;
}
