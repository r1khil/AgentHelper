import Link from "next/link";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatStrip } from "@/components/app/panel";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { activeRiskBreakdown } from "@/lib/risk/active";
import { buildExposure, type Exposure } from "@/lib/risk/exposure";
import type { LookthroughState } from "@/lib/risk/lookthrough-report";
import type { RiskReport } from "@/lib/risk/model";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { cn } from "@/lib/utils";
import { MagnitudeBar } from "../attribution/bars";
import { Explained, InfoTip } from "../attribution/info-tip";
import { ACTIVE_RISK_ANCHOR, rpp } from "../risk/active-risk";
import { RISK_EXPLAIN } from "../risk/explainers";
import { rnum, rpct, rusd, rusdFull } from "../risk/format";
import type { TeamNames } from "../risk/holdings-risk-table";
import { OpenDetailsOnHash } from "../risk/open-on-hash";
import { ConcentrationWorking } from "../risk/risk-working";
import { FIRST_SCREEN, LookbackSelector } from "../risk/risk-view";
import { SectorExposure } from "../risk/sector-exposure";
import { Source, Step, Working } from "../risk/working";
import { ActiveBetsPanel, FactorTiltsPanel, SectorWeightsPanel } from "./exposure-panels";
import { ExposureSection } from "./exposure-section";
import { FactorSection } from "./factor-section";
import { LookthroughSections } from "./lookthrough";

export { ExposureSection };

/** The Fund toolbar's context line, e.g. "Today's positions by GICS sector against the S&P 500 sector weights (as of Sep 17)". */
export function fundExposureContext(weightSetAsOf: string | null, throughEtfs: boolean) {
  const asOf = weightSetAsOf ? ` (as of ${fmtDate(weightSetAsOf).replace(/, \d{4}$/, "")})` : "";
  return `Today's positions${throughEtfs ? ", ETFs split into their holdings," : ""} by GICS sector against the S&P 500 sector weights${asOf}`;
}

/** A label with its explainer, for stat-strip cells. */
function Label({ children, explain }: { children: string; explain: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <InfoTip label={children}>{explain}</InfoTip>
    </span>
  );
}

/**
 * The body of the Exposure page, shared by the Fund, team and preview routes. It reads the same risk report as the
 * Risk page, so every weight matches it. First screen: the view switch, four headline numbers, sector weights against
 * the benchmark, the largest active bets and factor tilts. Below the fold: the sector table, the largest positions,
 * factor detail, the ETF look-through, the link to active risk and how it is calculated.
 */
