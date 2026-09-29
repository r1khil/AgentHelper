import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { cashFlows, profiles, trades } from "@/db/schema";
import type { LoadedSeries } from "@/lib/attribution/store";
import type { DividendIn, FlowIn, TradeIn } from "./activity";

/** Every trade and cash row the ledger has, voided ones included, with who recorded each. */
export async function loadLedgerRows(): Promise<{ trades: TradeIn[]; flows: FlowIn[] }> {
  const [t, f] = await Promise.all([
    db.select({ t: trades, by: profiles.fullName }).from(trades).leftJoin(profiles, eq(profiles.id, trades.createdBy)).orderBy(desc(trades.tradeDate), desc(trades.createdAt)),
    db.select({ f: cashFlows, by: profiles.fullName }).from(cashFlows).leftJoin(profiles, eq(profiles.id, cashFlows.createdBy)).orderBy(desc(cashFlows.flowDate), desc(cashFlows.createdAt)),
  ]);
  return {
    trades: t.map(({ t: x, by }) => ({ id: x.id, date: x.tradeDate, ticker: x.ticker, side: x.side, kind: x.kind, shares: Number(x.shares), price: Number(x.price), fees: Number(x.fees), note: x.note, voided: !!x.voidedAt, createdAt: x.createdAt.toISOString(), by })),
    flows: f.map(({ f: x, by }) => ({ id: x.id, date: x.flowDate, kind: x.kind, amount: Number(x.amount), note: x.note, voided: !!x.voidedAt, createdAt: x.createdAt.toISOString(), by })),
  };
}

/**
 * The dividends the ledger reinvested by itself: on each ex-date after the ledger opened, the shares held coming into
 * the day buy more at that day's close (the same rule as buildPortfolioDays). Read off the replayed series, so what is
 * listed is what the replay did.
 */
export function reinvestedDividends(loaded: LoadedSeries): DividendIn[] {
  const days = loaded.series.portfolio;
  const at = new Map(days.map((d, i) => [d.date, i]));
  const out: DividendIn[] = [];
  for (const [ticker, byDate] of loaded.inputs.dividends) {
    for (const [date, perShare] of byDate) {
      const i = at.get(date);
      if (i === undefined || i === 0) continue;
      const held = days[i - 1].positions.find((p) => p.ticker === ticker)?.sharesEnd ?? 0;
      const close = loaded.inputs.prices.get(ticker)?.get(date);
      if (held <= 0 || !close || close <= 0) continue;
      out.push({ date, ticker, shares: (held * perShare) / close, price: close });
    }
  }
  return out;
}
