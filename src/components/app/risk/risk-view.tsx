import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented, StatStrip } from "@/components/app/panel";
import { fmtDate } from "@/lib/format";
import { LOOKBACKS, MIN_OBSERVATIONS, MIN_REALIZED_DAYS, type LookbackKey, type RiskReport } from "@/lib/risk/model";
import { cn } from "@/lib/utils";
import { Explained, InfoTip } from "../attribution/info-tip";
import { ActiveRiskSection } from "./active-risk";
import { CorrelationHeatmap } from "./correlation-heatmap";
import { DrawdownChart } from "./drawdown-chart";
import { RISK_EXPLAIN } from "./explainers";
import { rnum, rpct, rusd } from "./format";
import { HoldingsRiskTable, type TeamNames } from "./holdings-risk-table";
import { OpenDetailsOnHash } from "./open-on-hash";
import { RiskSources } from "./risk-sources";
import { BetaWorking, ConcentrationWorking, CoverageTable, StressWorking, TeWorking, VarWorking, VolWorking } from "./risk-working";
import { SectionHead } from "./section-head";
import { SectorExposure } from "./sector-exposure";

const TOP_HOLDINGS = 10;
/** Short label for a lookback on the segmented control, e.g. "1Y". */
export const lookbackShort = (k: LookbackKey) => k.toUpperCase();

/** A label with its explainer, for stat-strip cells. */
function Label({ children, explain }: { children: string; explain: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <InfoTip label={children}>{explain}</InfoTip>
    </span>
  );
}

export function LookbackSelector({ basePath, active, extra = "" }: { basePath: string; active: LookbackKey; extra?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Segmented
        mono
        label="Lookback window"
        segments={(Object.keys(LOOKBACKS) as LookbackKey[]).map((k) => ({ key: k, label: lookbackShort(k), title: LOOKBACKS[k].label, href: `${basePath}?lookback=${k}${extra}`, active: k === active }))}
      />
      <InfoTip label="the lookback window">{RISK_EXPLAIN.lookback}</InfoTip>
    </div>
  );
}

/** One window of the page: panels stretch to the bottom of the viewport, the detail follows below the fold. */
export const FIRST_SCREEN = "flex flex-col gap-4";

/**
 * The body of the Risk page, shared by the Fund and team views. The first screen is the toolbar, the five headline
 * numbers, where the risk comes from and the stress tests; everything else follows below the fold. Tooltips explain
 * every figure; transparency mode adds each headline number's working and the data coverage table.
 */