export function ExposureView({
  report: r,
  transparency,
  basePath,
  riskPath,
  exportQuery,
  scopeLabel,
  benchmarkLabel,
  weightSetAsOf,
  controls,
  context,
  notices,
  teams,
  lookthrough,
  throughEtfs = false,
  query = "",
  factorBenchmarkLabel,
}: {
  report: RiskReport;
  transparency: boolean;
  basePath: string;
  /** The matching Risk page, for the active-risk link. */
  riskPath: string;
  /** Extra query for the CSV downloads, e.g. "&team=tech". */
  exportQuery: string;
  scopeLabel: string;
  benchmarkLabel: string;
  weightSetAsOf: string | null;
  /** The Direct holdings / Through ETFs switch. Keep it as links carrying `lookback`. */
  controls?: React.ReactNode;
  /** The toolbar's one-line description of what is compared. */
  context: React.ReactNode;
  /** Data notices button. */
  notices?: React.ReactNode;
  teams: TeamNames;
  /** ETF look-through: company-level bets, Active Share, and sector weights through the ETFs. */
  lookthrough?: LookthroughState | null;
  /** Show sector weights through the ETFs (needs `lookthrough`). */
  throughEtfs?: boolean;
  /** Extra query the lookback links carry, e.g. "&sectors=etf". */
  query?: string;
  /** How the factor section names the benchmark, e.g. "the S&P 500 sector benchmark". */
  factorBenchmarkLabel?: string;
}) {
  const lt = lookthrough?.state === "ok" ? lookthrough : null;
  const x = buildExposure(r, { through: throughEtfs && lt ? lt.report : null });
  const stockLevel = lt?.report.active ?? null;
  const active = activeRiskBreakdown(r);
  const fund = r.scope === "fund";
  const benchShort = fund ? "S&P 500" : benchmarkLabel;
  const download = (file: string, label: string) => (
    <a href={`/api/risk/export?file=${file}&lookback=${r.lookback}${exportQuery}`} className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2" download>
      <Download className="size-3" aria-hidden />
      {label}
    </a>
  );
  const bet = x.largestBet;

  return (
    <>
      <OpenDetailsOnHash />
      <div className={FIRST_SCREEN}>
        <div data-tour="exposure-toolbar" className="flex min-w-0 shrink-0 items-center gap-2.5">
          {controls}
          <span className="truncate text-[13px] text-muted-foreground">{context}</span>
          <span className="flex-1" />
          {notices}
          <LookbackSelector basePath={basePath} active={r.lookback} extra={query} />
        </div>

        <section aria-label="Headline exposure" className="shrink-0">
          <StatStrip
            cells={[
              {
                label: <Label explain={RISK_EXPLAIN.activeShare}>Active share</Label>,
                value: stockLevel ? rpct(stockLevel.activeShare, 0) : "—",
                note: stockLevel ? `vs ${lt?.benchmarkLabel === "SPY" ? "S&P 500" : (lt?.benchmarkLabel ?? benchShort)}` : "needs the benchmark's holdings",
              },
              {
                label: <Label explain={RISK_EXPLAIN.top10}>{`Top ${x.top.holdings.length} weight`}</Label>,
                value: rpct(x.top.weight),
                note: fund ? "of NAV" : "of the team's holdings",
              },
              {
                label: <Label explain={RISK_EXPLAIN.largestActiveBet}>Largest active sector</Label>,
                value: bet && bet.active !== null ? `${bet.active > 0 ? "+" : ""}${(bet.active * 100).toFixed(1)} pp` : "—",
                note: bet && bet.active !== null ? bet.label : "Add S&P 500 sector weights",
              },
              {
                label: <Label explain={RISK_EXPLAIN.cash}>Cash</Label>,
                value: fund ? rpct(x.cash.weight) : "—",
                note: fund ? `${rusd(x.cash.value)} · not in any sector` : "Cash is held at Fund level",
              },
            ]}
          />
        </section>

        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <SectorWeightsPanel x={x} benchShort={benchShort} />
          <div className="flex min-h-0 flex-col gap-5">
            <ActiveBetsPanel report={r} x={x} lookthrough={lookthrough ?? null} teams={teams} benchShort={benchShort} className="min-h-0 flex-1" />
            <FactorTiltsPanel report={r} className="shrink-0" />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8">
        <details id="sector-detail" className="group scroll-mt-4">
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 select-none [&::-webkit-details-marker]:hidden">
            <h2 className="text-[14.5px] font-semibold">
              <span className="mr-1.5 inline-block text-muted-foreground transition-transform group-open:rotate-90">›</span>
              Sector table: exact weights, holdings in each sector and share of risk
            </h2>
            <span className="text-[12.5px] text-muted-foreground">
              {x.throughEtfs ? "Through ETFs · " : ""}
              {x.hasBenchmark ? `Largest overweight first · vs ${benchmarkLabel}` : "By weight · no benchmark saved"}
            </span>
          </summary>
          <div className="mt-2.5">
            {x.throughEtfs && lt && (
              <p className="mb-2 text-xs text-muted-foreground">
                <Explained label="Each ETF split into its holdings">{RISK_EXPLAIN.throughEtfSectors}</Explained>. Risk shares are measured on the ETFs as held, so they&apos;re in the Direct holdings view.
                {lt.report.notLookedThrough.total > 5e-5 && <> {rpct(lt.report.notLookedThrough.total, 2)} not looked through stays in its ETF&apos;s sector.</>}
              </p>
            )}
            <SectorExposure
              sectors={x.sectors}
              benchmarkLabel={benchmarkLabel}
              activeFirst
              balance={{ overweight: x.overweight, underweight: x.underweight }}
              hideRisk={x.throughEtfs}
              rowNote={x.throughEtfs && lt ? (key) => {
                const s = lt.report.sectors.find((v) => v.key === key);
                if (!s) return null;
                const parts = [`as held ${rpct(s.asHeld)}`, ...(s.assumed > 5e-5 ? [`${rpct(s.assumed, 2)} assumed`] : [])];
                return parts.join(" · ");
              } : undefined}
            />
            {transparency && bet && <BetWorking x={x} />}
          </div>
        </details>

        <ExposureSection
          id="positions"
          title="Largest positions"
          explain={RISK_EXPLAIN.top10}
          aside={
            <span className="inline-flex flex-wrap items-center gap-x-1">
              {x.top.holdings.length} of {x.holdingsCount} holdings{x.top.holdings.length > 5 && <> · top 5 {rpct(r.portfolio.top5)}</>} ·{" "}
              <Explained label={`effective positions ${rnum(x.effectiveN, 1)}`}>{RISK_EXPLAIN.effectiveN}</Explained>
            </span>
          }
        >
          <TopPositions x={x} report={r} />
          {transparency && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <TopWorking x={x} />
              <ConcentrationWorking r={r} />
              {fund && (
                <Working title="Cash: working">
                  <Step label="Cash ÷ NAV">{rusdFull(x.cash.value)} ÷ {rusdFull(r.nav)} = <b>{rpct(x.cash.weight, 2)}</b></Step>
                  <Source>the ledger&apos;s cash balance at the {fmtDate(r.asOf)} close.</Source>
                </Working>
              )}
            </div>
          )}
        </ExposureSection>

        <FactorSection report={r} transparency={transparency} exportQuery={exportQuery} benchmarkLabel={factorBenchmarkLabel ?? benchmarkLabel} />

        <LookthroughSections state={lookthrough ?? null} scope={r.scope} transparency={transparency} sectorBet={bet} />

        <Card className="gap-1.5 p-4">
          <div className="text-[14.5px] font-semibold">Where the active risk comes from</div>
          <p className="text-[13px] text-ink-2">
            {active
              ? <>Tracking error is {rpct(active.trackingError, 2)}. {active.sentences[0]} </>
              : "Tracking error needs benchmark sector weights. "}
            <Link href={`${riskPath}?lookback=${r.lookback}#${ACTIVE_RISK_ANCHOR}`} className="font-medium text-foreground hover:underline">See each holding&apos;s share and marginal tracking error on Risk →</Link>
          </p>
        </Card>

        <details className="rounded-[14px] bg-band-2 shadow-[0_0_0_1px_var(--border)]">
          <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-medium text-ink-2 select-none hover:text-foreground">How this is calculated, and the data behind it</summary>
          <div className="grid gap-3 border-t border-row px-4 py-4 text-xs leading-relaxed text-muted-foreground">
            <p>
              Weights are today&apos;s positions (the trade ledger replayed to the {fmtDate(r.asOf)} close) as a share of {fund ? "NAV, cash included" : `the ${scopeLabel}'s holdings, scaled to 100%`}.
              The benchmark is {fund ? (weightSetAsOf ? `the S&P 500 sector weights saved ${fmtDate(weightSetAsOf)}, drifted to today by the Select Sector SPDR ETFs' returns` : "the saved S&P 500 sector weights, drifted to today") : `the team's own sectors (${benchmarkLabel}), rescaled to 100%`},
              the same weights the Risk and Attribution pages use. Active weight is the portfolio&apos;s weight minus the benchmark&apos;s. Share of risk and of active risk
              come from the Risk page&apos;s model over the selected window ({r.window.days} trading days); weights don&apos;t depend on the window.
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Download:</span>
              {download("exposure", "Sectors and headline numbers")}
              {download("positions", "Positions")}
              {lt && download("lookthrough", "ETF look-through")}
            </p>
            <p>
              To check in Excel: sum the positions file&apos;s <code>weight</code> column by <code>sector</code> for each sector&apos;s weight, and subtract the exposure file&apos;s
              <code> benchmark_weight</code> for its active weight. <code>=LARGE(weights, 1)</code> through <code>LARGE(weights, 10)</code> summed give the top-10 weight.
            </p>
          </div>
        </details>
      </div>
    </>
  );
}

