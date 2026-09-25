import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { TRADING_DAYS, Z95 } from "@/lib/risk/math";
import type { RiskReport } from "@/lib/risk/model";
import { rnum, rpct, rsci, rsigned, rusdFull } from "./format";
import { Source, Step, Working } from "./working";

// Transparency mode: each headline number's formula with this page's inputs substituted.

const sqrt252 = Math.sqrt(TRADING_DAYS);

export function VolWorking({ r }: { r: RiskReport }) {
  const p = r.portfolio;
  return (
    <Working>
      <Step label="Daily variance">wᵀΣw = {rsci(p.dailyVariance, 8)}</Step>
      <Step label="Daily volatility">√{rsci(p.dailyVariance, 8)} = {rsci(p.dailySigma)} ({rpct(p.dailySigma, 3)})</Step>
      <Step label="Annualized">{rsci(p.dailySigma)} × √252 ({sqrt252.toFixed(4)}) = <b>{rpct(p.vol, 2)}</b></Step>
      <Step label="Check">the holdings table&apos;s Contribution column adds up to the same {rpct(p.vol, 2)}.</Step>
      <Source>w = today&apos;s ledger weights ({r.holdings.length} holdings{r.cash.weight > 0 ? `, ${rpct(r.cash.weight)} cash at zero risk` : ""}); Σ = sample covariance (COVARIANCE.S) of {r.window.days} daily total returns. Both are in the downloads below.</Source>
    </Working>
  );
}

export function BetaWorking({ r }: { r: RiskReport }) {
  const top = [...r.holdings].sort((a, b) => Math.abs(b.weight * b.beta) - Math.abs(a.weight * a.beta));
  return (
    <Working>
      <Step label="Formula">β = Σ wᵢ × βᵢ, with βᵢ = cov(rᵢ, r_SPY) ÷ var(r_SPY)</Step>
      <div className="max-h-48 overflow-y-auto">
        <table className="tnum w-full">
          <thead className="text-muted-foreground"><tr><th className="text-left font-normal">Holding</th><th className="text-right font-normal">w</th><th className="text-right font-normal">β</th><th className="text-right font-normal">w × β</th></tr></thead>
          <tbody>
            {top.map((h) => (
              <tr key={h.ticker}><td>{h.ticker}</td><td className="text-right">{rpct(h.weight, 2)}</td><td className="text-right">{rnum(h.beta, 3)}</td><td className="text-right">{rnum(h.weight * h.beta, 4)}</td></tr>
            ))}
            {r.cash.weight > 0 && <tr><td>Cash</td><td className="text-right">{rpct(r.cash.weight, 2)}</td><td className="text-right">0</td><td className="text-right">0</td></tr>}
          </tbody>
        </table>
      </div>
      <Step label="Sum">= <b>{rnum(r.portfolio.beta, 3)}</b></Step>
    </Working>
  );
}

export function TeWorking({ r }: { r: RiskReport }) {
  if (r.portfolio.dailyTe === null) return null;
  return (
    <Working>
      <Step label="Active weights a">holdings at their weights ({rpct(r.portfolio.invested, 1)} in total), minus the benchmark&apos;s sector ETFs:</Step>
      <div className="tnum text-muted-foreground">{r.benchmarkLegs.map((l) => `${l.etf} ${rsigned(l.weight, 2)}`).join(" · ")}</div>
      <Step label="Daily">√(aᵀΣa) = {rsci(r.portfolio.dailyTe)}</Step>
      <Step label="Annualized">{rsci(r.portfolio.dailyTe)} × √252 = <b>{rpct(r.portfolio.trackingError, 2)}</b></Step>
      <Source>benchmark weights are the saved S&amp;P 500 sector weights drifted to today; ETF returns are Select Sector SPDR total returns.</Source>
    </Working>
  );
}

export function VarWorking({ r }: { r: RiskReport }) {
  const v = r.portfolio.var;
  const lo = Math.floor(v.rank);
  const sorted = [...v.tail].sort((a, b) => a.ret - b.ret);
  return (
    <Working>
      <Step label="Simulate">each of the {v.observations} days: Σ wᵢ × rᵢ,day with today&apos;s weights.</Step>
      <Step label="Percentile">PERCENTILE.INC at 5%: rank = 0.05 × ({v.observations} − 1) = {v.rank.toFixed(2)}, between sorted days #{lo + 1} and #{lo + 2}.</Step>
      <div className="max-h-40 overflow-y-auto">
        <table className="tnum w-full">
          <thead className="text-muted-foreground"><tr><th className="text-left font-normal">#</th><th className="text-left font-normal">Day</th><th className="text-right font-normal">Simulated return</th></tr></thead>
          <tbody>
            {sorted.map((d, i) => (
              <tr key={d.date} className={i === lo || i === lo + 1 ? "font-semibold" : undefined}><td>{i + 1}</td><td>{fmtDate(d.date)}</td><td className="text-right">{rsigned(d.ret, 3)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Step label="VaR">{rpct(v.pct, 3)} × NAV {rusdFull(r.nav)} = <b>{rusdFull(v.dollars)}</b></Step>
      <Step label="Expected shortfall">average of the days at or below the cutoff = {rpct(v.es, 3)} = {rusdFull(v.esDollars)}</Step>
      <Step label="Parametric check">{Z95.toFixed(3)} × daily σ {rpct(r.portfolio.dailySigma, 3)} = {rpct(v.parametricPct, 3)}</Step>
    </Working>
  );
}

export function StressWorking({ r }: { r: RiskReport }) {
  const s = r.portfolio.stress;
  return (
    <Working title="Stress test working">
      <Step>β {rnum(r.portfolio.beta, 3)} × S&amp;P 500 {rsigned(s.shock, 0)} = {rsigned(s.move, 2)}</Step>
      <Step>{rsigned(s.move, 2)} × NAV {rusdFull(r.nav)} = <b>{rusdFull(s.dollars)}</b></Step>
    </Working>
  );
}

export function ConcentrationWorking({ r }: { r: RiskReport }) {
  return (
    <Working title="Concentration working">
      <Step label="HHI">Σ (wᵢ ÷ {rpct(r.portfolio.invested, 1)})² = {rnum(r.portfolio.hhi, 4)}</Step>
      <Step label="Effective positions">1 ÷ {rnum(r.portfolio.hhi, 4)} = <b>{rnum(r.portfolio.effectiveN, 1)}</b> (of {r.holdings.length})</Step>
    </Working>
  );
}

/** Which rows fed the numbers: each symbol's own returns in the window, and anything filled or proxied. */
export function CoverageTable({ r }: { r: RiskReport }) {
  // Coverage lists the holdings, then the sector ETFs and SPY, so a held ETF (XLK) appears twice: key by which side it's on.
  const rows = r.coverage
    .map((c, i) => ({ ...c, key: `${i < r.holdings.length ? "holding" : "etf"}:${c.ticker}` }))
    .sort((a, b) => a.observations - b.observations);
  return (
    <div className="max-h-72 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead className="text-right">Own returns</TableHead>
            <TableHead className="text-right">Filled</TableHead>
            <TableHead>Modeled as</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.key}>
              <TableCell className="font-medium">{c.ticker}</TableCell>
              <TableCell className="tnum text-right">{c.observations} / {r.window.days}</TableCell>
              <TableCell className="tnum text-right">{c.filled}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {c.source === "own" ? (c.filled ? "own returns; gaps filled from sector ETF (holdings) or 0 (ETFs)" : "own returns") : c.source === "proxy" ? `sector ETF ${c.proxy}` : "riskless (no history, no sector)"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
