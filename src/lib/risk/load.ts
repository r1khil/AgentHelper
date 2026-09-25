import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { cache } from "react";
import { db } from "@/db/client";
import { dailyCloses, securityEvents } from "@/db/schema";
import { latestPositions } from "@/lib/attribution/ledger";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { benchmarkSymbols } from "@/lib/attribution/sectors";
import type { DateSeries } from "@/lib/attribution/types";
import { assembleRiskInput } from "./inputs";
import { buildRiskReport, LOOKBACKS, RISK_FREE, type LookbackKey, type RiskReport } from "./model";

function put(series: DateSeries, ticker: string, date: string, value: number) {
  let m = series.get(ticker);
  if (!m) series.set(ticker, (m = new Map()));
  m.set(date, value);
}

export type LoadedRisk =
  | { state: "no-ledger" }
  | { state: "no-prices" }
  | { state: "ok"; report: RiskReport; inception: string; weightSetAsOf: string | null };

/**
 * Per request: the risk report for the whole Fund (teamId null) or one team's holdings. Reads only
 * stored rows; the nightly price job keeps two years of closes for everything the ledger has traded.
 */
export const loadRisk = cache(async (lookback: LookbackKey, teamId: string | null): Promise<LoadedRisk> => {
  const started = Date.now();
  const loaded = await loadAttributionSeries();
  if (!loaded.inception) return { state: "no-ledger" };
  if (!loaded.latest) return { state: "no-prices" };

  const held = latestPositions(loaded.series.portfolio).map((p) => p.ticker);
  const symbols = [...new Set([...held, ...benchmarkSymbols(), RISK_FREE])];
  const from = DateTime.fromISO(loaded.latest).minus({ days: Math.ceil((LOOKBACKS[lookback].days / 252) * 366) + 20 }).toISODate()!;
  const earliest = loaded.inception < from ? loaded.inception : from;
  const [closeRows, divRows, sectorMap] = await Promise.all([
    db
      .select({ ticker: dailyCloses.ticker, date: dailyCloses.sessionDate, close: dailyCloses.close })
      .from(dailyCloses)
      .where(and(inArray(dailyCloses.ticker, symbols), gte(dailyCloses.sessionDate, earliest))),
    db
      .select({ ticker: securityEvents.ticker, date: securityEvents.exDate, amount: securityEvents.amount })
      .from(securityEvents)
      .where(and(inArray(securityEvents.ticker, symbols), eq(securityEvents.kind, "dividend"), gte(securityEvents.exDate, earliest))),
    teamId ? loadTeamSectors() : Promise.resolve(null),
  ]);
  const prices: DateSeries = new Map();
  for (const r of closeRows) put(prices, r.ticker, r.date, Number(r.close));
  const dividends: DateSeries = new Map();
  for (const r of divRows) if (r.amount) put(dividends, r.ticker, r.date, Number(r.amount));

  const input = assembleRiskInput({
    series: loaded.series,
    prices,
    dividends,
    lookback,
    scope: teamId ? { kind: "team", teamId, sectors: sectorMap?.get(teamId) ?? [] } : { kind: "fund" },
  });
  if (!input) return { state: "no-prices" };
  const report = buildRiskReport(input);
  console.log(`[risk] ${teamId ? "team" : "fund"} ${lookback} ${report.holdings.length} holdings × ${report.window.days}d in ${Date.now() - started}ms`);
  return { state: "ok", report, inception: loaded.inception, weightSetAsOf: loaded.series.benchmark.at(-1)?.weightSetAsOf ?? null };
});
