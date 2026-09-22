"use server";

import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyCloses, trades } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { markRepeats, parseTicket, recordable, ticketsToCsv, type TicketRead } from "@/lib/attribution/ticket";
import { applyLedgerImport, previewLedgerImport, type ImportPreview } from "./ledger";
import type { ActionResult } from "./holdings";

// Server Actions accept 1MB bodies; a ticket is about 40KB.
const MAX_FILES = 15;
const MAX_FILE_BYTES = 300_000;
/** A ticket price further than this from the session's close is probably not the fill. */
const PRICE_TOLERANCE = 0.05;

export type TicketPreview =
  | { ok: false; error: string }
  | { ok: true; tickets: TicketRead[]; ledger: ImportPreview | null };

async function readTickets(fd: FormData): Promise<{ error: string } | { reads: TicketRead[] }> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose one or more trade tickets." };
  if (files.length > MAX_FILES) return { error: `Upload up to ${MAX_FILES} tickets at a time.` };
  const mammoth = await import("mammoth");
  const reads: TicketRead[] = [];
  for (const file of files) {
    if (!/\.docx$/i.test(file.name)) {
      reads.push({ file: file.name, ticket: null, errors: ["Only Word (.docx) tickets can be read."], warnings: [] });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      reads.push({ file: file.name, ticket: null, errors: ["This file is too large to be a trade ticket."], warnings: [] });
      continue;
    }
    try {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
      reads.push(parseTicket(value, file.name));
    } catch {
      reads.push({ file: file.name, ticket: null, errors: ["Could not open this Word file."], warnings: [] });
    }
  }
  return { reads: markRepeats(reads) };
}

/** Warns when a ticket's price is far from that session's close, the sign of a planned price rather than the fill. */
async function checkPrices(reads: TicketRead[]): Promise<TicketRead[]> {
  const tickets = recordable(reads);
  if (!tickets.length) return reads;
  const rows = await db
    .select({ ticker: dailyCloses.ticker, date: dailyCloses.sessionDate, close: dailyCloses.close })
    .from(dailyCloses)
    .where(or(...tickets.map((t) => and(eq(dailyCloses.ticker, t.ticker), eq(dailyCloses.sessionDate, t.date))))!);
  const closes = new Map(rows.map((r) => [`${r.ticker}|${r.date}`, Number(r.close)]));
  return reads.map((r) => {
    const close = r.ticket && closes.get(`${r.ticket.ticker}|${r.ticket.date}`);
    if (!r.ticket || r.skip || !close) return r;
    const gap = r.ticket.price / close - 1;
    if (Math.abs(gap) <= PRICE_TOLERANCE) return r;
    const pct = `${(Math.abs(gap) * 100).toFixed(1)}% ${gap > 0 ? "above" : "below"}`;
    return { ...r, warnings: [...r.warnings, `$${r.ticket.price} is ${pct} that day's close of $${close.toFixed(2)}. Check it is the price the trade filled at.`] };
  });
}

/**
 * Skips tickets the ledger already has: the identical trade, or the same date, ticker, side and shares typed in by hand
 * at a different (usually the fill) price, which would otherwise be recorded twice.
 */
async function checkLedger(reads: TicketRead[]): Promise<TicketRead[]> {
  const tickets = recordable(reads);
  if (!tickets.length) return reads;
  const rows = await db
    .select({ date: trades.tradeDate, ticker: trades.ticker, side: trades.side, shares: trades.shares, price: trades.price })
    .from(trades)
    .where(and(isNull(trades.voidedAt), or(...tickets.map((t) => and(eq(trades.ticker, t.ticker), eq(trades.tradeDate, t.date))))));
  return reads.map((r) => {
    const t = r.ticket;
    if (!t || r.skip) return r;
    const same = rows.filter((x) => x.side === t.side && Math.abs(Number(x.shares) - t.shares) < 1e-6);
    if (same.some((x) => Math.abs(Number(x.price) - t.price) < 1e-6)) return { ...r, skip: "Already in the ledger." };
    const near = same[0];
    if (!near) return r;
    return { ...r, skip: `Already in the ledger at $${Number(near.price)} instead of the ticket's $${t.price}. To use the ticket's price, void that trade and upload again.` };
  });
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
  await requireRole("exec", "admin");
  const read = await readTickets(fd);
  if ("error" in read) return { ok: false, error: read.error };
  const blocked = read.reads.find((r) => !r.ticket);
  if (blocked) return { ok: false, error: `${blocked.file}: ${blocked.errors[0]} Remove it or fix the ticket first.` };
  const ready = recordable(await checkLedger(read.reads));
  if (!ready.length) return { ok: false, error: "No readable tickets to record." };
  const r = await applyLedgerImport(ticketsToCsv(ready), false);
  if (!r.ok) return r;
  return { ok: true, message: r.message?.replace(/^Imported (\d+) trades and 0 cash entries\./, (_m, n) => `Recorded ${n} trade${n === "1" ? "" : "s"} from tickets.`) };
}
