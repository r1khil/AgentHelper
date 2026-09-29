import "server-only";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { jobRuns, securities, teams, trades } from "@/db/schema";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * Tickets Hoot held back when an exec emailed them (the price was more than 5% from that day's close). Nothing stores
 * them as a queue: the email job's log (job_runs, job "email_ticket") has each one's trade and why it was held, so the
 * list is that log's held tickets from the last two weeks, minus any whose trade has since reached the ledger.
 */
export type HeldTicket = {
  /** The job run and the ticket's place in it: a stable key. */
  id: string;
  date: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  ticker: string;
  /** The company's name and the team it belongs to, when the ledger already knows the security. */
  name: string | null;
  team: string | null;
  /** The file name or "the ticket in your email" the ticket was read from. */
  file: string;
  /** Who sent it (the email address on the message). */
  from: string;
  /** When Hoot got it. */
  receivedAt: string;
  /** Why it was held, in Hoot's words. */
  why: string;
};

const WINDOW_DAYS = 14;
/** The ids someone rejected. A rejected ticket stays in the email log, so this is what keeps it off the list. */
const REJECTED_KEY = "held_tickets_rejected";
const LINE = /^(\d{4}-\d{2}-\d{2}) (buy|sell) ([\d.]+) (\S+) @ ([\d.]+)$/;

type LoggedTicket = { file?: string; ticket?: string | null; skip?: string; warnings?: string[] };

export function parseLoggedTicket(t: LoggedTicket) {
  const m = t.ticket ? LINE.exec(t.ticket) : null;
  if (!m || !t.skip?.startsWith("held")) return null;
  return { date: m[1], side: m[2] as "buy" | "sell", shares: Number(m[3]), ticker: m[4], price: Number(m[5]), file: t.file ?? "the ticket", why: t.warnings?.at(-1) ?? "The price is far from that day's close." };
}

async function rejectedIds(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await getSetting(REJECTED_KEY, { fresh: true })) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Takes a held ticket off the list without recording it. */
export async function rejectHeldTicket(id: string, userId: string) {
  const ids = await rejectedIds();
  ids.add(id);
  // Old ids age out with their runs; keep the list short.
  await setSetting(REJECTED_KEY, JSON.stringify([...ids].slice(-200)), userId);
}

export async function loadHeldTickets(): Promise<HeldTicket[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const runs = await db
    .select({ id: jobRuns.id, startedAt: jobRuns.startedAt, summary: jobRuns.summary })
    .from(jobRuns)
    .where(and(eq(jobRuns.job, "email_ticket"), gte(jobRuns.startedAt, since)))
    .orderBy(desc(jobRuns.startedAt));
  const found = runs.flatMap((r) => {
    const s = r.summary as { from?: string; tickets?: LoggedTicket[] };
    return (s.tickets ?? []).flatMap((t, i) => {
      const p = parseLoggedTicket(t);
      return p ? [{ id: `${r.id}:${i}`, ...p, from: s.from ?? "an exec", receivedAt: r.startedAt.toISOString() }] : [];
    });
  });
  if (!found.length) return [];

  const [ledger, sec, rejected] = await Promise.all([
    db.select({ date: trades.tradeDate, ticker: trades.ticker, side: trades.side, shares: trades.shares }).from(trades).where(isNull(trades.voidedAt)),
    db.select({ ticker: securities.ticker, name: securities.name, team: teams.name }).from(securities).leftJoin(teams, eq(teams.id, securities.teamId)),
    rejectedIds(),
  ]);
  const known = new Map(sec.map((s) => [s.ticker, s]));
  const recorded = (t: { date: string; ticker: string; side: string; shares: number }) =>
    ledger.some((x) => x.date === t.date && x.ticker === t.ticker && x.side === t.side && Math.abs(Number(x.shares) - t.shares) < 1e-6);
  const seen = new Set<string>();
  return found
    .filter((t) => {
      // The same ticket emailed twice is one item.
      const key = `${t.date}|${t.ticker}|${t.side}|${t.shares}`;
      if (recorded(t) || seen.has(key) || rejected.has(t.id)) return false;
      seen.add(key);
      return true;
    })
    .map((t) => ({ ...t, name: known.get(t.ticker)?.name ?? null, team: known.get(t.ticker)?.team ?? null }));
}
