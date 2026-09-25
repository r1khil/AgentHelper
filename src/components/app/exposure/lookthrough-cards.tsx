import { fmtDate } from "@/lib/format";
import { SOURCE_LABELS } from "@/lib/lookthrough/parse";
import type { SectorBet } from "@/lib/risk/exposure";
import type { LookthroughReport } from "@/lib/risk/lookthrough";
import { Move } from "../move";
import { rpp } from "../risk/active-risk";
import { RISK_EXPLAIN } from "../risk/explainers";
import { rpct } from "../risk/format";
import { StatCard } from "../risk/stat-card";
import { Source, Step, Working } from "../risk/working";

/**
 * Headline cards for the Exposure page when ETF holdings are stored: the largest active bet by company (vs the
 * benchmark's own holdings, through the ETFs) with the sector-level bet kept beneath it, and Active Share.
 */

export function StockBetCard({ lt, sectorBet, benchmarkLabel, transparency, className }: { lt: LookthroughReport; sectorBet: SectorBet | null; benchmarkLabel: string; transparency: boolean; className?: string }) {
  const a = lt.active!;
  const bet = a.largestBet;
  const nextBets = a.rows.filter((r) => r !== bet).slice(0, 2);
  return (
    <StatCard
      className={className}
      label="Largest active bet"
      explain={RISK_EXPLAIN.stockLargestBet}
      value={bet ? <Move value={bet.active * 100} unit=" pp" digits={1} /> : "—"}
      caption={
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
          <div>
            {bet ? (
              <>
                <span className="font-medium text-foreground">{bet.key}</span> <span className="text-xs">by company</span>
                <br />
                {rpct(bet.fund)} vs {rpct(bet.benchmark)} in {benchmarkLabel}
              </>
            ) : (
              "No companies to compare"
            )}
          </div>
          <div className="border-t border-dashed pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
            {sectorBet && sectorBet.active !== null ? (
              <>
                <span className="text-foreground">
                  <Move value={sectorBet.active * 100} unit=" pp" digits={1} /> <span className="font-medium">{sectorBet.label}</span>
                </span>{" "}
                <span className="text-xs">by sector</span>
                <br />
                {rpct(sectorBet.weight)} vs {rpct(sectorBet.benchWeight)}
                {sectorBet.etf ? ` in ${sectorBet.etf}` : ""}
              </>
            ) : (
              "By sector: add S&P 500 sector weights"
            )}
          </div>
        </div>
      }
      working={
        transparency && bet ? (
          <Working>
            <Step label={bet.key}>
              portfolio {rpct(bet.fund, 2)} − {benchmarkLabel} {rpct(bet.benchmark, 2)} = <b>{rpp(bet.active * 100, 2)}</b>
            </Step>
            {nextBets.map((r) => (
              <Step key={r.key} label="Next">{r.key} {rpp(r.active * 100, 2)}</Step>
            ))}
            {sectorBet && sectorBet.active !== null && (
              <Step label={`${sectorBet.label} (sector)`}>
                {rpct(sectorBet.weight, 2)} − {rpct(sectorBet.benchWeight, 2)} = {rpp(sectorBet.active * 100, 2)}
              </Step>
            )}
            <Source>the largest absolute difference in the stock-level tables below; the sector bet is the sector table&apos;s largest.</Source>
          </Working>
        ) : undefined
      }
    />
  );
}

export function ActiveShareCard({ lt, benchmarkLabel, transparency, className }: { lt: LookthroughReport; benchmarkLabel: string; transparency: boolean; className?: string }) {
  const a = lt.active!;
  const inBench = a.rows.filter((r) => r.benchmark > 0).length;
  return (
    <StatCard
      className={className}
      label="Active Share"
      explain={RISK_EXPLAIN.activeShare}
      value={rpct(a.activeShare)}
      caption={
        <>
          vs {benchmarkLabel}&apos;s {inBench} companies · {rpct(a.overlapWithBenchmark)} of the portfolio in index names
        </>
      }
      working={transparency ? <ActiveShareWorking lt={lt} /> : undefined}
    />
  );
}

function ActiveShareWorking({ lt }: { lt: LookthroughReport }) {
  const a = lt.active!;
  const fundTotal = a.rows.reduce((s, r) => s + r.fund, 0);
  const benchTotal = a.rows.reduce((s, r) => s + r.benchmark, 0);
  const diff = fundTotal > 0 && benchTotal > 0 ? a.rows.reduce((s, r) => s + Math.abs(r.fund / fundTotal - r.benchmark / benchTotal), 0) : 0;
  return (
    <Working>
      <Step label="Portfolio stocks">{rpct(fundTotal, 2)} (left out: {rpct(a.excluded, 2)} cash and not looked through)</Step>
      <Step label="Benchmark stocks">{rpct(benchTotal, 2)} of {a.benchmark.etf}</Step>
      <Step label="Σ |w_p − w_b|">over {a.rows.length} companies, each side scaled to 100% = {diff.toFixed(4)}</Step>
      <Step>½ × {diff.toFixed(4)} = <b>{rpct(a.activeShare, 1)}</b></Step>
      <Source>{a.benchmark.etf} holdings as of {fmtDate(a.benchmark.asOf)} ({SOURCE_LABELS[a.benchmark.source]}); the look-through download lists both weights for every company.</Source>
    </Working>
  );
}