function BetWorking({ x }: { x: Exposure }) {
  const bet = x.largestBet!;
  const next = x.sectors.filter((s) => s.key !== "cash" && s.key !== bet.key && s.active !== null).sort((a, b) => Math.abs(b.active!) - Math.abs(a.active!))[0];
  return (
    <Working className="mt-2" title="Largest active sector: working">
      <Step label={bet.label}>
        portfolio {rpct(bet.weight, 2)} − benchmark {rpct(bet.benchWeight, 2)} = <b>{rpp(bet.active! * 100, 2)}</b>
      </Step>
      {bet.tickers.length > 0 && <Step label="Holdings">{bet.tickers.join(", ")}</Step>}
      {next && <Step label="Next largest">{next.label} {rpp(next.active! * 100, 2)}</Step>}
      <Source>the largest absolute active weight among the sectors in the table above; cash is shown on its own.</Source>
    </Working>
  );
}

function TopWorking({ x }: { x: Exposure }) {
  return (
    <Working title={`Top ${x.top.holdings.length} weight: working`}>
      <Step>{x.top.holdings.map((h) => rpct(h.weight, 2)).join(" + ")} = <b>{rpct(x.top.weight, 2)}</b></Step>
      <Source>the {x.top.holdings.length} largest weights in the table above.</Source>
    </Working>
  );
}

