import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { loadCloses, loadEvents } from "@/lib/market-data";
import { ETF_BY_SECTOR, GICS_SECTORS } from "@/lib/attribution/sectors";
import type { DateSeries } from "@/lib/attribution/types";
import { putValue } from "./load";
import { MARKET, type RiskReport } from "./model";
import { runStressTests, stressInputFromReport, STRESS_WINDOWS, stressDateRanges, type StressResult } from "./stress";

/** Stored closes and dividends for `symbols`, only on the stress windows' dates, plus each symbol's first stored close. */
async function loadWindowPrices(symbols: string[]) {
  const list = [...new Set(symbols)];
  const ranges = stressDateRanges(STRESS_WINDOWS);
  const inWindow = (d: string) => ranges.some((r) => d >= r.from && d <= r.to);
  const [allCloses, eventRows] = await Promise.all([loadCloses(db, list), loadEvents(db, list)]);
  const closeRows = allCloses.filter((r) => inWindow(r.date));
  const divRows = eventRows.filter((e) => e.kind === "dividend" && inWindow(e.date));
  const first = new Map<string, string>();
  for (const r of allCloses) if (!first.has(r.ticker) || r.date < first.get(r.ticker)!) first.set(r.ticker, r.date);
  const prices: DateSeries = new Map();
  for (const r of closeRows) putValue(prices, r.ticker, r.date, Number(r.close));
  const dividends: DateSeries = new Map();
  for (const r of divRows) if (r.amount) putValue(dividends, r.ticker, r.date, Number(r.amount));
  return { prices, dividends, firstClose: first };
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
