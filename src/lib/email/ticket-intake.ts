import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns, type Role } from "@/db/schema";
import { markRepeats, parseTicket, recordable, type TicketRead } from "@/lib/attribution/ticket";
import { checkLedger, checkPrices, MAX_TICKET_BYTES, readTicketDocx, recordTickets } from "@/lib/attribution/ticket-record";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import type { InboundEvent } from "./inbound";
import { verifyFundSender } from "./verify";
import { docxAttachments, isTicketAttempt, ticketNotAllowedBody, ticketReplyBody, ticketTextInBody, type TicketOutcome } from "./ticket-mail";

const JOB = "email_ticket";
const OPENMAIL_API = "https://api.openmail.sh/";

/** An attachment or raw message, fetched with the API key. Only ever from OpenMail's own API, so the key goes nowhere else. */
export async function downloadOpenMail(url: string | null | undefined): Promise<Buffer | null> {
  const key = process.env.OPENMAIL_API_KEY;
  if (!key || !url?.startsWith(OPENMAIL_API)) return null;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * The trade tickets in an email: Word attachments read the same way as the Activity view's upload (OpenMail's own
 * extracted text if the download fails), else a ticket pasted into the body. Empty when the email has none.
 */
export async function readEmailTickets(msg: InboundEvent["message"]): Promise<TicketRead[]> {
  const reads: TicketRead[] = [];
  for (const a of docxAttachments(msg.attachments)) {
    if ((a.sizeBytes ?? 0) > MAX_TICKET_BYTES) {
      reads.push({ file: a.filename, ticket: null, errors: ["This file is too large to be a trade ticket."], warnings: [] });
      continue;
    }
    const bytes = await downloadOpenMail(a.url);
    if (bytes) reads.push(await readTicketDocx(a.filename, bytes));
    else if (a.parsedText) reads.push(parseTicket(a.parsedText, a.filename));
    else reads.push({ file: a.filename, ticket: null, errors: ["I couldn't download this attachment."], warnings: [] });
  }
  const attempts = reads.filter(isTicketAttempt);
  if (attempts.length) return markRepeats(attempts);
  const pasted = ticketTextInBody(msg.body_text);
  return pasted ? [parseTicket(pasted, "the ticket in your email")] : [];
}

export type EmailTicketResult = {
  eventId: string;
  messageId: string;
  from: string;
  status: "recorded" | "not recorded" | "refused" | "failed";
  reason?: string;
  tickets: { file: string; ticket: string | null; skip?: string; errors: string[]; warnings: string[] }[];
};

/**
 * Records the tickets an exec or admin emailed (or forwarded) to Hoot, then replies in the thread with what went
 * into the ledger, what was already there, and what couldn't be read. Anyone else gets a reply saying who can.
 */
export async function recordEmailedTickets(opts: {
  ev: InboundEvent;
  reads: TicketRead[];
  sender: { name: string; address: string; profileId: string | null; role: Role };
  reply: (text: string) => Promise<void>;
  /** Reads and checks the tickets and writes the reply, but records nothing. */
  dryRun?: boolean;
}): Promise<EmailTicketResult> {
  const { ev, sender, reply } = opts;
  const summarize = (reads: TicketRead[]) =>
    reads.map((r) => ({
      file: r.file,
      ticket: r.ticket ? `${r.ticket.date} ${r.ticket.side} ${r.ticket.shares} ${r.ticket.ticker} @ ${r.ticket.price}` : null,
      skip: r.skip ?? (r.priceGap !== undefined ? "held: price far from close" : undefined),
      errors: r.errors,
      warnings: r.warnings,
    }));
  const base = { eventId: ev.event_id, messageId: ev.message.id, from: sender.address, tickets: summarize(opts.reads) };

  if (sender.role !== "exec" && sender.role !== "admin") {
    await reply(ticketNotAllowedBody({ name: sender.name, reason: "role" }));
    return { ...base, status: "refused", reason: `role ${sender.role}` };
  }
  if (!sender.profileId) {
    await reply(ticketNotAllowedBody({ name: sender.name, reason: "not signed in" }));
    return { ...base, status: "refused", reason: "no profile yet" };
  }
  // The From address alone proves nothing; only a theowlfund.com DKIM signature lets an email write to the ledger.
  if (!opts.dryRun) {
    const raw = await downloadOpenMail(ev.message.raw_url);
    const check = raw ? await verifyFundSender(raw, ev.message.from) : ({ ok: false, reason: "the original message could not be downloaded" } as const);
    if (!check.ok) {
      await reply(ticketNotAllowedBody({ name: sender.name, reason: "unverified" }));
      return { ...base, status: "refused", reason: `unverified sender: ${check.reason}` };
    }
  }

  const [jobRow] = opts.dryRun ? [] : await db.insert(jobRuns).values({ job: JOB, summary: { ...base, status: "running" } }).returning({ id: jobRuns.id });
  const finish = async (r: EmailTicketResult) => {
    if (jobRow) await db.update(jobRuns).set({ finishedAt: new Date(), ok: r.status !== "failed", summary: r as unknown as Record<string, unknown> }).where(eq(jobRuns.id, jobRow.id));
    return r;
  };

  try {
    const checked = await checkPrices(await checkLedger(opts.reads));
    // The upload dialog shows a far-off price before anyone clicks Record; by email nobody would see it first.
    const held = checked.filter((r) => r.ticket && !r.skip && r.priceGap !== undefined);
    const reads = checked.filter((r) => !held.includes(r));
    const ready = recordable(reads);
    let recorded: TicketOutcome["recorded"] = null;
    if (ready.length) {
      if (opts.dryRun) recorded = { ok: true };
      else {
        const r = await recordTickets(ready, sender.profileId);
        recorded = r.ok ? { ok: true, warning: r.warning } : { ok: false, error: r.error };
      }
    }
    const appUrl = process.env.APP_URL?.replace(/\/$/, "");
    await reply(ticketReplyBody({ name: sender.name, outcome: { reads, recorded, held }, ledgerUrl: appUrl ? `${appUrl}/t/${FUND_SCOPE_SLUG}/activity` : undefined }));
    const status = recorded?.ok ? "recorded" : "not recorded";
    return finish({ ...base, tickets: summarize(checked), status, reason: recorded && !recorded.ok ? recorded.error : undefined });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await reply(
      [`Hi ${sender.name},`, "", `Something went wrong while I was recording your ticket (${reason.slice(0, 160)}). Send it again to retry. Tickets already in the ledger are skipped, so resending is safe.`, "", "Best,", "Hoot"].join("\n"),
    ).catch(() => {});
    return finish({ ...base, status: "failed", reason });
  }
}
