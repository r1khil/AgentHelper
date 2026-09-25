import Link from "next/link";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { activeRiskBreakdown } from "@/lib/risk/active";
import { buildExposure, type Exposure } from "@/lib/risk/exposure";
import type { LookthroughState } from "@/lib/risk/lookthrough-report";
import type { RiskReport } from "@/lib/risk/model";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { cn } from "@/lib/utils";
import { MagnitudeBar } from "../attribution/bars";
import { Explained } from "../attribution/info-tip";
import { Move } from "../move";
import { ACTIVE_RISK_ANCHOR, rpp } from "../risk/active-risk";
import { RISK_EXPLAIN } from "../risk/explainers";
import { rnum, rpct, rusd, rusdFull } from "../risk/format";
import { ConcentrationWorking } from "../risk/risk-working";
import { LookbackSelector } from "../risk/risk-view";
import { SectorExposure } from "../risk/sector-exposure";
import { StatCard } from "../risk/stat-card";
import { Source, Step, Working } from "../risk/working";
import { ActiveShareCard, StockBetCard } from "./lookthrough-cards";

/**
 * A titled, anchor-linkable block on the Exposure page. Every section uses it, so later ones (factor sensitivities,
 * ETF look-through) slot in with the same spacing and can be linked to as `/exposure#<id>`.
 */
