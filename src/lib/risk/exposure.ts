import { ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { sum } from "./math";
import type { RiskReport, SectorRisk } from "./model";

/**
 * The Exposure page's numbers, read straight off the Risk page's report (same loader, same weights), so the two
 * pages always agree. Pure: every figure here is a sum or difference of values already in the report.
 */

export const TOP_N = 10;

export type SectorBet = SectorRisk & { etf: string | null };

export type Exposure = {
  scope: RiskReport["scope"];
  asOf: string;
  hasBenchmark: boolean;
  /** The non-cash sector with the largest absolute active weight. By sector only: the benchmark is sector ETFs. */
  largestBet: SectorBet | null;
  /** The TOP_N largest positions by weight, and their total. */
  top: { weight: number; holdings: { ticker: string; name: string; weight: number }[] };
  holdingsCount: number;
  hhi: number;
  effectiveN: number;
  invested: number;
  cash: { value: number; weight: number };
  /** Sectors from the largest overweight to the largest underweight; cash (a Fund-level choice) last. */
  sectors: SectorBet[];
  /**
   * Sum of positive and of negative active weights, cash included. They cancel (both sides of the book add to 100%),
   * which is a built-in check; either one is the share of the portfolio positioned differently from the benchmark at
   * sector level.
   */
  overweight: number | null;
  underweight: number | null;
};

const etfOf = (s: SectorRisk) => (s.key === "cash" || s.key === "unclassified" ? null : ETF_BY_SECTOR[s.key]);

export function buildExposure(r: RiskReport): Exposure {
  const hasBenchmark = r.sectors.some((s) => s.active !== null);
  const bets = r.sectors.map((s) => ({ ...s, etf: etfOf(s) }));
  const nonCash = bets.filter((s) => s.key !== "cash");
  const cash = bets.filter((s) => s.key === "cash");
  const sectors = [
    ...[...nonCash].sort((a, b) => (hasBenchmark ? (b.active ?? 0) - (a.active ?? 0) : b.weight - a.weight) || b.weight - a.weight),
    ...cash,
  ];
  const largestBet = hasBenchmark
    ? nonCash.reduce<SectorBet | null>((best, s) => (s.active !== null && (!best || Math.abs(s.active) > Math.abs(best.active ?? 0)) ? s : best), null)
    : null;
  const byWeight = [...r.holdings].sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker)).slice(0, TOP_N);
  const actives = bets.map((s) => s.active).filter((a): a is number => a !== null);
  return {
    scope: r.scope,
    asOf: r.asOf,
    hasBenchmark,
    largestBet,
    top: { weight: sum(byWeight.map((h) => h.weight)), holdings: byWeight.map((h) => ({ ticker: h.ticker, name: h.name, weight: h.weight })) },
    holdingsCount: r.holdings.length,
    hhi: r.portfolio.hhi,
    effectiveN: r.portfolio.effectiveN,
    invested: r.portfolio.invested,
    cash: r.cash,
    sectors,
    overweight: hasBenchmark ? sum(actives.filter((a) => a > 0)) : null,
    underweight: hasBenchmark ? sum(actives.filter((a) => a < 0)) : null,
  };
}
