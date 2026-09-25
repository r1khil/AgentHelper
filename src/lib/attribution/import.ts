import "server-only";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { cashFlows, dailyCloses, trades } from "@/db/schema";
import { parseLedgerCsv, splitDuplicates } from "./csv";
import { validateLedger } from "./ledger";
import { benchmarkSymbols } from "./sectors";
import { ensureSecurity, historyFrom, loadLedger, loadSeries } from "./store";
import type { CashFlow, Trade } from "./types";
import { runPricesJob } from "@/lib/jobs/prices";
import { syncPrices } from "@/lib/prices";
import { isTradingDay, todayNY } from "@/lib/providers/calendar";

/**
 * The ledger's write path shared by the Ledger page's server actions and Hoot's emailed trade tickets.
 * Nothing here checks who is asking: callers check the role first and pass the profile that records.
 */

export const MAX_IMPORT_BYTES = 900_000;

export function refreshLedgerPages() {
  revalidatePath("/attribution", "layout");
  revalidatePath("/t/[team]/attribution", "page");
  revalidatePath("/t/[team]", "page");
}

/** Replay the ledger as it would be after an edit; returns the first problem, or a cash warning. */
export async function checkLedgerEdit(next: { trades: Trade[]; cashFlows: CashFlow[] }): Promise<{ error?: string; warning?: string }> {
  const issue = validateLedger(next.trades, next.cashFlows, { today: todayNY(), isTradingDay }).find((i) => i.level === "error");
  if (issue) return { error: issue.message };
  const replay = await loadSeries(db, next);
  const over = replay.quality.ledger.oversold[0];
  if (over) return { error: `That would sell ${over.shares.toFixed(4)} more ${over.ticker} shares than the Fund held on ${over.date}.` };
  const cash = replay.series.portfolio.at(-1)?.cashEnd ?? 0;
  return cash < -0.005 ? { warning: `Cash is ${cash.toLocaleString("en-US", { style: "currency", currency: "USD" })} after this. Record the deposit or sale that funded it.` } : {};
}

async function currentOpening() {
  const openingTrades = await db.select().from(trades).where(and(eq(trades.kind, "opening"), isNull(trades.voidedAt)));
  const dates = new Set(openingTrades.map((t) => t.tradeDate));
  const flows = (await db.select().from(cashFlows).where(and(eq(cashFlows.kind, "deposit"), isNull(cashFlows.voidedAt)))).filter(
    (f) => f.note === "Opening balance" && dates.has(f.flowDate),
  );
  return { openingTrades, openingFlows: flows };
}

export async function planImport(text: string, replaceOpening: boolean) {
  const parsed = parseLedgerCsv(text, { today: todayNY(), isTradingDay });
  const [all, opening] = await Promise.all([db.select().from(trades).where(isNull(trades.voidedAt)), currentOpening()]);
  const allFlows = await db.select().from(cashFlows).where(isNull(cashFlows.voidedAt));
  const dropTrades = new Set(replaceOpening ? opening.openingTrades.map((t) => t.id) : []);
  const dropFlows = new Set(replaceOpening ? opening.openingFlows.map((f) => f.id) : []);
  const keptTrades: Trade[] = all
    .filter((t) => !dropTrades.has(t.id))
    .map((t) => ({ date: t.tradeDate, ticker: t.ticker, side: t.side, shares: Number(t.shares), price: Number(t.price), fees: Number(t.fees) }));
  const keptFlows: CashFlow[] = allFlows.filter((f) => !dropFlows.has(f.id)).map((f) => ({ date: f.flowDate, kind: f.kind, amount: Number(f.amount) }));
  const fresh = splitDuplicates(parsed, { trades: keptTrades, cashFlows: keptFlows });
  return { parsed, fresh, keptTrades, keptFlows, opening };
}

export type ImportResult =
  | { ok: false; error: string }
  | { ok: true; trades: number; cashFlows: number; duplicates: number; warning?: string };

