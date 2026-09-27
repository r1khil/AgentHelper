import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, weeklyUpdates } from "@/db/schema";
import { deliverEmail, emailConfigured } from "@/lib/jobs/notify";
import { getSetting } from "@/lib/settings";
import { isTestAddress, parseRecipients, splitRecipients, weeklyEmailSubject, weeklyEmailText } from "./email-text";
import { getPack, noteSource, normalizeAgenda, packFigures } from "./store";

/** Optional override: a comma or newline separated list of addresses, the first in To and the rest in CC. */
export const WEEKLY_RECIPIENTS_SETTING = "weekly_recipients";

export { WEEKLY_EMAIL_DEFAULT } from "./email-text";

/** Who gets the Sunday email, from the Admin setting (or the default when it is blank). */
export async function weeklyEmailRecipients() {
  return splitRecipients(parseRecipients(await getSetting(WEEKLY_RECIPIENTS_SETTING, { fresh: true })));
}

async function firstName(email: string): Promise<string | null> {
  const [p] = await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.email, email)).limit(1);
  return p?.fullName.trim().split(/\s+/)[0] || null;
}

/** The email as it would go out now, from the pack as stored. Null when the week has no pack. */
export async function composeWeeklyEmail(weekEnding: string, to: string | null): Promise<{ subject: string; text: string } | null> {
  const pack = await getPack(weekEnding);
  if (!pack) return null;
  return {
    subject: weeklyEmailSubject(weekEnding),
    text: weeklyEmailText({
      weekEnding,
      figures: packFigures(pack),
      performers: pack.performers,
      agenda: normalizeAgenda(pack.agenda),
      lastWeekAgenda: pack.lastWeekAgenda ? normalizeAgenda(pack.lastWeekAgenda) : null,
      sources: pack.sources ?? {},
      toName: to ? await firstName(to) : null,
    }),
  };
}

export type WeeklyEmailResult = { status: "sent" | "skipped" | "failed"; reason?: string; to?: string; cc?: string[]; id?: string };

/**
 * Send the week's email. Once it has gone out the Sunday job won't send it again; `force` (the page's "Send again") does.
 * `only` sends to that one address instead of the list, as a test, and is not recorded as the week's email.
 */
export async function sendWeeklyEmail(weekEnding: string, opts: { force?: boolean; only?: string } = {}): Promise<WeeklyEmailResult> {
  const pack = await getPack(weekEnding);
  if (!pack) return { status: "skipped", reason: "the pack has not been built" };
  const test = Boolean(opts.only);
  if (opts.only && isTestAddress(opts.only)) return { status: "skipped", reason: `${opts.only} is a test account` };
  const sources = pack.sources ?? {};
  if (!test && !opts.force && sources.email?.status === "ok") return { status: "skipped", reason: `already sent (${sources.email.detail ?? sources.email.at})` };

  const list = await weeklyEmailRecipients();
  const to = test ? opts.only! : list.to;
  const cc = test ? [] : list.cc;
  const record = async (entry: Parameters<typeof noteSource>[2]) => {
    if (test) return;
    await db
      .update(weeklyUpdates)
      .set({ sources: noteSource(sources, "email", entry), updatedAt: new Date() })
      .where(eq(weeklyUpdates.weekEnding, weekEnding));
  };

  if (!to) {
    const reason = `paused: only test accounts are listed (${list.skipped.join(", ")})`;
    await record({ status: "held", detail: reason });
    return { status: "skipped", reason };
  }
  if (!emailConfigured()) {
    await record({ status: "held", detail: "email is not configured" });
    return { status: "skipped", reason: "email is not configured" };
  }

  const email = await composeWeeklyEmail(weekEnding, to);
  if (!email) return { status: "skipped", reason: "the pack has not been built" };
  // One key per week and list, so a retried cron can't email twice; a forced or test send gets its own.
  const key = `weekly-email:${weekEnding}:${[to, ...cc].join(",")}${test || opts.force ? `:${Date.now()}` : ""}`;
  try {
    const sent = await deliverEmail({ to, cc, subject: email.subject, text: email.text, idempotencyKey: key });
    await record({ status: "ok", detail: `to ${to}${cc.length ? `, cc ${cc.join(", ")}` : ""}` });
    return { status: "sent", to, cc, id: sent.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await record({ status: "failed", error });
    return { status: "failed", reason: error, to, cc };
  }
}
