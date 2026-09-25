import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { TRADING_DAYS, sum, volAfterBump } from "./math";
import type { HoldingRisk, RiskReport } from "./model";

/**
 * Where the active risk comes from: each holding's share of tracking-error variance, the benchmark side (the sector
 * ETFs held short in the calculation), and marginal tracking error. Pure; every value is read from the risk report,
 * so it matches the Risk page's tracking error exactly.
 */

export type ActiveRiskRow = Pick<HoldingRisk, "ticker" | "name" | "teamId" | "sector" | "weight" | "source" | "proxy"> & {
  share: number;
  teContribution: number;
  marginalTe: number;
};

export type BenchmarkLeg = RiskReport["benchmarkLegs"][number] & { label: string; sectorActive: number | null };

export type ActiveRisk = {
  trackingError: number;
  dailyTe: number;
  /** Holdings from the largest share of active risk to the smallest (negative shares, which reduce it, last). */
  holdings: ActiveRiskRow[];
  holdingsShare: number;
  benchmark: { weight: number; share: number; teContribution: number; legs: BenchmarkLeg[] };
  /** Holdings plus benchmark side: 100% by construction. */
  total: number;
  /** Plain sentences for the largest gaps between weight and active risk, and the sizing numbers. */
  sentences: string[];
};

const p1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const pp = (x: number, d = 1) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(d)} pp`;
/** marginalTe is TE (a fraction) per unit of weight, so it is also "pp of TE per pp of weight". */
const ppPerPp = (m: number) => `${Math.abs(m).toFixed(2)} pp`;

export function activeRiskBreakdown(r: RiskReport, opts: { bookLabel?: string } = {}): ActiveRisk | null {
  const te = r.portfolio.trackingError;
  const dailyTe = r.portfolio.dailyTe;
  if (te === null || dailyTe === null) return null;
  const book = opts.bookLabel ?? (r.scope === "fund" ? "the book" : "the team's holdings");

  const holdings: ActiveRiskRow[] = r.holdings
    .map((h) => ({ ticker: h.ticker, name: h.name, teamId: h.teamId, sector: h.sector, weight: h.weight, source: h.source, proxy: h.proxy, share: h.activeRiskShare ?? 0, teContribution: h.teContribution ?? 0, marginalTe: h.marginalTe ?? 0 }))
    .sort((a, b) => b.share - a.share || b.weight - a.weight);
  const sectorActive = new Map(r.sectors.map((s) => [s.key, s.active]));
  const legs: BenchmarkLeg[] = r.benchmarkLegs
    .map((l) => ({ ...l, label: SECTOR_LABELS[l.sector], sectorActive: sectorActive.get(l.sector) ?? null }))
    .sort((a, b) => b.activeRiskShare - a.activeRiskShare);
  const holdingsShare = sum(holdings.map((h) => h.share));
  const benchmark = {
    weight: sum(legs.map((l) => l.weight)),
    share: sum(legs.map((l) => l.activeRiskShare)),
    teContribution: sum(legs.map((l) => l.teContribution)),
    legs,
  };

  const sentences: string[] = [];
  // Holdings whose share of active risk is well above their share of value.
  const gaps = holdings.filter((h) => h.share - h.weight >= 0.02 && h.share >= 1.5 * h.weight).sort((a, b) => b.share - b.weight - (a.share - a.weight)).slice(0, 3);
  for (const h of gaps) sentences.push(`${h.ticker} is ${p1(h.weight)} of ${book} but ${p1(h.share)} of active risk.`);
  if (!gaps.length && holdings[0] && holdings[0].share > 0) sentences.push(`The largest source of active risk is ${holdings[0].ticker}: ${p1(holdings[0].weight)} of ${book} and ${p1(holdings[0].share)} of active risk.`);
  // The benchmark side: an underweight sector is a bet too.
  const under = legs.find((l) => l.activeRiskShare >= 0.02 && (l.sectorActive ?? 0) < 0);
  if (under) sentences.push(`Being underweight ${under.label} (${pp(under.sectorActive!)} vs ${under.etf}) is ${p1(under.activeRiskShare)} of active risk.`);
  const reducer = [...holdings].sort((a, b) => a.share - b.share)[0];
  if (reducer && reducer.share <= -0.01) sentences.push(`${reducer.ticker} offsets other bets: ${p1(reducer.weight)} of ${book} and ${p1(reducer.share)} of active risk.`);
  // Sizing: the holdings where one more percentage point moves tracking error most, each way.
  const byMarginal = [...holdings].filter((h) => h.source !== "excluded").sort((a, b) => b.marginalTe - a.marginalTe);
  const up = byMarginal[0];
  const down = byMarginal.at(-1);
  if (up && up.marginalTe > 0) {
    let s = `Adding 1 pp of ${up.ticker} from cash raises tracking error by about ${ppPerPp(up.marginalTe)}`;
    if (down && down !== up && down.marginalTe < 0) s += `; adding 1 pp of ${down.ticker} lowers it by about ${ppPerPp(down.marginalTe)}`;
    sentences.push(`${s}.`);
  }

  return { trackingError: te, dailyTe, holdings, holdingsShare, benchmark, total: holdingsShare + benchmark.share, sentences };
}

/**
 * The exact check on marginal tracking error: recompute √(aᵀΣa) × √252 with one active weight moved by `delta`
 * (funded from cash, which has no variance), from the same active weights and covariance the page used.
 */
export function bumpCheck(r: RiskReport, ticker: string, delta = 0.01) {
  const { active, covariance, tickers } = r.matrix;
  const i = tickers.indexOf(ticker);
  if (!active || i < 0 || r.portfolio.trackingError === null) return null;
  const after = volAfterBump(active, covariance, i, delta) * Math.sqrt(TRADING_DAYS);
  const before = r.portfolio.trackingError;
  const h = r.holdings.find((x) => x.ticker === ticker);
  const leg = r.benchmarkLegs.find((l) => l.etf === ticker);
  const marginal = h?.marginalTe ?? leg?.marginalTe ?? null;
  return { ticker, delta, before, after, change: after - before, linear: marginal === null ? null : marginal * delta };
}