export function RiskView({
  report: r,
  inception,
  weightSetAsOf,
  transparency,
  basePath,
  exportQuery,
  teams,
  scopeLabel,
  benchmarkLabel,
  showAll,
  context,
  notices,
  stressPanel,
  stress,
}: {
  report: RiskReport;
  inception: string;
  weightSetAsOf: string | null;
  transparency: boolean;
  basePath: string;
  /** Extra query for the CSV downloads, e.g. "&team=tech". */
  exportQuery: string;
  teams: TeamNames;
  scopeLabel: string;
  benchmarkLabel: string;
  showAll: boolean;
  /** The toolbar's one-line description of what is measured. */
  context: React.ReactNode;
  /** Data notices button, beside Export CSV. */
  notices?: React.ReactNode;
  /** The stress-test summary panel (streamed in; it reads older stored closes). Gets `flex-1`-style sizing from the grid. */
  stressPanel?: React.ReactNode;
  /** The stress-test detail below the fold, streamed in separately. */
  stress?: React.ReactNode;
}) {
  const p = r.portfolio;
  const rows = showAll ? r.holdings : r.holdings.slice(0, TOP_HOLDINGS);
  const topShare = r.holdings.slice(0, 3).reduce((s, h) => s + h.riskShare, 0);
  const topWeight = r.holdings.slice(0, 3).reduce((s, h) => s + h.weight, 0);
  const realized = r.realized;
  const worst = p.var.tail[0] ?? null;
  const download = (file: string, label: string) => (
    <a href={`/api/risk/export?file=${file}&lookback=${r.lookback}${exportQuery}`} className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2" download>
      <Download className="size-3" aria-hidden />
      {label}
    </a>
  );

  return (
    <>
      <OpenDetailsOnHash />
      <div className={FIRST_SCREEN}>
        <div data-tour="risk-toolbar" className="flex min-w-0 shrink-0 items-center gap-2.5">
          <LookbackSelector basePath={basePath} active={r.lookback} />
          <span className="flex min-w-0 items-center gap-1 text-body text-muted-foreground">
            <span className="truncate">{context}</span>
            <InfoTip label="forward-looking risk">{RISK_EXPLAIN.exAnte}</InfoTip>
          </span>
          <span className="flex-1" />
          {notices}
          <Button variant="outline" nativeButton={false} className="gap-1.5 px-3" render={<a href={`/api/risk/export?file=positions&lookback=${r.lookback}${exportQuery}`} download />}>
            <Download className="size-3.5" aria-hidden />
            Export CSV
          </Button>
        </div>

        <section aria-label="Headline risk" className="shrink-0">
          <StatStrip
            cells={[
              { label: <Label explain={RISK_EXPLAIN.vol}>Volatility</Label>, value: rpct(p.vol), note: <>annualized · S&amp;P {rpct(p.marketVol)}</> },
              {
                label: <Label explain={RISK_EXPLAIN.trackingError}>Tracking error</Label>,
                value: rpct(p.trackingError),
                note: p.trackingError === null ? "Add S&P 500 sector weights" : `vs ${benchmarkLabel}`,
              },
              { label: <Label explain={RISK_EXPLAIN.beta}>Beta</Label>, value: rnum(p.beta), note: "vs S&P 500" },
              {
                label: <Label explain={RISK_EXPLAIN.var}>1-day VaR, 95%</Label>,
                value: Number.isFinite(p.var.pct) ? `−${rpct(p.var.pct, 2)}` : "—",
                tone: "down",
                note: `≈ ${rusd(p.var.dollars)} on ${scopeLabel}`,
              },
              {
                label: <Label explain={WORST_DAY}>{`Worst day, ${lookbackShort(r.lookback)}`}</Label>,
                value: worst ? rpct(worst.ret) : "—",
                tone: worst && worst.ret < 0 ? "down" : null,
                note: worst ? fmtDate(worst.date) : "no days in the window",
              },
            ]}
          />
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <RiskSources report={r} teams={teams} />
          {stressPanel}
        </div>
      </div>

      <div className="mt-8 grid gap-8">
        <section aria-label="More ways to read the same risk">
          <SectionHead aside={<>Positions at the {fmtDate(r.asOf)} close · returns {r.window.from ? `${fmtDate(r.window.from)} – ${fmtDate(r.window.to)}` : "—"} ({r.window.days} trading days)</>}>
            More ways to read the same risk
          </SectionHead>
          <div data-tour="risk-strip">
            <StatStrip
              cells={[
                { label: <Label explain={RISK_EXPLAIN.es}>Expected shortfall</Label>, value: rusd(p.var.esDollars), note: `${rpct(p.var.es, 2)} · avg of worst 5% of days` },
                { label: <Label explain={RISK_EXPLAIN.stress}>If the S&amp;P 500 fell 10%</Label>, value: rusd(p.stress.dollars), tone: p.stress.dollars < 0 ? "down" : null, note: `${rpct(p.stress.move)} · beta-implied` },
                { label: <Label explain={RISK_EXPLAIN.effectiveN}>Effective positions</Label>, value: rnum(p.effectiveN, 1), note: `of ${r.holdings.length} holdings` },
                { label: <Label explain={RISK_EXPLAIN.top5}>Top 5 weight</Label>, value: rpct(p.top5), note: r.scope === "fund" ? "of NAV" : "of the team's holdings" },
                { label: <Label explain={RISK_EXPLAIN.cash}>Cash</Label>, value: r.scope === "fund" ? rpct(r.cash.weight) : "—", note: r.scope === "fund" ? rusd(r.cash.value) : "Cash is held at Fund level" },
              ]}
            />
          </div>
          {transparency && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <VolWorking r={r} />
              <BetaWorking r={r} />
              <TeWorking r={r} />
              <VarWorking r={r} />
              <StressWorking r={r} />
              <ConcentrationWorking r={r} />
            </div>
          )}
        </section>

        <section data-tour="risk-sectors" aria-label="Sector exposure and where risk comes from">
          <SectionHead aside={<>Today&apos;s weights · <Link href={basePath.replace(/\/risk$/, "/exposure")} className="hover:text-foreground hover:underline">by active weight on Exposure →</Link></>}>
            <Explained label="Sector exposure and where risk comes from">{RISK_EXPLAIN.riskShare}</Explained>
          </SectionHead>
          <SectorExposure sectors={r.sectors} benchmarkLabel={benchmarkLabel} />
        </section>

        <section data-tour="risk-holdings" aria-label="Holdings by share of risk">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-emph font-semibold">Holdings by share of risk</h2>
            <Segmented
              label="Holdings view"
              segments={[
                { key: "top", label: `Top ${TOP_HOLDINGS}`, href: `${basePath}?lookback=${r.lookback}#holdings-risk`, active: !showAll },
                { key: "all", label: `All ${r.holdings.length}`, href: `${basePath}?lookback=${r.lookback}&all=1#holdings-risk`, active: showAll },
              ]}
            />
          </div>
          {r.holdings.length >= 3 && (
            <p className="mb-2.5 text-body text-ink-2">
              The three largest risk sources ({r.holdings.slice(0, 3).map((h) => h.ticker).join(", ")}) are {rpct(topWeight)} of value and {rpct(topShare)} of risk.
            </p>
          )}
          <div id="holdings-risk" className="scroll-mt-4">
            <HoldingsRiskTable rows={rows} teams={teams} totals={{ weight: p.invested, vol: p.vol, riskRows: r.holdings.length }} showActive={p.trackingError !== null} />
          </div>
        </section>

        <ActiveRiskSection report={r} teams={teams} benchmarkLabel={benchmarkLabel} transparency={transparency} basePath={basePath} showAll={showAll} download={download("active-risk", "Active risk")} />

        <section aria-label="Correlation and realized risk" className="grid gap-5 lg:grid-cols-12">
          <Card className="gap-3 bg-transparent p-4 shadow-none lg:col-span-7">
            <SectionHead className="mb-0" aside={`Largest ${r.correlation.tickers.length} holdings`}>
              <Explained label="Correlation">{RISK_EXPLAIN.correlation}</Explained>
            </SectionHead>
            <CorrelationHeatmap tickers={r.correlation.tickers} matrix={r.correlation.matrix} />
          </Card>
          <Card className="gap-3 bg-transparent p-4 shadow-none lg:col-span-5">
            <SectionHead className="mb-0" aside={realized ? `${realized.days} trading days` : undefined}>
              <Explained label="Realized, from the Fund's own returns">{RISK_EXPLAIN.realized}</Explained>
            </SectionHead>
            {!realized ? (
              <div className="text-body text-muted-foreground">No ledger history yet.</div>
            ) : (
              <>
                {!realized.enough && (
                  <p className="text-body text-muted-foreground">
                    Realized volatility, beta, tracking error and Sharpe need {MIN_REALIZED_DAYS} trading days of ledger history; the ledger has {realized.days} since {fmtDate(inception)}. Until then, use the forward-looking numbers above.
                  </p>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-body">
                  <Realized label="Return" explain="Compounded daily NAV return over the window, net of deposits and withdrawals." value={rpct(realized.totalReturn, 2)} />
                  <Realized label="Volatility" explain={RISK_EXPLAIN.vol} value={rpct(realized.vol)} />
                  <Realized label="Beta" explain={RISK_EXPLAIN.beta} value={rnum(realized.beta)} />
                  <Realized label="Tracking error" explain={RISK_EXPLAIN.trackingError} value={rpct(realized.trackingError)} />
                  <Realized label="Sharpe ratio" explain={RISK_EXPLAIN.sharpe} value={rnum(realized.sharpe)} />
                  <Realized label="Max drawdown" explain={RISK_EXPLAIN.drawdown} value={rpct(realized.drawdown.max, 2)} hint={realized.drawdown.maxDate ? `${fmtDate(realized.drawdown.maxDate)} · S&P 500 ${rpct(realized.drawdown.marketMax, 2)}` : undefined} />
                </dl>
                <DrawdownChart
                  fundLabel={scopeLabel}
                  data={realized.drawdown.dates.map((d, i) => ({ date: d, fund: realized.drawdown.portfolio[i] * 100, market: realized.drawdown.market[i] * 100 }))}
                />
              </>
            )}
          </Card>
        </section>

        {stress}

        <details data-tour="risk-method" className="group rounded-[14px] bg-band-2 shadow-[0_0_0_1px_var(--border)]">
          <summary className="cursor-pointer px-4 py-3 text-body font-medium text-ink-2 select-none hover:text-foreground">How this is calculated, and the data behind it</summary>
          <div className="grid gap-3 border-t border-row px-4 py-4 text-body leading-relaxed text-muted-foreground">
            <p>
              Forward-looking figures apply today&apos;s positions (the trade ledger replayed to the {fmtDate(r.asOf)} close) to {r.window.days} daily total returns
              (split-adjusted closes plus dividends on their ex-dates, from Yahoo Finance, stored nightly) on the S&amp;P 500&apos;s trading days. Covariance is the
              equal-weighted sample covariance; volatility, beta and tracking error are annualized with √252. Beta is against SPY total return. Tracking error is against
              {weightSetAsOf ? ` the S&P 500 sector weights saved ${fmtDate(weightSetAsOf)}, drifted to today,` : " the saved S&P 500 sector weights"} applied to the Select Sector SPDR ETFs,
              the same benchmark attribution uses. VaR is one-day, 95%, historical simulation; the worst day is the worst of the same simulated days. A holding with fewer than {MIN_OBSERVATIONS} days of its own returns is modeled with its
              sector ETF; isolated missing days use the sector ETF&apos;s return that day. Cash is riskless.
              {r.riskFree && ` The risk-free rate is the 13-week Treasury bill yield (^IRX), ${rpct(r.riskFree.annual, 2)} on ${fmtDate(r.riskFree.asOf)}.`}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Download the exact inputs:</span>
              {download("returns", "Daily returns")}
              {download("covariance", "Covariance matrix")}
              {download("positions", "Positions and results")}
              {download("active-risk", "Active risk")}
            </p>
            <p>
              To check volatility in Excel: put the weights (positions file, <code>weight</code> column) in a column, the covariance matrix beside it, and compute
              <code> =SQRT(MMULT(TRANSPOSE(w), MMULT(Σ, w))) * SQRT(252)</code>. For VaR, multiply each day&apos;s returns by the weights (<code>=MMULT(returns, w)</code>)
              and take <code>=-PERCENTILE.INC(range, 0.05)</code>.
            </p>
            {transparency && (
              <div className="grid gap-1.5">
                <div className="font-medium text-foreground">
                  <Explained label="Data coverage in this window">{RISK_EXPLAIN.coverage}</Explained>
                </div>
                <CoverageTable r={r} />
              </div>
            )}
          </div>
        </details>
      </div>
    </>
  );
}

const WORST_DAY =
  "The worst single day for today's positions in the lookback window: today's weights applied to each day's returns (the same simulated days as VaR). It describes today's portfolio, not a day the Fund actually had.";

function Realized({ label, explain, value, hint }: { label: string; explain: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-body text-muted-foreground">
        {label}
        <InfoTip label={label}>{explain}</InfoTip>
      </dt>
      <dd className={cn("figure text-emph")}>{value}</dd>
      {hint && <dd className="text-caption text-muted-foreground">{hint}</dd>}
    </div>
  );
}
