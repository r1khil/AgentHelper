import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Segmented } from "@/components/app/panel";
import { activeRiskBreakdown, bumpCheck, type ActiveRisk, type ActiveRiskRow } from "@/lib/risk/active";
import { TRADING_DAYS } from "@/lib/risk/math";
import type { RiskReport } from "@/lib/risk/model";
import { MagnitudeBar } from "../attribution/bars";
import { Explained } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rpct, rsci, rsigned } from "./format";
import type { TeamNames } from "./holdings-risk-table";
import { Source, Step, Working } from "./working";
import { RowLink } from "@/components/app/row-link";

const TOP = 10;
export const ACTIVE_RISK_ANCHOR = "active-risk";

/** Marginal tracking error is TE per unit of weight, which is also percentage points of TE per point of weight. */
export const rpp = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)} pp`;

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
  const title = <Explained label="Where the active risk comes from">{RISK_EXPLAIN.activeRiskSection}</Explained>;
  if (!a) {
    return (
      <section id={ACTIVE_RISK_ANCHOR} aria-label="Where the active risk comes from" className="scroll-mt-4">
        <h2 className="mb-2.5 text-[14.5px] font-semibold">{title}</h2>
        <Card className="p-4 text-sm text-muted-foreground">Tracking error needs benchmark sector weights, so active risk can&apos;t be split yet.</Card>
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
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14.5px] font-semibold">{title}</h2>
        {a.holdings.length > TOP && (
          <Segmented
            label="Active risk view"
            segments={[
              { key: "top", label: `Largest ${TOP}`, href: `${basePath}${q}#${ACTIVE_RISK_ANCHOR}`, active: !showAll },
              { key: "all", label: `All ${a.holdings.length}`, href: `${basePath}${q}&all=1#${ACTIVE_RISK_ANCHOR}`, active: showAll },
            ]}
          />
        )}
      </div>
      <p className="mb-1 text-[13px] text-ink-2">
        Tracking error {rpct(a.trackingError, 2)} vs {benchmarkLabel}. Holdings long, the benchmark&apos;s sector ETFs short; the rows add to 100%.
      </p>
      {a.sentences.length > 0 && (
        <ul className="mb-3 grid gap-0.5 text-sm">
          {a.sentences.map((s) => <li key={s}>{s}</li>)}
        </ul>
      )}
      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead>
                <Explained label="Weight vs share of active risk">{RISK_EXPLAIN.holdingActiveRiskShare}</Explained>
              </TableHead>
              <TableHead className="text-right"><Explained align="right" label="TE points">{RISK_EXPLAIN.teContribution}</Explained></TableHead>
              <TableHead className="text-right"><Explained align="right" label="+1 pp from cash">{RISK_EXPLAIN.marginalTe}</Explained></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((h) => <HoldingRow key={h.ticker} h={h} max={max} teams={teams} />)}
            {rest.length > 0 && (
              <TableRow className="text-muted-foreground">
                <TableCell>
                  <Link href={`${basePath}${q}&all=1#${ACTIVE_RISK_ANCHOR}`} className="font-medium hover:underline">{rest.length} smaller holdings</Link>
                  <div className="max-w-24 truncate text-[11px] sm:max-w-44" title={rest.map((h) => h.ticker).join(", ")}>{rest.map((h) => h.ticker).join(" · ")}</div>
                </TableCell>
                <TableCell>
                  <Bars weight={rest.reduce((s, h) => s + h.weight, 0)} share={rest.reduce((s, h) => s + h.share, 0)} max={max} aggregate />
                </TableCell>
                <TableCell className="text-right font-mono text-[12.5px]">{rpct(rest.reduce((s, h) => s + h.teContribution, 0), 2)}</TableCell>
                <TableCell className="text-right text-xs">per holding in All</TableCell>
              </TableRow>
            )}
            <TableRow className="bg-muted/30">
              <TableCell className="align-top">
                <span className="font-medium"><Explained label="Benchmark side">{RISK_EXPLAIN.benchmarkSide}</Explained></span>
                <div className="max-w-32 text-[11px] whitespace-normal text-muted-foreground sm:max-w-none">Sector ETFs at benchmark weights, held short</div>
                <details className="mt-1 text-[11px]">
                  <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">By ETF ({a.benchmark.legs.length})</summary>
                  <table className="tnum mt-1">
                    <thead className="text-muted-foreground">
                      <tr><th className="pr-3 text-left font-normal">ETF</th><th className="pr-3 text-right font-normal">Weight</th><th className="pr-3 text-right font-normal">Portfolio active</th><th className="text-right font-normal">Share</th></tr>
                    </thead>
                    <tbody>
                      {a.benchmark.legs.map((l) => (
                        <tr key={l.etf} title={l.label}>
                          <td className="pr-3">{l.etf}</td>
                          <td className="pr-3 text-right">{rsigned(l.weight)}</td>
                          <td className="pr-3 text-right">{l.sectorActive === null ? "—" : rpp(l.sectorActive * 100, 1)}</td>
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
              <TableCell className="text-right font-mono align-top text-sm">{rpct(a.benchmark.teContribution, 2)}</TableCell>
              <TableCell className="text-right align-top text-xs text-muted-foreground">—</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell className="font-mono text-xs">{rpct(a.total)} of active risk</TableCell>
              <TableCell className="text-right font-mono text-[12.5px] font-medium">{rpct(a.trackingError, 2)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
      {transparency && <ActiveRiskWorking r={r} a={a} download={download} />}
    </section>
  );
}

function Bars({ weight, share, max, aggregate }: { weight: number; share: number; max: number; aggregate?: boolean }) {
  if (aggregate) {
    return (
      <div className="grid gap-1 text-xs">
        <div className="flex items-center gap-2" title="Share of value"><span className="w-24 text-[11px] text-muted-foreground">weight</span><span className="tnum w-14 text-muted-foreground">{weight < 0 ? rsigned(weight) : rpct(weight)}</span></div>
        <div className="flex items-center gap-2" title="Share of active risk"><span className="w-24 text-[11px] text-muted-foreground">active risk</span><span className="tnum w-14 font-medium">{rpct(share)}</span></div>
      </div>
    );
  }
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2" title="Share of value">
        <MagnitudeBar value={weight} max={max} color="var(--muted-foreground)" className="h-1.5 w-24" />
        <span className="w-14 font-mono text-xs text-muted-foreground">{rpct(weight)}</span>
      </div>
      <div className="flex items-center gap-2" title="Share of active risk">
        <MagnitudeBar value={share} max={max} color={share < 0 ? "var(--down)" : "var(--series-1)"} className="h-1.5 w-24" />
        <span className="w-14 font-mono text-xs font-medium">{rpct(share)}</span>
      </div>
    </div>
  );
}

function HoldingRow({ h, max, teams }: { h: ActiveRiskRow; max: number; teams: TeamNames }) {
  const team = h.teamId ? teams.get(h.teamId) : undefined;
  return (
    <TableRow>
      <TableCell>
        {team ? <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(h.ticker)}`} className="font-mono font-semibold hover:underline">{h.ticker}</RowLink> : <span className="font-mono font-semibold">{h.ticker}</span>}
        {h.source !== "own" && (
          <span className="ml-1.5 rounded border px-1 py-px text-[10px] text-muted-foreground" title={h.source === "proxy" ? `Too little price history; modeled with ${h.proxy}` : "No price history or sector; treated as riskless"}>
            {h.source === "proxy" ? `via ${h.proxy}` : "not modeled"}
          </span>
        )}
        <div className="max-w-24 truncate text-[11px] text-muted-foreground sm:max-w-44">{team?.name ?? h.name}</div>
      </TableCell>
      <TableCell><Bars weight={h.weight} share={h.share} max={max} /></TableCell>
      <TableCell className="text-right font-mono text-[12.5px]">{rpct(h.teContribution, 2)}</TableCell>
      <TableCell className="text-right font-mono text-[12.5px]">{rpp(h.marginalTe)}</TableCell>
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
          (Σa)ᵢ ÷ TE = {rsci(sigmaA(byMarginal.marginalTe), 8)} ÷ {rsci(a.dailyTe, 6)} × √252 = {byMarginal.marginalTe.toFixed(4)}; for 1 pp of weight: <b>{rpp(byMarginal.marginalTe, 3)}</b> of tracking error
        </Step>
      )}
      {check && (
        <Step label="Exact check">
          recompute √(aᵀΣa) × √252 with {check.ticker} +1 pp funded from cash: {rpct(check.before, 3)} → {rpct(check.after, 3)} = <b>{rpp(check.change * 100, 3)}</b> (the marginal&apos;s {rpp((check.linear ?? 0) * 100, 3)} is the first-order estimate)
        </Step>
      )}
      <Source>
        a = the positions file&apos;s <code>active_weight</code> column; Σ = the covariance matrix download. Both, with each position&apos;s share and marginal, are in the downloads{download ? <>: {download}</> : "."}
      </Source>
    </Working>
  );
}
