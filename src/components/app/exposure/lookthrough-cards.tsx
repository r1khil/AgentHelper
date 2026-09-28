import { fixed, fmtDate } from "@/lib/format";
import { SOURCE_LABELS } from "@/lib/lookthrough/parse";
import type { SectorBet } from "@/lib/risk/exposure";
import type { LookthroughReport } from "@/lib/risk/lookthrough";
import { rbp, rpct } from "../risk/format";
import { Source, Step, Working } from "../risk/working";

/**
 * Transparency working for the Exposure page's stock-level numbers (they sit under the stock-level tables): the largest
 * active bet by company, with the sector-level bet beside it, and Active Share.
 */

export function StockBetWorking({ lt, sectorBet, benchmarkLabel }: { lt: LookthroughReport; sectorBet: SectorBet | null; benchmarkLabel: string }) {
  const a = lt.active!;
  const bet = a.largestBet;
  if (!bet) return null;
  const nextBets = a.rows.filter((r) => r !== bet).slice(0, 2);
  return (
    <Working title="Largest active bet: working">
      <Step label={bet.key}>
        portfolio {rpct(bet.fund, 2)} − {benchmarkLabel} {rpct(bet.benchmark, 2)} = <b>{rbp(bet.active)}</b>
      </Step>
      {nextBets.map((r) => (
        <Step key={r.key} label="Next">{r.key} {rbp(r.active)}</Step>
      ))}
      {sectorBet && sectorBet.active !== null && (
        <Step label={`${sectorBet.label} (sector)`}>
          {rpct(sectorBet.weight, 2)} − {rpct(sectorBet.benchWeight, 2)} = {rbp(sectorBet.active)}
        </Step>
      )}
      <Source>the largest absolute difference in the stock-level tables; the sector bet is the sector table&apos;s largest.</Source>
    </Working>
  );
}

export function ActiveShareWorking({ lt }: { lt: LookthroughReport }) {
  const a = lt.active!;
  const fundTotal = a.rows.reduce((s, r) => s + r.fund, 0);
  const benchTotal = a.rows.reduce((s, r) => s + r.benchmark, 0);
  const diff = fundTotal > 0 && benchTotal > 0 ? a.rows.reduce((s, r) => s + Math.abs(r.fund / fundTotal - r.benchmark / benchTotal), 0) : 0;
  return (
    <Working title="Active Share: working">
      <Step label="Portfolio stocks">{rpct(fundTotal, 2)} (left out: {rpct(a.excluded, 2)} cash and not looked through)</Step>
      <Step label="Benchmark stocks">{rpct(benchTotal, 2)} of {a.benchmark.etf}</Step>
      <Step label="Σ |w_p − w_b|">over {a.rows.length} companies, each side scaled to 100% = {fixed(diff, 4)}</Step>
      <Step>½ × {fixed(diff, 4)} = <b>{rpct(a.activeShare, 1)}</b></Step>
      <Source>{a.benchmark.etf} holdings as of {fmtDate(a.benchmark.asOf)} ({SOURCE_LABELS[a.benchmark.source]}); the look-through download lists both weights for every company.</Source>
    </Working>
  );
}
