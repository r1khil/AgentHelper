import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/app/page-head";
import { Hero } from "@/components/app/portfolio/hero";
import { HowNote, ShareBar } from "@/components/app/portfolio/parts";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtChangeBp, fmtDate, fmtDay } from "@/lib/format";
import { activeRiskBreakdown } from "@/lib/risk/active";
import { buildExposure, type Exposure } from "@/lib/risk/exposure";
import type { LookthroughState } from "@/lib/risk/lookthrough-report";
import type { RiskReport } from "@/lib/risk/model";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { cn } from "@/lib/utils";
import { HeroNotes, type QualityNotice } from "../attribution/data-quality-notice";
import { Explained, Tip } from "../attribution/info-tip";
import { ACTIVE_RISK_ANCHOR } from "../risk/active-risk";
import { RISK_EXPLAIN } from "../risk/explainers";
import { rbp, rnum, rpct, rusdFull } from "../risk/format";
import type { TeamNames } from "../risk/holdings-risk-table";
import { OpenDetailsOnHash } from "../risk/open-on-hash";
import { ConcentrationWorking } from "../risk/risk-working";
import { SectorExposure } from "../risk/sector-exposure";
import { Source, Step, Working } from "../risk/working";
import { ActiveBetsPanel, Concentration, FactorTilts, PositionsAfterLookthrough, SectorTilts } from "./exposure-panels";
import { ExposureSection } from "./exposure-section";
import { FactorSection } from "./factor-section";
import { LookThroughSwitch } from "./look-through-switch";
import { LookthroughSections, sectorViewQuery } from "./lookthrough";

export { ExposureSection };

/** The Fund's context line, e.g. "Today's positions by GICS sector against the S&P 500 sector weights (as of Sep 17)". */
export function fundExposureContext(weightSetAsOf: string | null, throughEtfs: boolean) {
  const asOf = weightSetAsOf ? ` (as of ${fmtDay(weightSetAsOf)})` : "";
  return `Today's positions${throughEtfs ? ", ETFs split into their holdings," : ""} by GICS sector against the S&P 500 sector weights${asOf}`;
}

