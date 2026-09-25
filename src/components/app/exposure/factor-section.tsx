import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import {
  FACTORS,
  T_STAT_THRESHOLD,
  factorReadings,
  formatBeta,
  isFactorReport,
  weightedBetas,
  type Coefficient,
  type FactorFit,
  type FactorKey,
  type FactorReport,
} from "@/lib/risk/factors";
import type { RiskReport } from "@/lib/risk/model";
import { cn } from "@/lib/utils";
import { Explained } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "../risk/explainers";
import { rpct, rsci } from "../risk/format";
import { Source, Step, Working } from "../risk/working";
import { ExposureSection } from "./exposure-view";

/** The anchor the economic calendar's lines link to: `/exposure#factors`. */
export const FACTORS_ANCHOR = "factors";

const beta = (c: Coefficient) => formatBeta(c.beta, 2, { signed: true });
const tText = (c: Coefficient) => `t ${formatBeta(c.t, 1, { signed: true })}`;
const title = (c: Coefficient) => `β ${formatBeta(c.beta, 4, { signed: true })}, standard error ${c.se.toFixed(4)}, t ${c.t.toFixed(2)}${c.significant ? "" : ` (|t| < ${T_STAT_THRESHOLD}: not statistically significant)`}`;

/** A beta with its t-stat under it; greyed when |t| < 2. */
function BetaCell({ c, className }: { c: Coefficient; className?: string }) {
  return (
    <TableCell className={cn("tnum text-right", className)} title={title(c)}>
      <div className={cn("text-sm", c.significant ? "font-medium" : "text-muted-foreground/60")}>{beta(c)}</div>
      <div className={cn("text-[11px]", c.significant ? "text-muted-foreground" : "text-muted-foreground/50")}>{tText(c)}</div>
    </TableCell>
  );
}

/**
 * Factor and macro sensitivities on the Exposure page: the portfolio's, the benchmark's and the active betas on
 * seven factors, in plain English and as a table, with each holding's regression behind a disclosure.
 */