function TopPositions({ x, report: r }: { x: Exposure; report: RiskReport }) {
  const max = x.top.holdings[0]?.weight ?? 0;
  const sector = new Map(r.holdings.map((h) => [h.ticker, h.sector]));
  const cumulative = x.top.holdings.map((_, i) => x.top.holdings.slice(0, i + 1).reduce((t, h) => t + h.weight, 0));
  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Holding</TableHead>
            <TableHead>Weight</TableHead>
            <TableHead className="text-right">Cumulative</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {x.top.holdings.map((h, i) => {
            const s = sector.get(h.ticker);
            return (
              <TableRow key={h.ticker}>
                <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <span className="font-mono font-semibold">{h.ticker}</span>
                  <div className="max-w-32 truncate text-[11px] text-muted-foreground sm:max-w-52">{h.name}{s ? ` · ${SECTOR_LABELS[s]}` : ""}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <MagnitudeBar value={h.weight} max={max} color="var(--foreground)" className="h-1.5 w-12 sm:w-24" />
                    <span className="w-12 font-mono text-xs">{rpct(h.weight)}</span>
                  </div>
                </TableCell>
                <TableCell className={cn("text-right font-mono text-[12.5px]", i === x.top.holdings.length - 1 && "font-semibold")}>{rpct(cumulative[i])}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {x.holdingsCount > x.top.holdings.length && (
          <TableFooter>
            <TableRow>
              <TableCell />
              <TableCell className="text-xs text-muted-foreground">Other {x.holdingsCount - x.top.holdings.length} holdings</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{rpct(x.invested - x.top.weight)}</TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">{rpct(x.invested)} invested</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </Card>
  );
}
