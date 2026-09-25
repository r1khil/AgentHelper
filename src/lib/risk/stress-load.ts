import "server-only";
import { and, eq, gte, inArray, lte, min, or } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { dailyCloses, securityEvents } from "@/db/schema";
import { ETF_BY_SECTOR, GICS_SECTORS } from "@/lib/attribution/sectors";
import type { DateSeries } from "@/lib/attribution/types";
import { putValue } from "./load";
import { MARKET, type RiskReport } from "./model";
import { runStressTests, stressInputFromReport, STRESS_WINDOWS, stressDateRanges, type StressResult } from "./stress";

/** Stored closes and dividends for `symbols`, only on the stress windows' dates, plus each symbol's first stored close. */
async function loadWindowPrices(symbols: string[]) {
  const list = [...new Set(symbols)];
  const ranges = stressDateRanges(STRESS_WINDOWS);
  const [closeRows, divRows, firstRows] = await Promise.all([
    db
      .select({ ticker: dailyCloses.ticker, date: dailyCloses.sessionDate, close: dailyCloses.close })
      .from(dailyCloses)
      .where(and(inArray(dailyCloses.ticker, list), or(...ranges.map((r) => and(gte(dailyCloses.sessionDate, r.from), lte(dailyCloses.sessionDate, r.to)))))),
    db
      .select({ ticker: securityEvents.ticker, date: securityEvents.exDate, amount: securityEvents.amount })
      .from(securityEvents)
      .where(and(inArray(securityEvents.ticker, list), eq(securityEvents.kind, "dividend"), or(...ranges.map((r) => and(gte(securityEvents.exDate, r.from), lte(securityEvents.exDate, r.to)))))),
    db.select({ ticker: dailyCloses.ticker, first: min(dailyCloses.sessionDate) }).from(dailyCloses).where(inArray(dailyCloses.ticker, list)).groupBy(dailyCloses.ticker),
  ]);
  const prices: DateSeries = new Map();
  for (const r of closeRows) putValue(prices, r.ticker, r.date, Number(r.close));
  const dividends: DateSeries = new Map();
  for (const r of divRows) if (r.amount) putValue(dividends, r.ticker, r.date, Number(r.amount));
  const firstClose = new Map(firstRows.filter((r) => r.first).map((r) => [r.ticker, r.first!]));
  return { prices, dividends, firstClose };
}

/**
 * Per request: each stress window for the Risk report's positions (Fund or team). The positions
 * don't depend on the lookback, so any report for the scope gives the same results.
 */
export const loadStressTests = cache(async (report: RiskReport): Promise<StressResult[]> => {
  const started = Date.now();
  const data = await loadWindowPrices([...report.holdings.map((h) => h.ticker), ...GICS_SECTORS.map((s) => ETF_BY_SECTOR[s]), MARKET]);
  const results = runStressTests(stressInputFromReport(report, data));
  console.log(`[risk] stress ${report.scope} ${report.holdings.length} holdings × ${results.length} windows in ${Date.now() - started}ms`);
  return results;
});