export function ExposureSection({ id, title, explain, aside, children }: { id: string; title: string; explain: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={title} className="mb-6 scroll-mt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold"><Explained label={title}>{explain}</Explained></h2>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * The body of the Exposure page, shared by the Fund, team and preview routes. It reads the same risk report as the
 * Risk page, so every weight matches it. Order: toolbar, headline cards, sectors, largest positions, `children`
 * (extra sections), the link to active risk, then how it is calculated.
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
  children,
  lookthrough,
  throughEtfs = false,
  query = "",
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
  /** Extra toolbar controls beside the lookback selector (e.g. a view toggle). Keep them as links carrying `lookback`. */
  controls?: React.ReactNode;
  /** Extra sections, rendered after the built-in ones; wrap each in ExposureSection. */
  children?: React.ReactNode;
  /** ETF look-through: with it the headline shows the stock-level bet and Active Share, and sectors can be shown through ETFs. */
  lookthrough?: LookthroughState | null;
  /** Show sector weights through the ETFs (needs `lookthrough`). */
  throughEtfs?: boolean;
  /** Extra query the lookback links carry, e.g. "&sectors=etf". */
  query?: string;
}) {
  const lt = lookthrough?.state === "ok" ? lookthrough : null;
  const x = buildExposure(r, { through: throughEtfs && lt ? lt.report : null });
  const stockLevel = lt?.report.active ? lt : null;
  const active = activeRiskBreakdown(r);
  const fund = r.scope === "fund";
  const download = (file: string, label: string) => (
    <a href={`/api/risk/export?file=${file}&lookback=${r.lookback}${exportQuery}`} className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2" download>
      <Download className="size-3" aria-hidden />
      {label}
    </a>
  );
  const bet = x.largestBet;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <LookbackSelector basePath={basePath} active={r.lookback} extra={query} />
          {controls}
        </div>
        <div className="text-xs text-muted-foreground">Positions at the {fmtDate(r.asOf)} close · risk shares over {r.window.days} trading days</div>
      </div>

      <section aria-label="Headline exposure" className={cn("mb-6 grid items-start gap-4 sm:grid-cols-2", stockLevel ? "lg:grid-cols-3 2xl:grid-cols-6" : "lg:grid-cols-4")}>
        {stockLevel ? (
          <>
            <StockBetCard lt={stockLevel.report} sectorBet={bet} benchmarkLabel={stockLevel.benchmarkLabel ?? "the benchmark"} transparency={transparency} className="sm:col-span-2" />
            <ActiveShareCard lt={stockLevel.report} benchmarkLabel={stockLevel.benchmarkLabel ?? "the benchmark"} transparency={transparency} />
          </>
        ) : (
        <StatCard
          label="Largest active bet"
          explain={RISK_EXPLAIN.largestActiveBet}
          value={bet && bet.active !== null ? <Move value={bet.active * 100} unit=" pp" digits={1} /> : "—"}
          caption={
            bet && bet.active !== null ? (
              <>
                <span className="font-medium text-foreground">{bet.label}</span>
                <br />
                {rpct(bet.weight)} vs {rpct(bet.benchWeight)} in {bet.etf ?? "the benchmark"} · by sector
              </>
            ) : (
              "Add S&P 500 sector weights"
            )
          }
          working={transparency && bet ? <BetWorking x={x} /> : undefined}
        />
        )}
        <StatCard
          label={`Top ${x.top.holdings.length} weight`}
          explain={RISK_EXPLAIN.top10}
          value={rpct(x.top.weight)}
          caption={<>of {fund ? "NAV" : "the team's holdings"}{x.top.holdings.length > 5 && <> · top 5 {rpct(r.portfolio.top5)}</>}</>}
          working={transparency ? <TopWorking x={x} /> : undefined}
        />
        <StatCard
          label="Effective positions"
          explain={RISK_EXPLAIN.effectiveN}
          value={rnum(x.effectiveN, 1)}
          caption={`of ${x.holdingsCount} holdings`}
          working={transparency ? <ConcentrationWorking r={r} /> : undefined}
        />
        <StatCard
          label="Cash"
          explain={RISK_EXPLAIN.cash}
          value={fund ? rpct(x.cash.weight) : "—"}
          caption={fund ? rusd(x.cash.value) : "Cash is held at Fund level"}
          working={transparency && fund ? (
            <Working>
              <Step label="Cash ÷ NAV">{rusdFull(x.cash.value)} ÷ {rusdFull(r.nav)} = <b>{rpct(x.cash.weight, 2)}</b></Step>
              <Source>the ledger&apos;s cash balance at the {fmtDate(r.asOf)} close.</Source>
            </Working>
          ) : undefined}
        />
      </section>

      <ExposureSection
        id="sectors"
        title="Sectors against the benchmark"
        explain={RISK_EXPLAIN.exposure}
        aside={`${x.throughEtfs ? "Through ETFs · " : ""}${x.hasBenchmark ? `Largest overweight first · vs ${benchmarkLabel}` : "By weight · no benchmark saved"}`}
      >
        {x.throughEtfs && lt && (
          <p className="mb-2 text-xs text-muted-foreground">
            <Explained label="Each ETF split into its holdings">{RISK_EXPLAIN.throughEtfSectors}</Explained>. Risk shares are measured on the ETFs as held, so they&apos;re in the as-held view.
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
      </ExposureSection>

      <ExposureSection id="positions" title="Largest positions" explain={RISK_EXPLAIN.top10} aside={`${x.top.holdings.length} of ${x.holdingsCount} holdings`}>
        <TopPositions x={x} report={r} />
      </ExposureSection>

      {children}

      <Card className="mb-6 gap-1.5 p-4">
        <div className="text-sm font-semibold">Where the active risk comes from</div>
        <p className="text-sm text-muted-foreground">
          {active
            ? <>Tracking error is {rpct(active.trackingError, 2)}. {active.sentences[0]} </>
            : "Tracking error needs benchmark sector weights. "}
          <Link href={`${riskPath}?lookback=${r.lookback}#${ACTIVE_RISK_ANCHOR}`} className="font-medium text-foreground hover:underline">See each holding&apos;s share and marginal tracking error on Risk →</Link>
        </p>
      </Card>

      <details className="rounded-xl bg-muted/40 ring-1 ring-foreground/10">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">How this is calculated, and the data behind it</summary>
        <div className="grid gap-3 px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            Weights are today&apos;s positions (the trade ledger replayed to the {fmtDate(r.asOf)} close) as a share of {fund ? "NAV, cash included" : `the ${scopeLabel}'s holdings, scaled to 100%`}.
            The benchmark is {fund ? (weightSetAsOf ? `the S&P 500 sector weights saved ${fmtDate(weightSetAsOf)}, drifted to today by the Select Sector SPDR ETFs' returns` : "the saved S&P 500 sector weights, drifted to today") : `the team's own sectors (${benchmarkLabel}), rescaled to 100%`},
            the same weights the Risk and Attribution pages use. Active weight is the portfolio&apos;s weight minus the benchmark&apos;s. Share of risk and of active risk
            come from the Risk page&apos;s model over the selected window; weights don&apos;t depend on the window.
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
    </>
  );
}

function BetWorking({ x }: { x: Exposure }) {
  const bet = x.largestBet!;
  const next = x.sectors.filter((s) => s.key !== "cash" && s.key !== bet.key && s.active !== null).sort((a, b) => Math.abs(b.active!) - Math.abs(a.active!))[0];
  return (
    <Working>
      <Step label={bet.label}>
        portfolio {rpct(bet.weight, 2)} − benchmark {rpct(bet.benchWeight, 2)} = <b>{rpp(bet.active! * 100, 2)}</b>
      </Step>
      {bet.tickers.length > 0 && <Step label="Holdings">{bet.tickers.join(", ")}</Step>}
      {next && <Step label="Next largest">{next.label} {rpp(next.active! * 100, 2)}</Step>}
      <Source>the largest absolute active weight among the sectors in the table below; cash is shown on its own.</Source>
    </Working>
  );
}

function TopWorking({ x }: { x: Exposure }) {
  return (
    <Working>
      <Step>{x.top.holdings.map((h) => rpct(h.weight, 2)).join(" + ")} = <b>{rpct(x.top.weight, 2)}</b></Step>
      <Source>the {x.top.holdings.length} largest weights in the table below.</Source>
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
                <TableCell className="tnum text-xs text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <span className="font-medium">{h.ticker}</span>
                  <div className="max-w-32 truncate text-[11px] text-muted-foreground sm:max-w-52">{h.name}{s ? ` · ${SECTOR_LABELS[s]}` : ""}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <MagnitudeBar value={h.weight} max={max} className="h-1.5 w-12 sm:w-24" />
                    <span className="tnum w-12 text-xs">{rpct(h.weight)}</span>
                  </div>
                </TableCell>
                <TableCell className={cn("tnum text-right text-sm", i === x.top.holdings.length - 1 && "font-semibold")}>{rpct(cumulative[i])}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {x.holdingsCount > x.top.holdings.length && (
          <TableFooter>
            <TableRow>
              <TableCell />
              <TableCell className="text-xs text-muted-foreground">Other {x.holdingsCount - x.top.holdings.length} holdings</TableCell>
              <TableCell className="tnum text-xs text-muted-foreground">{rpct(x.invested - x.top.weight)}</TableCell>
              <TableCell className="tnum text-right text-xs text-muted-foreground">{rpct(x.invested)} invested</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </Card>
  );
}
