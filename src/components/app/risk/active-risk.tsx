import Link from "next/link";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Segmented } from "@/components/app/panel";
import { activeRiskBreakdown, bumpCheck, type ActiveRisk, type ActiveRiskRow } from "@/lib/risk/active";
import { TRADING_DAYS } from "@/lib/risk/math";
import type { RiskReport } from "@/lib/risk/model";
import { PairBars, SectionHead } from "@/components/app/portfolio/parts";
import { Tip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { fmtBp } from "@/lib/format";
import { rbp, rpct, rsci } from "./format";
import type { TeamNames } from "./holdings-risk-table";
import { Source, Step, Working } from "./working";
import { tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

const TOP = 10;
export const ACTIVE_RISK_ANCHOR = "active-risk";

/** Marginal tracking error is TE per unit of weight, so 100 bp more of a holding moves TE by `marginalTe` × 100 bp. */
const marginalBp = (m: number, digits = 1) => fmtBp(m * 100, digits);

/**
 * Where the tracking error comes from: holdings ranked by their share of active risk, beside their weight, with a
 * row for the benchmark side so the column adds up to 100%, and marginal tracking error for sizing.
 */
export function ActiveRiskSection({ report: r, teams, benchmarkLabel, transparency, basePath, showAll, download }: {
  report: RiskReport;
  teams: TeamNames;
  benchmarkLabel: string;
  transparency: boolean;
  basePath: string;
  showAll: boolean;
  download?: React.ReactNode;
}) {
  const a = activeRiskBreakdown(r);
  const title = <Tip label="Where the active risk comes from">{RISK_EXPLAIN.activeRiskSection}</Tip>;
  if (!a) {
    return (
      <section id={ACTIVE_RISK_ANCHOR} aria-label="Where the active risk comes from" className="scroll-mt-4">
        <SectionHead title={title} />
        <p className="mt-2 text-body text-muted-foreground">Tracking error needs benchmark sector weights, so active risk can&apos;t be split yet.</p>
      </section>
    );
  }
  // Top view: the largest shares either way (big offsets included), still listed from most to least active risk.
  const kept = new Set((showAll ? a.holdings : [...a.holdings].sort((x, y) => Math.abs(y.share) - Math.abs(x.share)).slice(0, TOP)).map((h) => h.ticker));
  const rows = a.holdings.filter((h) => kept.has(h.ticker));
  const rest = a.holdings.filter((h) => !kept.has(h.ticker));
  // Bars compare individual holdings; the aggregate rows (smaller holdings, benchmark side) show numbers only.
  const max = Math.max(...a.holdings.flatMap((h) => [Math.abs(h.share), h.weight]), 0);
  const q = `?lookback=${r.lookback}`;

  return (
    <section id={ACTIVE_RISK_ANCHOR} aria-label="Where the active risk comes from" className="scroll-mt-4">
      <SectionHead
        title={title}
        sub={<>Tracking error {rpct(a.trackingError, 2)} vs {benchmarkLabel}. Holdings long, the benchmark&apos;s sector ETFs short; the rows add to 100%.</>}
        aside={
          a.holdings.length > TOP && (
            <Segmented
              label="Active risk view"
              segments={[
                { key: "top", label: `Largest ${TOP}`, href: `${basePath}${q}#${ACTIVE_RISK_ANCHOR}`, active: !showAll },
                { key: "all", label: `All ${a.holdings.length}`, href: `${basePath}${q}&all=1#${ACTIVE_RISK_ANCHOR}`, active: showAll },
              ]}
            />
          )
        }
      />
      {a.sentences.length > 0 && (
        <ul className="mt-2 grid gap-0.5 text-body">
          {a.sentences.map((s) => <li key={s}>{s}</li>)}
        </ul>
      )}
      <div className="mt-2 overflow-x-auto">
        <Table aria-label="Active risk by position">
          <TableHeader>
            <TableRow>
              <TableHead className="text-caption first:pl-0">Position</TableHead>
              <TableHead className="text-caption">
                <Tip label="Weight vs share of active risk" side="bottom">{RISK_EXPLAIN.holdingActiveRiskShare}</Tip>
              </TableHead>
              <TableHead className="text-right text-caption"><Tip label="TE points" side="bottom">{RISK_EXPLAIN.teContribution}</Tip></TableHead>
              <TableHead className="text-right text-caption last:pr-0"><Tip label="+100 bp from cash" side="bottom">{RISK_EXPLAIN.marginalTe}</Tip></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((h) => <HoldingRow key={h.ticker} h={h} max={max} teams={teams} />)}
            {rest.length > 0 && (
              <TableRow className="text-muted-foreground">
                <TableCell className="first:pl-0">
                  <Link href={`${basePath}${q}&all=1#${ACTIVE_RISK_ANCHOR}`} className="font-semibold hover:underline">{rest.length} smaller holdings</Link>
                  <div className="max-w-44 text-caption whitespace-normal">{rest.map((h) => h.ticker).join(", ")}</div>
                </TableCell>
                <TableCell>
                  <Bars weight={rest.reduce((s, h) => s + h.weight, 0)} share={rest.reduce((s, h) => s + h.share, 0)} max={max} aggregate />
                </TableCell>
                <TableCell className="text-right text-body">{rpct(rest.reduce((s, h) => s + h.teContribution, 0), 2)}</TableCell>
                <TableCell className="text-right text-body last:pr-0">per holding in All</TableCell>
              </TableRow>
            )}
            <TableRow className="bg-band">
              <TableCell className="align-top first:pl-0">
                <span className="font-semibold"><Tip label="Benchmark side">{RISK_EXPLAIN.benchmarkSide}</Tip></span>
                <div className="max-w-32 text-caption whitespace-normal text-muted-foreground sm:max-w-none">Sector ETFs at benchmark weights, held short</div>
                <details className="mt-1 text-caption">
                  <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">By ETF ({a.benchmark.legs.length})</summary>
                  <table className="tnum mt-1">
                    <thead className="text-muted-foreground">
                      <tr><th scope="col" className="pr-3 text-left font-normal">ETF</th><th scope="col" className="pr-3 text-right font-normal">Weight</th><th scope="col" className="pr-3 text-right font-normal">Portfolio active</th><th scope="col" className="text-right font-normal">Share</th></tr>
                    </thead>
                    <tbody>
                      {a.benchmark.legs.map((l) => (
                        <tr key={l.etf} title={l.label}>
                          <td className="pr-3">{l.etf}</td>
                          <td className="pr-3 text-right">{rpct(l.weight)}</td>
                          <td className="pr-3 text-right">{rbp(l.sectorActive)}</td>
                          <td className="text-right">{rpct(l.activeRiskShare)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </TableCell>
              <TableCell className="align-top">
                <Bars weight={a.benchmark.weight} share={a.benchmark.share} max={max} aggregate />
              </TableCell>
              <TableCell className="text-right align-top text-body">{rpct(a.benchmark.teContribution, 2)}</TableCell>
              <TableCell className="text-right align-top text-body text-muted-foreground">—</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter className="bg-transparent">
            <TableRow>
              <TableCell className="font-semibold first:pl-0">Total</TableCell>
              <TableCell className="text-body">{rpct(a.total)} of active risk</TableCell>
              <TableCell className="text-right text-body font-semibold">{rpct(a.trackingError, 2)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {transparency && <ActiveRiskWorking r={r} a={a} download={download} />}
    </section>
  );
}

function Bars({ weight, share, max, aggregate }: { weight: number; share: number; max: number; aggregate?: boolean }) {
  if (aggregate) {
    return (
      <div className="grid gap-1 text-body">
        <div className="flex items-center gap-2" title="Share of value"><span className="w-24 text-caption text-muted-foreground">weight</span><span className="w-14 text-muted-foreground">{rpct(weight)}</span></div>
        <div className="flex items-center gap-2" title="Share of active risk"><span className="w-24 text-caption text-muted-foreground">active risk</span><span className="w-14 font-semibold">{rpct(share)}</span></div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <PairBars a={weight} b={Math.abs(share)} max={max} className="w-24" />
      <span className="grid text-body leading-4">
        <span className="text-muted-foreground" title="Share of value">{rpct(weight)}</span>
        <span className={share < 0 ? "font-semibold text-down" : "font-semibold"} title="Share of active risk">{rpct(share)}</span>
      </span>
    </div>
  );
}

function HoldingRow({ h, max, teams }: { h: ActiveRiskRow; max: number; teams: TeamNames }) {
  const team = h.teamId ? teams.get(h.teamId) : undefined;
  return (
    <TableRow>
      <TableCell className="first:pl-0">
        {team ? <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(h.ticker)}`} aria-label={tickerName(h.ticker, h.name)} className="font-semibold hover:underline">{h.ticker}</RowLink> : <span className="font-semibold">{h.ticker}</span>}
        {h.source !== "own" && (
          <span className="ml-1.5 text-caption font-semibold text-caution-foreground" title={h.source === "proxy" ? `Too little price history; modeled with ${h.proxy}` : "No price history or sector; treated as riskless"}>
            {h.source === "proxy" ? `via ${h.proxy}` : "not modeled"}
            <span className="sr-only">: {h.source === "proxy" ? `too little price history; modeled with ${h.proxy}` : "no price history or sector; treated as riskless"}</span>
          </span>
        )}
        <div className="max-w-44 text-caption whitespace-normal text-muted-foreground">{team?.name ?? h.name}</div>
      </TableCell>
      <TableCell><Bars weight={h.weight} share={h.share} max={max} /></TableCell>
      <TableCell className="text-right text-body">{rpct(h.teContribution, 2)}</TableCell>
      <TableCell className="text-right text-body">{marginalBp(h.marginalTe)}</TableCell>
    </TableRow>
  );
}

/** Transparency mode: one row's share and marginal worked through, and the exact recomputation behind the marginal. */
function ActiveRiskWorking({ r, a, download }: { r: RiskReport; a: ActiveRisk; download?: React.ReactNode }) {
  const top = a.holdings[0];
  const byMarginal = [...a.holdings].sort((x, y) => y.marginalTe - x.marginalTe)[0];
  const sqrt252 = Math.sqrt(TRADING_DAYS);
  // (Σa)ᵢ in daily units, recovered from the annualized marginal: marginal × daily TE ÷ √252.
  const sigmaA = (m: number) => (m * a.dailyTe) / sqrt252;
  const check = byMarginal ? bumpCheck(r, byMarginal.ticker, 0.01) : null;
  return (
    <Working className="mt-2" title="Active risk working">
      <Step label="Tracking-error variance">aᵀΣa = {rsci(a.dailyTe ** 2, 8)} (daily); √ × √252 = {rpct(a.trackingError, 2)}</Step>
      {top && (
        <Step label={`${top.ticker}'s share`}>
          aᵢ × (Σa)ᵢ ÷ aᵀΣa = {rpct(top.weight, 2)} × {rsci(sigmaA(top.marginalTe), 8)} ÷ {rsci(a.dailyTe ** 2, 8)} = <b>{rpct(top.share, 2)}</b>
        </Step>
      )}
      <Step label="Adds to 100%">
        holdings {rpct(a.holdingsShare, 2)} + benchmark side {rpct(a.benchmark.share, 2)} = <b>{rpct(a.total, 2)}</b>
      </Step>
      {byMarginal && (
        <Step label={`${byMarginal.ticker}'s marginal`}>
          (Σa)ᵢ ÷ TE = {rsci(sigmaA(byMarginal.marginalTe), 8)} ÷ {rsci(a.dailyTe, 6)} × √252 = {rsci(byMarginal.marginalTe, 4)}; for 100 bp of weight: <b>{marginalBp(byMarginal.marginalTe, 1)}</b> of tracking error
        </Step>
      )}
      {check && (
        <Step label="Exact check">
          recompute √(aᵀΣa) × √252 with {check.ticker} +100 bp funded from cash: {rpct(check.before, 3)} → {rpct(check.after, 3)} = <b>{rbp(check.change, 1)}</b> (the marginal&apos;s {rbp(check.linear ?? 0, 1)} is the first-order estimate)
        </Step>
      )}
      <Source>
        a = the positions file&apos;s <code>active_weight</code> column; Σ = the covariance matrix download. Both, with each position&apos;s share and marginal, are in the downloads{download ? <>: {download}</> : "."}
      </Source>
    </Working>
  );
}
