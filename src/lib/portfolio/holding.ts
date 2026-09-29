import "server-only";
import { and, count, eq, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { securities, sellSideCalls, trades } from "@/db/schema";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { loadLiveLedger } from "./overview";

/** The fund's stake in one holding, priced live: for the holding page's "Fund position". */
export type FundPosition = {
  shares: number;
  value: number;
  /** Percent of the fund. */
  weight: number;
  averageCost: number;
  /** Dollars today, and since the ledger opened. */
  dayGain: number;
  totalGain: number;
  /** Percent of what the position cost since the ledger opened. */
  totalReturn: number | null;
  /** Basis points of the fund's return today. */
  contributionBp: number | null;
  /** The session the figures are for, and where its prices came from. */
  session: string;
  inception: string;
};

/** Null when the fund does not hold it (exited, or never in the ledger). */
export async function loadFundPosition(ticker: string): Promise<FundPosition | null> {
  const live = await loadLiveLedger();
  const p = live?.positions.find((x) => x.ticker === ticker.toUpperCase());
  if (!live || !p) return null;
  return {
    shares: p.shares,
    value: p.value,
    weight: p.weight,
    averageCost: p.shares > 0 ? p.cost / p.shares : 0,
    dayGain: p.dayPnl,
    totalGain: p.gain,
    totalReturn: p.cost > 0 ? (p.gain / p.cost) * 100 : null,
    contributionBp: live.dayBase > 0 ? (p.dayPnl / live.dayBase) * 10_000 : null,
    session: live.session,
    inception: live.inception,
  };
}

export type TradeMark = { date: string; side: "buy" | "sell"; shares: number; price: number };

/** The fund's recorded trades in one ticker, oldest first. The opening snapshot is not a trade and is left out. */
export async function listTradeMarks(ticker: string): Promise<TradeMark[]> {
  const rows = await db
    .select({ date: trades.tradeDate, side: trades.side, shares: trades.shares, price: trades.price })
    .from(trades)
    .where(and(eq(trades.ticker, ticker.toUpperCase()), eq(trades.kind, "trade"), isNull(trades.voidedAt)))
    .orderBy(trades.tradeDate, trades.createdAt);
  return rows.map((r) => ({ date: r.date, side: r.side, shares: Number(r.shares), price: Number(r.price) }));
}

/** What the securities table knows about the company's line of business, for the name block's second line. */
export async function loadSecurityLine(ticker: string): Promise<string | null> {
  const [s] = await db.select({ industry: securities.industry, sector: securities.sector }).from(securities).where(eq(securities.ticker, ticker.toUpperCase())).limit(1);
  return s?.industry ?? (s?.sector ? SECTOR_LABELS[s.sector] : null);
}

/** Sell-side calls the team recorded on this ticker: how many, and when the newest was updated. */
export async function sellSideSummary(teamId: string, ticker: string): Promise<{ count: number; latest: Date | null }> {
  const [row] = await db
    .select({ n: count(), latest: max(sellSideCalls.updatedAt) })
    .from(sellSideCalls)
    .where(and(eq(sellSideCalls.teamId, teamId), eq(sellSideCalls.ticker, ticker.toUpperCase())));
  return { count: Number(row?.n ?? 0), latest: row?.latest ?? null };
}
