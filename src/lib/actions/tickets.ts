"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { rejectHeldTicket } from "@/lib/attribution/held-tickets";
import { markRepeats, MAX_PASTED_TICKETS, recordable, ticketsToCsv, type TicketRead } from "@/lib/attribution/ticket";
import { checkLedger, checkPastedTickets, checkPrices, MAX_TICKET_BYTES, readTicketDocx, recordTickets } from "@/lib/attribution/ticket-record";
import { pastedTicketsSummary } from "@/lib/attribution/pasted-tickets";
import { previewLedgerImport, type ImportPreview } from "./ledger";
import type { ActionResult } from "./holdings";

const MAX_FILES = 15;

export type TicketPreview =
  | { ok: false; error: string }
  | { ok: true; tickets: TicketRead[]; ledger: ImportPreview | null };

async function readTickets(fd: FormData): Promise<{ error: string } | { reads: TicketRead[] }> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose one or more trade tickets." };
  if (files.length > MAX_FILES) return { error: `Upload up to ${MAX_FILES} tickets at a time.` };
  const reads: TicketRead[] = [];
  for (const file of files) {
    if (!/\.docx$/i.test(file.name)) {
      reads.push({ file: file.name, ticket: null, errors: ["Only Word (.docx) tickets can be read."], warnings: [] });
      continue;
    }
    if (file.size > MAX_TICKET_BYTES) {
      reads.push({ file: file.name, ticket: null, errors: ["This file is too large to be a trade ticket."], warnings: [] });
      continue;
    }
    reads.push(await readTicketDocx(file.name, Buffer.from(await file.arrayBuffer())));
  }
  return { reads: markRepeats(reads) };
}

/** The CSV import reports problems by line; line N is the (N-1)th recorded ticket. Name the file instead. */
function nameLines(preview: ImportPreview, tickets: TicketRead[]): ImportPreview {
  if (!preview.ok) return preview;
  const files = tickets.filter((r) => r.ticket && !r.skip).map((r) => r.file);
  return {
    ...preview,
    errors: preview.errors.map((e) => (e.line >= 2 && files[e.line - 2] ? { line: 0, message: `${files[e.line - 2]}: ${e.message}` } : e)),
  };
}

export async function previewTradeTickets(fd: FormData): Promise<TicketPreview> {
  await requireRole("exec", "admin");
  const read = await readTickets(fd);
  if ("error" in read) return { ok: false, error: read.error };
  const tickets = await checkPrices(await checkLedger(read.reads));
  const ready = recordable(tickets);
  const ledger = ready.length ? nameLines(await previewLedgerImport(ticketsToCsv(ready), false), tickets) : null;
  return { ok: true, tickets, ledger };
}

/** Re-reads the uploaded files rather than trusting the preview, then records them through the CSV import path. */
export async function applyTradeTickets(fd: FormData): Promise<ActionResult> {
  const user = await requireRole("exec", "admin");
  const read = await readTickets(fd);
  if ("error" in read) return { ok: false, error: read.error };
  const blocked = read.reads.find((r) => !r.ticket);
  if (blocked) return { ok: false, error: `${blocked.file}: ${blocked.errors[0]} Remove it or fix the ticket first.` };
  const r = await recordTickets(recordable(await checkLedger(read.reads)), user.id);
  if (!r.ok) return r;
  const n = r.trades;
  return { ok: true, message: `Recorded ${n} trade${n === 1 ? "" : "s"} from tickets.${r.warning ? ` ${r.warning}` : ""}` };
}

/**
 * Records trade tickets an exec or admin pasted into a Hoot chat, once they click Confirm on Hoot's card. Re-reads
 * and re-checks the text rather than trusting the card: trades the ledger already has are skipped, and a price more
 * than 5% from that day's close is held for the Ledger page, as for an emailed ticket.
 */
export async function recordPastedTradeTickets(texts: string[]): Promise<ActionResult> {
  const user = await requireRole("exec", "admin");
  if (!Array.isArray(texts) || !texts.length || texts.length > MAX_PASTED_TICKETS || texts.some((t) => typeof t !== "string" || t.length > 5000)) {
    return { ok: false, error: "Those tickets can't be read." };
  }
  const check = await checkPastedTickets(texts);
  if (!check.ready.length) return { ok: false, error: `Nothing to record. ${pastedTicketsSummary(check, 0)}`.trim() };
  const r = await recordTickets(check.ready, user.id);
  if (!r.ok) return r;
  return { ok: true, message: `${pastedTicketsSummary(check, r.trades)}${r.warning ? ` ${r.warning}` : ""}` };
}

/** Takes a ticket Hoot held back off the review list. It is not recorded; the emailed ticket stays in the log. */
export async function rejectTicket(id: string): Promise<ActionResult> {
  const user = await requireRole("exec", "admin");
  if (!/^[0-9a-f-]{36}:\d{1,3}$/.test(id)) return { ok: false, error: "That ticket is not on the list." };
  await rejectHeldTicket(id, user.id);
  revalidatePath("/attribution/ledger");
  return { ok: true, message: "Rejected. It is not in the ledger." };
}