/**
 * The body of the Exposure page, shared by the Fund, team and preview routes. It reads the same risk report as the
 * Risk page, so every weight matches it. It opens on active share and the sectors that make it up, with the factor
 * tilts and concentration beside; then the largest positions after look-through, the largest active bets, and below
 * them the detail: the sector table with the holdings in each sector and their share of risk, the factor regressions,
 * the ETF look-through tables, the link to active risk and how it is calculated.
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
  /** The one-line description of what is compared, under the sector table. */
  context: React.ReactNode;
  /** The model's data notices, each with the place to fix it. */
  notices?: QualityNotice[];
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
    <a href={`/api/risk/export?file=${file}&lookback=${r.lookback}${exportQuery}`} className="inline-flex items-center gap-1 font-semibold text-foreground underline underline-offset-2" download>
      <Download className="size-3" aria-hidden />
      {label}
    </a>
  );
  const bet = x.largestBet;

  // The sectors furthest from the benchmark either way, for the line under the big number.
  const tilts = x.sectors.filter((s) => s.key !== "cash" && s.active !== null);
  const byAbs = [...tilts].sort((a, b) => Math.abs(b.active!) - Math.abs(a.active!));
  const first = byAbs[0];
  const second = byAbs[1];
  const under = [...tilts].sort((a, b) => a.active! - b.active!)[0];
  const showUnder = under && under.active! < 0 && under !== first && under !== second;
  const bp = (v: number | null) => fmtChangeBp((v ?? 0) * 10_000);

  const asOfLists = lt ? lt.report.etfs.map((e) => e.asOf).filter((d): d is string => !!d).sort().at(-1) : null;
  const switchNote = lt ? `${lt.report.etfs.length} ETFs split from issuer files` : "No ETF holdings lists are stored yet";
  const switchHref = `${basePath}?lookback=${r.lookback}${sectorViewQuery(!throughEtfs)}`;
  const benchName = lt?.benchmarkLabel === "SPY" ? "S&P 500" : (lt?.benchmarkLabel ?? benchShort);

  return (
    <>
      <OpenDetailsOnHash />
      <PageHead
        crumbs={[{ label: "Portfolio" }]}
        scope
        asof={asOfLists ? `Today's weights · ETF holdings as of ${fmtDay(asOfLists)}` : `Today's weights · closes through ${fmtDay(r.asOf)}`}
        actions={
          <Button variant="secondary" nativeButton={false} render={<a href={`/api/risk/export?file=exposure&lookback=${r.lookback}${exportQuery}`} download />}>
            <Download aria-hidden />
            Export CSV
          </Button>
        }
      />
      <div data-tour="exposure-toolbar">
        <Hero
          label={
            stockLevel ? (
              <Tip label={`Active share vs ${benchName}`}>{RISK_EXPLAIN.activeShare}</Tip>
            ) : (
              <Tip label="Sector active share">The share of the portfolio positioned differently from the benchmark at sector level: the sum of the overweights, which equals the sum of the underweights. The company-level Active Share needs the benchmark&apos;s holdings.</Tip>
            )
          }
          value={stockLevel ? rpct(stockLevel.activeShare, 1) : x.overweight !== null ? rpct(x.overweight, 1) : "—"}
          change={first ? <span className="text-foreground">Largest tilt {first.label} {bp(first.active)}</span> : undefined}
          note={
            first ? (
              <>
                {second && <>· then {second.label} {bp(second.active)} </>}
                {showUnder && <>· most underweight {under.label} ({rnum(Math.abs(under.active!) * 10_000, 0)} bp)</>}
              </>
            ) : (
              "Add S&P 500 sector weights to compare against the benchmark."
            )
          }
          aside={
            <div className="flex shrink-0 flex-col items-end gap-3">
              <HeroNotes notices={notices ?? []} />
              <LookThroughSwitch on={throughEtfs} available={lt !== null} href={switchHref} note={switchNote} />
            </div>
          }
        />
      </div>

      <div className="mt-[30px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14 border-t pt-[22px]">
        <SectorTilts x={x} benchShort={benchShort} weightSetAsOf={fund ? weightSetAsOf : null} />
        <div className="flex flex-col gap-[30px]">
          <FactorTilts report={r} basePath={basePath} query={query} />
          <Concentration x={x} report={r} />
        </div>
      </div>

      <PositionsAfterLookthrough x={x} report={r} lookthrough={lookthrough ?? null} />
      <ActiveBetsPanel report={r} x={x} lookthrough={lookthrough ?? null} teams={teams} benchShort={benchShort} />

      {/* One column no wider than the page: a wide table below scrolls inside its own block instead of widening the page. */}
      <div className="mt-[34px] grid grid-cols-[minmax(0,1fr)] gap-[34px]">
        <details id="sector-detail" className="group min-w-0 scroll-mt-4 border-t">
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 py-3 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <h2 className="text-title font-bold tracking-[-0.01em]">
              <span className="mr-1.5 inline-block text-muted-foreground transition-transform group-open:rotate-90">›</span>
              Sector table: exact weights, holdings in each sector and share of risk
            </h2>
            <span className="text-caption text-muted-foreground">
              {x.throughEtfs ? "Through ETFs · " : ""}
              {x.hasBenchmark ? `Largest overweight first · vs ${benchmarkLabel}` : "By weight · no benchmark saved"}
            </span>
          </summary>
          <div className="mt-1">
            <p className="mb-2 text-caption text-muted-foreground">{context}</p>
            {x.throughEtfs && lt && (
              <p className="mb-2 text-body text-muted-foreground">
                <Explained label="Each ETF split into its holdings">{RISK_EXPLAIN.throughEtfSectors}</Explained>. Risk shares are measured on the ETFs as held, so they&apos;re in the Direct holdings view.
                {lt.report.notLookedThrough.total > 5e-5 && <> {rpct(lt.report.notLookedThrough.total, 2)} not looked through stays in its ETF&apos;s sector.</>}
              </p>
            )}
            <SectorExposure
              sectors={x.sectors}
              benchmarkLabel={benchmarkLabel}
              balance={{ overweight: x.overweight, underweight: x.underweight }}
              hideRisk={x.throughEtfs}
              rowNote={
                x.throughEtfs && lt
                  ? (key) => {
                      const s = lt.report.sectors.find((v) => v.key === key);
                      if (!s) return null;
                      const parts = [`as held ${rpct(s.asHeld)}`, ...(s.assumed > 5e-5 ? [`${rpct(s.assumed, 2)} assumed`] : [])];
                      return parts.join(" · ");
                    }
                  : undefined
              }
            />
            {transparency && bet && <BetWorking x={x} />}
          </div>
        </details>

        <ExposureSection
          id="positions-held"
          title="Largest positions, as held"
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
            <div className="mt-2 grid gap-x-8 gap-y-1 lg:grid-cols-2">
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

        <section aria-labelledby="exp-active-risk" className="border-t pt-3">
          <h2 id="exp-active-risk" className="text-title font-bold tracking-[-0.01em]">Where the active risk comes from</h2>
          <p className="mt-1 text-body text-ink-2">
            {active ? <>Tracking error is {rpct(active.trackingError, 2)}. {active.sentences[0]} </> : "Tracking error needs benchmark sector weights. "}
            <Link href={`${riskPath}?lookback=${r.lookback}#${ACTIVE_RISK_ANCHOR}`} className="font-semibold text-foreground hover:underline">See each holding&apos;s share and marginal tracking error on Risk →</Link>
          </p>
        </section>

        <details className="group border-t">
          <summary className="cursor-pointer py-3 text-body font-semibold text-ink-2 select-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">How this is calculated, and the data behind it</summary>
          <div className="grid gap-3 pb-2 text-body leading-relaxed text-muted-foreground">
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
      <HowNote>
        Sectors are GICS{lt ? `; ETFs are split using the issuer's holdings file${asOfLists ? ` from ${fmtDate(asOfLists)}` : ""}` : ""}. Active share is half the sum of the absolute weight differences from the benchmark{lt ? ", after look-through" : ", here by sector"}. Factor betas come from a
        regression of daily returns on the factor ETFs over the window chosen above the factor tilts.
      </HowNote>
    </>
  );
}