/** Records a ledger CSV as `userId`, all or nothing: any bad row, unknown ticker or oversell records none of it. */
export async function importLedger(text: string, replaceOpening: boolean, userId: string): Promise<ImportResult> {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "That file is too large." };
  const { parsed, fresh, keptTrades, keptFlows, opening } = await planImport(text, replaceOpening);
  if (parsed.errors.length) return { ok: false, error: `Fix ${parsed.errors.length} row${parsed.errors.length === 1 ? "" : "s"} first. Line ${parsed.errors[0].line}: ${parsed.errors[0].message}` };
  if (!fresh.trades.length && !fresh.cashFlows.length) return { ok: false, error: "Nothing new to import. Every row is already in the ledger." };

  const tickers = [...new Set(fresh.trades.map((t) => t.ticker))];
  const unknown: string[] = [];
  for (const t of tickers) if (!(await ensureSecurity(db, t))) unknown.push(t);
  if (unknown.length) return { ok: false, error: `Could not find ${unknown.join(", ")} on the market data provider.` };

  // Prices first: opening rows without a price use that day's close, and the oversell check needs reinvested dividends.
  const ledger = await loadLedger(db);
  const earliest = [...fresh.trades.map((t) => t.date), ...fresh.cashFlows.map((f) => f.date), ...(ledger.inception ? [ledger.inception] : [])].sort()[0];
  const synced = await syncPrices(db, { symbols: [...new Set([...tickers, ...benchmarkSymbols()])], from: historyFrom(earliest), budgetMs: 200_000 });
  if (synced.remaining.length) return { ok: false, error: "Loading price history took too long. Nothing was imported; try again to continue where it stopped." };

  const needing = fresh.trades.filter((t) => t.needsPrice);
  if (needing.length) {
    const closes = await db
      .select({ ticker: dailyCloses.ticker, date: dailyCloses.sessionDate, close: dailyCloses.close })
      .from(dailyCloses)
      .where(inArray(dailyCloses.ticker, [...new Set(needing.map((t) => t.ticker))]));
    const byKey = new Map(closes.map((c) => [`${c.ticker}|${c.date}`, Number(c.close)]));
    const missing: string[] = [];
    for (const t of needing) {
      const close = byKey.get(`${t.ticker}|${t.date}`);
      if (close) t.price = close;
      else missing.push(`${t.ticker} on ${t.date} (line ${t.line})`);
    }
    if (missing.length) return { ok: false, error: `No closing price for ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}. Add a price to those rows.` };
  }

  const verdict = await checkLedgerEdit({ trades: [...keptTrades, ...fresh.trades], cashFlows: [...keptFlows, ...fresh.cashFlows] });
  if (verdict.error) return { ok: false, error: verdict.error };

  await db.transaction(async (tx) => {
    if (replaceOpening) {
      const now = new Date();
      if (opening.openingTrades.length) await tx.update(trades).set({ voidedAt: now, voidedBy: userId }).where(inArray(trades.id, opening.openingTrades.map((t) => t.id)));
      if (opening.openingFlows.length) await tx.update(cashFlows).set({ voidedAt: now, voidedBy: userId }).where(inArray(cashFlows.id, opening.openingFlows.map((f) => f.id)));
    }
    for (let i = 0; i < fresh.trades.length; i += 500) {
      await tx.insert(trades).values(
        fresh.trades.slice(i, i + 500).map((t) => ({
          tradeDate: t.date, ticker: t.ticker, side: t.side, kind: t.kind, shares: t.shares.toString(), price: t.price.toString(),
          fees: t.fees.toFixed(2), note: t.note, createdBy: userId,
        })),
      );
    }
    for (let i = 0; i < fresh.cashFlows.length; i += 500) {
      await tx.insert(cashFlows).values(fresh.cashFlows.slice(i, i + 500).map((f) => ({ flowDate: f.date, kind: f.kind, amount: f.amount.toFixed(2), note: f.note, createdBy: userId })));
    }
  });
  after(() => runPricesJob());
  refreshLedgerPages();
  return { ok: true, trades: fresh.trades.length, cashFlows: fresh.cashFlows.length, duplicates: fresh.duplicateLines.length, warning: verdict.warning };
}