export function FactorSection({ report: r, transparency, exportQuery, benchmarkLabel }: { report: RiskReport; transparency: boolean; exportQuery: string; benchmarkLabel: string }) {
  const f = r.factors;
  if (!isFactorReport(f)) {
    return (
      <ExposureSection id={FACTORS_ANCHOR} title="Factor and macro sensitivities" explain={RISK_EXPLAIN.factors}>
        <Card className="p-4 text-sm text-muted-foreground">{f.reason}</Card>
      </ExposureSection>
    );
  }
  const fund = r.scope === "fund";
  const who = fund ? "The Fund" : "The team's holdings";
  const read = factorReadings(f, { basis: fund ? "NAV" : "the team's holdings" });
  const download = (file: string, label: string) => (
    <a href={`/api/risk/export?file=${file}&lookback=${r.lookback}${exportQuery}`} className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2" download>
      <Download className="size-3" aria-hidden />
      {label}
    </a>
  );
  const downloads = (
    <>
      {download("factors", "Factor betas")} {download("factor-returns", "Factor and portfolio returns")}
    </>
  );

  return (
    <ExposureSection
      id={FACTORS_ANCHOR}
      title="Factor and macro sensitivities"
      explain={RISK_EXPLAIN.factors}
      aside={`${f.sample.n} trading days to ${fmtDate(f.sample.to)} · greyed: |t| < ${T_STAT_THRESHOLD}`}
    >
      <Card className="mb-3 gap-2 p-4 text-sm">
        {read.clear.length > 0 ? (
          <ul className="grid gap-1">
            {read.clear.map((x) => (
              <li key={x.key}>
                <span className="font-medium">{x.label}</span> <span className="tnum text-xs text-muted-foreground">β {formatBeta(x.beta, 2, { signed: true })}</span> · {x.text}
              </li>
            ))}
          </ul>
        ) : (
          <p>{who} show{fund ? "s" : ""} no statistically clear factor exposure over this window.</p>
        )}
        {read.unclear.length > 0 && (
          <p className="text-muted-foreground">
            No clear exposure (|t| &lt; {T_STAT_THRESHOLD}):{" "}
            {read.unclear.map((x, i) => (
              <span key={x.key} className="tnum">{i ? ", " : ""}{x.label.toLowerCase()} β {formatBeta(x.beta, 2, { signed: true })}</span>
            ))}
            .
          </p>
        )}
        {f.active && (
          <p>
            <span className="font-medium">Against {benchmarkLabel}:</span>{" "}
            {read.active.length ? read.active.map((x) => x.text).join("; ") : "no statistically clear factor tilts."}
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factor</TableHead>
              <TableHead className="text-right"><Explained align="right" label={fund ? "Fund β" : "Team β"}>{RISK_EXPLAIN.factorBeta}</Explained></TableHead>
              <TableHead className="text-right">
                <span className="hidden sm:inline"><Explained align="right" label="Benchmark β">{RISK_EXPLAIN.factorBenchmarkRow}</Explained></span>
                <span className="sm:hidden"><Explained align="right" label="Bench. β">{RISK_EXPLAIN.factorBenchmarkRow}</Explained></span>
              </TableHead>
              <TableHead className="text-right"><Explained align="right" label="Active β">{RISK_EXPLAIN.factorActiveRow}</Explained></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {FACTORS.map((x) => (
              <TableRow key={x.key}>
                <TableCell>
                  <span className="font-medium">{x.label}</span>
                  <div className="text-[11px] text-muted-foreground sm:hidden" title={x.definition}>{x.short ? `${x.long} − ${x.short}` : x.long}</div>
                  <div className="hidden text-[11px] whitespace-normal text-muted-foreground sm:block">{x.definition}</div>
                </TableCell>
                <BetaCell c={f.fund.betas[x.key]} />
                {f.benchmark ? <BetaCell c={f.benchmark.betas[x.key]} /> : <TableCell className="text-right text-muted-foreground">—</TableCell>}
                {f.active ? <BetaCell c={f.active.betas[x.key]} /> : <TableCell className="text-right text-muted-foreground">—</TableCell>}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="text-xs font-medium"><Explained label="R²">{RISK_EXPLAIN.factorR2}</Explained></TableCell>
              <TableCell className="tnum text-right text-sm">{f.fund.r2.toFixed(2)}</TableCell>
              <TableCell className="tnum text-right text-sm">{f.benchmark ? f.benchmark.r2.toFixed(2) : "—"}</TableCell>
              <TableCell className="tnum text-right text-sm">{f.active ? f.active.r2.toFixed(2) : "—"}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 px-1 text-xs text-muted-foreground">
        <Explained label="t-stat under each beta">{RISK_EXPLAIN.factorT}</Explained>
        <span>
          · {f.sample.n} days, {fmtDate(f.sample.from)} to {fmtDate(f.sample.to)}
          {f.sample.dropped ? ` (${f.sample.dropped} days without every factor's close left out)` : ""}
        </span>
      </p>

      <HoldingBetas f={f} />
      {transparency ? (
        <FactorWorking f={f} downloads={downloads} fund={fund} />
      ) : (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Download:</span>
          {downloads}
        </p>
      )}
    </ExposureSection>
  );
}

function HoldingBetas({ f }: { f: FactorReport }) {
  const rows = [...f.holdings].sort((a, b) => b.weight - a.weight);
  return (
    <details className="mt-2 rounded-xl ring-1 ring-foreground/10">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-muted-foreground select-none hover:text-foreground">
        Each holding&apos;s betas ({rows.length})
      </summary>
      <div className="border-t">
        <p className="px-4 pt-2 text-xs text-muted-foreground">{RISK_EXPLAIN.factorHoldings}</p>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Holding</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              {FACTORS.map((x) => <TableHead key={x.key} className="text-right">{x.label}</TableHead>)}
              <TableHead className="text-right">R²</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((h) => (
              <TableRow key={h.ticker}>
                <TableCell>
                  <span className="font-medium">{h.ticker}</span>
                  {h.source !== "own" && (
                    <span className="ml-1.5 rounded border px-1 py-px text-[10px] text-muted-foreground" title={h.source === "proxy" ? `Too little price history; modeled with ${h.proxy}` : "No price history or sector; treated as riskless"}>
                      {h.source === "proxy" ? `via ${h.proxy}` : "not modeled"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="tnum text-right">{rpct(h.weight)}</TableCell>
                {FACTORS.map((x) => {
                  const c = h.betas[x.key];
                  return (
                    <TableCell key={x.key} title={title(c)} className={cn("tnum text-right", c.significant ? "" : "text-muted-foreground/60")}>
                      {beta(c)}
                    </TableCell>
                  );
                })}
                <TableCell className="tnum text-right text-muted-foreground">{h.r2.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

/** Transparency mode: the model, one factor's portfolio beta rebuilt from the holdings, its t-stat, and the active difference. */
function FactorWorking({ f, downloads, fund }: { f: FactorReport; downloads: React.ReactNode; fund: boolean }) {
  // Work through the clearest non-market factor, or rates when none is clear.
  const key: FactorKey = FACTORS.filter((x) => x.key !== "market").sort((a, b) => Math.abs(f.fund.betas[b.key].t) - Math.abs(f.fund.betas[a.key].t))[0]?.key ?? "rates";
  const label = FACTORS.find((x) => x.key === key)!.label.toLowerCase();
  const terms = [...f.holdings].sort((a, b) => Math.abs(b.weight * b.betas[key].beta) - Math.abs(a.weight * a.betas[key].beta));
  const shown = terms.slice(0, 4);
  const bottomUp = weightedBetas(f.holdings)[key];
  const c = f.fund.betas[key];
  const fmtTerm = (w: number, b: number) => `${w.toFixed(3)} × ${formatBeta(b, 3)}`;
  const fit = (x: FactorFit | null) => (x ? formatBeta(x.betas[key].beta, 4, { signed: true }) : "—");
  return (
    <Working className="mt-2" title="Factor working">
      <Step label="Model">
        rᵢ = α + β<sub>market</sub>·SPY + β<sub>size</sub>·(IWM − SPY) + β<sub>value</sub>·(IVE − IVW) + β<sub>momentum</sub>·(MTUM − SPY) + β<sub>rates</sub>·TLT + β<sub>dollar</sub>·UUP + β<sub>oil</sub>·USO + ε, daily total returns, OLS over {f.sample.n} days ({f.sample.from} to {f.sample.to}), {f.fund.df} degrees of freedom
      </Step>
      <Step label={`${fund ? "Fund" : "Team"} ${label} β = Σ wᵢ βᵢ`}>
        {shown.map((h) => fmtTerm(h.weight, h.betas[key].beta)).join(" + ")}
        {terms.length > shown.length ? ` + … (${terms.length - shown.length} more)` : ""} = <b>{formatBeta(bottomUp, 4, { signed: true })}</b>
      </Step>
      <Step label="Check">regressing the weighted portfolio&apos;s own daily return gives {formatBeta(c.beta, 4, { signed: true })}: the same number, because least squares is linear in the returns</Step>
      <Step label="t-stat">
        β ÷ standard error = {formatBeta(c.beta, 4, { signed: true })} ÷ {rsci(c.se, 4)} = <b>{c.t.toFixed(2)}</b>
        {Math.abs(c.t) < T_STAT_THRESHOLD ? " (below 2, so greyed out and described as no clear exposure)" : ""}
      </Step>
      {f.active && (
        <Step label="Active">
          {fit(f.fund)} − benchmark {fit(f.benchmark)} = <b>{fit(f.active)}</b>
        </Step>
      )}
      <Step label="R²">1 − residual sum of squares ÷ total sum of squares = {f.fund.r2.toFixed(4)}; residual volatility {rpct(f.fund.residualVol)} a year</Step>
      <Source>
        stored daily closes with dividends. In Excel, LINEST(portfolio column, the seven factor columns, TRUE, TRUE) on the returns download reproduces the {fund ? "Fund" : "team"} row, standard errors included: {downloads}
      </Source>
    </Working>
  );
}