function BetWorking({ x }: { x: Exposure }) {
  const bet = x.largestBet!;
  const next = x.sectors.filter((s) => s.key !== "cash" && s.key !== bet.key && s.active !== null).sort((a, b) => Math.abs(b.active!) - Math.abs(a.active!))[0];
  return (
    <Working className="mt-2" title="Largest active sector: working">
      <Step label={bet.label}>
        portfolio {rpct(bet.weight, 2)} − benchmark {rpct(bet.benchWeight, 2)} = <b>{rbp(bet.active)}</b>
      </Step>
      {bet.tickers.length > 0 && <Step label="Holdings">{bet.tickers.join(", ")}</Step>}
      {next && <Step label="Next largest">{next.label} {rbp(next.active)}</Step>}
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
    <div className="overflow-x-auto">
      <Table aria-label="Largest positions as held">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 text-caption first:pl-0">#</TableHead>
            <TableHead className="text-caption">Holding</TableHead>
            <TableHead className="text-caption">Weight</TableHead>
            <TableHead className="text-right text-caption last:pr-0">Cumulative</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {x.top.holdings.map((h, i) => {
            const s = sector.get(h.ticker);
            return (
              <TableRow key={h.ticker}>
                <TableCell className="text-body text-muted-foreground first:pl-0">{i + 1}</TableCell>
                <TableCell>
                  <span className="font-semibold">{h.ticker}</span>
                  <div className="max-w-52 text-caption whitespace-normal text-muted-foreground">{h.name}{s ? ` · ${SECTOR_LABELS[s]}` : ""}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ShareBar value={h.weight} max={max} className="w-24" />
                    <span className="w-12">{rpct(h.weight)}</span>
                  </div>
                </TableCell>
                <TableCell className={cn("text-right last:pr-0", i === x.top.holdings.length - 1 && "font-semibold")}>{rpct(cumulative[i])}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {x.holdingsCount > x.top.holdings.length && (
          <TableFooter className="bg-transparent">
            <TableRow>
              <TableCell className="first:pl-0" />
              <TableCell className="text-body text-muted-foreground">Other {x.holdingsCount - x.top.holdings.length} holdings</TableCell>
              <TableCell className="text-body text-muted-foreground">{rpct(x.invested - x.top.weight)}</TableCell>
              <TableCell className="text-right text-body text-muted-foreground last:pr-0">{rpct(x.invested)} invested</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
