import "server-only";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { benchmarkSymbols, defaultSector, type GicsSector } from "@/lib/attribution/sectors";
import type { Snapshot } from "@/lib/backtesting/engine";
import type { CurrentUser } from "@/lib/auth";
import { getBarsRange, getSectorProfile } from "@/lib/providers/yahoo";
import { isFundWide } from "@/lib/roles";
import { buildReturnWindow, currentBenchmarkWeights, latestRiskFree } from "./inputs";
import { loadStoredPrices, putValue, windowStart } from "./load";
import { compareScenario, type ScenarioRisk } from "./compare";
import { RISK_FREE, type LookbackKey } from "./model";

export type { ScenarioMetrics, ScenarioRisk } from "./compare";

/**
 * The Risk page's model run on the Backtesting page's saved and modified weights, over the same
 * window of daily returns, so a what-if shows how the portfolio's risk would change as well as how
 * it would have performed. Percentages only: no position sizes in dollars.
 */
export async function scenarioRisk(user: CurrentUser, snapshot: Snapshot, weights: Record<string, number>, lookback: LookbackKey): Promise<ScenarioRisk> {
  const loaded = await loadAttributionSeries();
  if (!loaded.latest) throw new Error("Closing prices have not loaded yet, so risk cannot be measured.");
  const asOf = loaded.latest;
  const teamSectors = isFundWide(user) ? null : ((await loadTeamSectors()).get(user.teamId ?? "") ?? []);

  const holdings = snapshot.positions.filter((p) => p.kind !== "cash");
  const tickers = holdings.map((p) => p.ticker);
  const from = windowStart(asOf, lookback);
  const { prices, dividends } = await loadStoredPrices([...tickers, ...benchmarkSymbols(), RISK_FREE], from);

  // Companies added to the scenario usually have no stored closes: fetch them for this request only.
  const missing = tickers.filter((t) => !prices.get(t)?.size && (weights[holdings.find((h) => h.ticker === t)!.id] ?? 0) > 0);
  const notices: string[] = [];
  for (const t of missing) {
    try {
      const range = await getBarsRange(t, from, asOf);
      for (const b of range.bars) putValue(prices, t, b.date, b.close);
      for (const d of range.dividends) putValue(dividends, t, d.date, d.amount);
    } catch {
      notices.push(`Price history for ${t} could not be loaded, so it is modeled with its sector ETF or as riskless.`);
    }
  }

  const sectorOf = new Map<string, GicsSector | null>();
  for (const t of tickers) {
    const known = loaded.series.meta.get(t)?.sector;
    if (known) sectorOf.set(t, known);
    else {
      const profile = await getSectorProfile(t).catch(() => ({ sector: null }));
      sectorOf.set(t, defaultSector(t, profile.sector)?.sector ?? null);
    }
  }

  const window = buildReturnWindow(prices, dividends, tickers, asOf, lookback);
  return compareScenario({
    positions: snapshot.positions,
    weights,
    sectorOf,
    window,
    benchmarkWeights: currentBenchmarkWeights(loaded.series, teamSectors),
    riskFree: latestRiskFree(prices, asOf),
    scope: isFundWide(user) ? "fund" : "team",
    asOf,
    lookback,
    benchmarkLabel: teamSectors ? "the team's sectors" : "S&P 500 sectors",
    notices,
  });
}
