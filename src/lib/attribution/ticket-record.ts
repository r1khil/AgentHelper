import "server-only";
import { and, eq, isNull, max, or } from "drizzle-orm";
import { db } from "@/db/client";
import { dailyCloses, trades } from "@/db/schema";
import { beforeOpening, parseTicket, recordable, ticketsToCsv, UNREADABLE_DOCX, type TicketRead, type TradeTicket } from "./ticket";
import { importLedger, type ImportResult } from "./import";
import { fmtCurrency, fmtPct, fmtUsd } from "@/lib/format";

/** Trade tickets from the Ledger page's upload and from emails to Hoot share these checks and the import. */

// Server Actions accept 1MB bodies; a ticket is about 40KB.
export const MAX_TICKET_BYTES = 300_000;
/** A ticket price further than this from the session's close is probably not the fill. */
const PRICE_TOLERANCE = 0.05;

/** Reads one Word ticket's text with mammoth, the same way for an upload and an email attachment. */
export async function readTicketDocx(file: string, bytes: Buffer): Promise<TicketRead> {
  if (bytes.length > MAX_TICKET_BYTES) return { file, ticket: null, errors: ["This file is too large to be a trade ticket."], warnings: [] };
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return parseTicket(value, file);
  } catch {
    return { file, ticket: null, errors: [UNREADABLE_DOCX], warnings: [] };
  }
}

/** Warns when a ticket's price is far from that session's close, the sign of a planned price rather than the fill. */
export async function checkPrices(reads: TicketRead[]): Promise<TicketRead[]> {
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
    const pct = `${fmtPct(Math.abs(gap) * 100, 1)} ${gap > 0 ? "above" : "below"}`;
    return { ...r, priceGap: gap, warnings: [...r.warnings, `${fmtCurrency(r.ticket.price, "USD", { maxDigits: 4 })} is ${pct} that day's close of ${fmtUsd(close)}. Check it is the price the trade filled at.`] };
  });
}

/**
 * Skips tickets the ledger already has: the identical trade, the same date, ticker, side and shares typed in by hand
 * at a different (usually the fill) price, or a trade from before the opening holdings, which already count it.
 */
export async function checkLedger(reads: TicketRead[]): Promise<TicketRead[]> {
  const tickets = recordable(reads);
  if (!tickets.length) return reads;
  const [{ opening }] = await db.select({ opening: max(trades.tradeDate) }).from(trades).where(and(eq(trades.kind, "opening"), isNull(trades.voidedAt)));
  const rows = await db
    .select({ date: trades.tradeDate, ticker: trades.ticker, side: trades.side, shares: trades.shares, price: trades.price })
    .from(trades)
    .where(and(isNull(trades.voidedAt), or(...tickets.map((t) => and(eq(trades.ticker, t.ticker), eq(trades.tradeDate, t.date))))));
  return reads.map((r) => {
    const t = r.ticket;
    if (!t || r.skip) return r;
    const early = beforeOpening(t.date, opening);
    if (early) return { ...r, skip: early };
    const same = rows.filter((x) => x.side === t.side && Math.abs(Number(x.shares) - t.shares) < 1e-6);
    if (same.some((x) => Math.abs(Number(x.price) - t.price) < 1e-6)) return { ...r, skip: "Already in the ledger." };
    const near = same[0];
    if (!near) return r;
    return { ...r, skip: `Already in the ledger at $${Number(near.price)} instead of the ticket's $${t.price}. To use the ticket's price, void that trade and add the ticket again.` };
  });
}

/** Records readable, unskipped tickets through the ledger's CSV import, as `userId`. All or nothing, like the import. */
export async function recordTickets(tickets: TradeTicket[], userId: string): Promise<ImportResult> {
  if (!tickets.length) return { ok: false, error: "No readable tickets to record." };
  return importLedger(ticketsToCsv(tickets), false, userId);
}
