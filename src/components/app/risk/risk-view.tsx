import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/app/page-head";
import { Segmented, StatStrip } from "@/components/app/panel";
import { Hero } from "@/components/app/portfolio/hero";
import { HowNote, SectionHead } from "@/components/app/portfolio/parts";
import { fmtAccounting, fmtDate, fmtDay, fmtDayMonth } from "@/lib/format";
import { LOOKBACKS, MIN_OBSERVATIONS, MIN_REALIZED_DAYS, type RiskReport } from "@/lib/risk/model";
import { modeledPath } from "@/lib/risk/simulated";
import { Tip } from "../attribution/info-tip";
import { HeroNotes, type QualityNotice } from "../attribution/data-quality-notice";
import { ActiveRiskSection } from "./active-risk";
import { CorrelationHeatmap } from "./correlation-heatmap";
import { DrawdownChart } from "./drawdown-chart";
import { RISK_EXPLAIN } from "./explainers";
import { rnum, rpct, rusd } from "./format";
import { HoldingsRiskTable, type TeamNames } from "./holdings-risk-table";
import { LookbackSelector, lookbackShort } from "./lookback-selector";
import { OpenDetailsOnHash } from "./open-on-hash";
import { RiskByTeam, RiskSources } from "./risk-sources";
import { BetaWorking, ConcentrationWorking, CoverageTable, StressWorking, TeWorking, VarWorking, VolWorking } from "./risk-working";
import { SectorExposure } from "./sector-exposure";

const TOP_HOLDINGS = 10;
/**
 * The body of the Risk page, shared by the Fund and team views: the volatility and what it is made of, the drawdown, the
 * four numbers that describe the book, where the risk comes from and the stress tests; then the rest of the ways to read
 * the same risk. Tooltips explain every figure; transparency mode adds each headline number's working and the data
 * coverage table.
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
  /** The line beside the window buttons: what is measured. */
  context: React.ReactNode;
  /** The model's data notices, each with the place to fix it. */
  notices?: QualityNotice[];
  /** The stress tests (streamed in; they read older stored closes). */
  stress?: React.ReactNode;
}) {
  const p = r.portfolio;
  const rows = showAll ? r.holdings : r.holdings.slice(0, TOP_HOLDINGS);
  const topShare = r.holdings.slice(0, 3).reduce((s, h) => s + h.riskShare, 0);
  const topWeight = r.holdings.slice(0, 3).reduce((s, h) => s + h.weight, 0);
  const realized = r.realized;
  const worst = p.var.tail[0] ?? null;
  const modeled = modeledPath(r);
  const download = (file: string, label: string) => (
    <a href={`/api/risk/export?file=${file}&lookback=${r.lookback}${exportQuery}`} className="inline-flex items-center gap-1 font-semibold text-foreground underline underline-offset-2" download>
      <Download className="size-3" aria-hidden />
      {label}
    </a>
  );

  return (
    <>
      <OpenDetailsOnHash />
      <PageHead
        crumbs={[{ label: "Portfolio" }]}
        scope
        asof={`Today's weights · closes through ${fmtDay(r.asOf)}`}
        actions={
          <Button variant="secondary" nativeButton={false} render={<a href={`/api/risk/export?file=positions&lookback=${r.lookback}${exportQuery}`} download />}>
            <Download aria-hidden />
            Export CSV
          </Button>
        }
      />
      <div data-tour="risk-toolbar">
        <Hero
          label={`Volatility, ${LOOKBACKS[r.lookback].label}, annualized`}
          value={rpct(p.vol)}
          change={p.trackingError === null ? undefined : <span className="text-foreground"><Tip label="Tracking error">{RISK_EXPLAIN.trackingError}</Tip> {rpct(p.trackingError)}</span>}
          note={
            <>
              {p.trackingError === null ? "Add S&P 500 sector weights for tracking error · " : "· "}S&amp;P 500 <Tip label="volatility">{RISK_EXPLAIN.vol}</Tip> {rpct(p.marketVol)} · <Tip label="beta">{RISK_EXPLAIN.beta}</Tip> {rnum(p.beta)} to the S&amp;P 500
            </>
          }
          aside={<HeroNotes notices={notices ?? []} />}
        />
        {modeled && (
          <>
            <div className="mt-[22px] text-caption text-muted-foreground">
              <Tip label="Drawdown from the previous high">{RISK_EXPLAIN.drawdownModeled}</Tip>
            </div>
            <div className="mt-1.5">
              <DrawdownChart fundLabel={scopeLabel === "NAV" ? "Fund" : scopeLabel} data={modeled.dates.map((d, i) => ({ date: d, fund: modeled.drawdown[i] * 100 }))} worstDate={modeled.troughDate} />
            </div>
          </>
        )}
        <div className="mt-3.5 flex items-center gap-1 border-b pb-3.5">
          <LookbackSelector basePath={basePath} active={r.lookback} />
          <span className="flex-1" />
          <span className="text-caption text-muted-foreground">
            {context} <Tip label="(forward-looking)">{RISK_EXPLAIN.exAnte}</Tip>
          </span>
        </div>
      </div>
      <StatStrip
        className="border-t-0"
        cells={[
          {
            label: <Tip label="Sharpe ratio">{RISK_EXPLAIN.sharpeModeled}</Tip>,
            value: modeled?.sharpe == null ? "—" : rnum(modeled.sharpe),
            note: modeled?.sharpe == null ? "No Treasury bill yield stored" : `S&P 500 ${modeled.marketSharpe == null ? "—" : rnum(modeled.marketSharpe)}`,
          },
          {
            label: <Tip label="Max drawdown">{RISK_EXPLAIN.drawdownModeled}</Tip>,
            value: modeled ? rpct(modeled.max) : "—",
            tone: modeled && modeled.max < 0 ? "down" : null,
            note: modeled && modeled.max < 0 ? `${fmtDayMonth(modeled.peakDate)} – ${fmtDayMonth(modeled.troughDate)}` : "no decline in the window",
          },
          {
            label: <Tip label="Expected shortfall">{RISK_EXPLAIN.es}</Tip>,
            value: rpct(-p.var.es, 2),
            tone: "down",
            note: `1 day · ${fmtAccounting(-p.var.esDollars, 0)}`,
          },
          { label: <Tip label="Effective positions">{RISK_EXPLAIN.effectiveN}</Tip>, value: rnum(p.effectiveN, 1), note: `of the ${r.holdings.length} measured` },
        ]}
      />

      <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
        <RiskSources report={r} teams={teams} />
        <RiskByTeam report={r} teams={teams} />
      </div>

      {stress}

      <section aria-labelledby="risk-more" className="mt-[34px]">
        <SectionHead
          id="risk-more"
          title="More ways to read the same risk"
          sub={<>Positions at the {fmtDate(r.asOf)} close · returns {r.window.from ? `${fmtDate(r.window.from)} – ${fmtDate(r.window.to)}` : "—"} ({r.window.days} trading days)</>}
        />
        <div data-tour="risk-strip" className="mt-2">
          <StatStrip
            cells={[
              { label: <Tip label="1-day VaR, 95%">{RISK_EXPLAIN.var}</Tip>, value: Number.isFinite(p.var.pct) ? rpct(-p.var.pct, 2) : "—", tone: "down", note: `≈ ${rusd(p.var.dollars)} loss on ${scopeLabel}` },
              {
                label: <Tip label={`Worst day, ${lookbackShort(r.lookback)}`}>{WORST_DAY}</Tip>,
                value: worst ? rpct(worst.ret) : "—",
                tone: worst && worst.ret < 0 ? "down" : null,
                note: worst ? fmtDate(worst.date) : "no days in the window",
              },
              { label: <Tip label="If the S&P 500 fell 10%">{RISK_EXPLAIN.stress}</Tip>, value: rusd(p.stress.dollars), tone: p.stress.dollars < 0 ? "down" : null, note: `${rpct(p.stress.move)} · beta-implied` },
              { label: <Tip label="Top 5 weight">{RISK_EXPLAIN.top5}</Tip>, value: rpct(p.top5), note: r.scope === "fund" ? "of NAV" : "of the team's holdings" },
              { label: <Tip label="Cash">{RISK_EXPLAIN.cash}</Tip>, value: r.scope === "fund" ? rpct(r.cash.weight) : "—", note: r.scope === "fund" ? rusd(r.cash.value) : "Cash is held at Fund level" },
            ]}
          />
        </div>
        {transparency && (
          <div className="mt-3 grid gap-x-8 gap-y-1 lg:grid-cols-2">
            <VolWorking r={r} />
            <BetaWorking r={r} />
            <TeWorking r={r} />
            <VarWorking r={r} />
            <StressWorking r={r} />
            <ConcentrationWorking r={r} />
          </div>
        )}
      </section>

      <section data-tour="risk-sectors" aria-labelledby="risk-sectors" className="mt-[34px]">
        <SectionHead
          id="risk-sectors"
          title={<Tip label="Sector exposure and where risk comes from">{RISK_EXPLAIN.riskShare}</Tip>}
          sub={
            <>
              Today&apos;s weights · <Link href={basePath.replace(/\/risk$/, "/exposure")} className="font-semibold text-foreground hover:underline">by active weight on Exposure →</Link>
            </>
          }
        />
        <div className="mt-2">
          <SectorExposure sectors={r.sectors} benchmarkLabel={benchmarkLabel} />
        </div>
      </section>

      <section data-tour="risk-holdings" aria-labelledby="risk-holdings" className="mt-[34px]">
        <SectionHead
          id="risk-holdings"
          title="Holdings by share of risk"
          sub={
            r.holdings.length >= 3 ? (
              <>
                The three largest risk sources ({r.holdings.slice(0, 3).map((h) => h.ticker).join(", ")}) are {rpct(topWeight)} of value and {rpct(topShare)} of risk.
              </>
            ) : undefined
          }
          aside={
            <Segmented
              label="Holdings view"
              segments={[
                { key: "top", label: `Top ${TOP_HOLDINGS}`, href: `${basePath}?lookback=${r.lookback}#holdings-risk`, active: !showAll },
                { key: "all", label: `All ${r.holdings.length}`, href: `${basePath}?lookback=${r.lookback}&all=1#holdings-risk`, active: showAll },
              ]}
            />
          }
        />
        <div id="holdings-risk" className="mt-2 scroll-mt-4">
          <HoldingsRiskTable rows={rows} teams={teams} totals={{ weight: p.invested, vol: p.vol, riskRows: r.holdings.length }} showActive={p.trackingError !== null} />
        </div>
      </section>

      <div className="mt-[34px]">
        <ActiveRiskSection report={r} teams={teams} benchmarkLabel={benchmarkLabel} transparency={transparency} basePath={basePath} showAll={showAll} download={download("active-risk", "Active risk")} />
      </div>

      <section aria-label="Correlation and realized risk" className="mt-[34px] grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-14">
        <div>
          <SectionHead title={<Tip label="Correlation">{RISK_EXPLAIN.correlation}</Tip>} sub={`Largest ${r.correlation.tickers.length} holdings`} />
          <div className="mt-3">
            <CorrelationHeatmap tickers={r.correlation.tickers} matrix={r.correlation.matrix} />
          </div>
        </div>
        <div>
          <SectionHead title={<Tip label="Realized, from the Fund's own returns">{RISK_EXPLAIN.realized}</Tip>} sub={realized ? `${realized.days} trading days` : undefined} />
          {!realized ? (
            <p className="mt-3 text-body text-muted-foreground">No ledger history yet.</p>
          ) : (
            <div className="mt-3 grid gap-4">
              {!realized.enough && (
                <p className="text-body text-muted-foreground">
                  <b className="font-semibold text-caution-foreground">Partial</b> Realized volatility, beta, tracking error and Sharpe need {MIN_REALIZED_DAYS} trading days of ledger history; the ledger has {realized.days} since {fmtDate(inception)}. Until then, use the forward-looking numbers above.
                </p>
              )}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-body">
                <Realized label="Return" explain="Compounded daily NAV return over the window, net of deposits and withdrawals." value={rpct(realized.totalReturn, 2)} />
                <Realized label="Volatility" explain={RISK_EXPLAIN.vol} value={rpct(realized.vol)} />
                <Realized label="Beta" explain={RISK_EXPLAIN.beta} value={rnum(realized.beta)} />
                <Realized label="Tracking error" explain={RISK_EXPLAIN.trackingError} value={rpct(realized.trackingError)} />
                <Realized label="Sharpe ratio" explain={RISK_EXPLAIN.sharpe} value={rnum(realized.sharpe)} />
                <Realized label="Max drawdown" explain={RISK_EXPLAIN.drawdown} value={rpct(realized.drawdown.max, 2)} hint={realized.drawdown.maxDate ? `${fmtDate(realized.drawdown.maxDate)} · S&P 500 ${rpct(realized.drawdown.marketMax, 2)}` : undefined} />
              </dl>
              <DrawdownChart
                fundLabel={scopeLabel === "NAV" ? "Fund" : scopeLabel}
                height={170}
                worstDate={realized.drawdown.maxDate}
                data={realized.drawdown.dates.map((d, i) => ({ date: d, fund: realized.drawdown.portfolio[i] * 100, market: realized.drawdown.market[i] * 100 }))}
              />
            </div>
          )}
        </div>
      </section>

      <details data-tour="risk-method" className="group mt-[34px] border-t">
        <summary className="cursor-pointer py-3 text-body font-semibold text-ink-2 select-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">How this is calculated, and the data behind it</summary>
        <div className="grid gap-3 pb-2 text-body leading-relaxed text-muted-foreground">
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
              <div className="font-semibold text-foreground">
                <Tip label="Data coverage in this window">{RISK_EXPLAIN.coverage}</Tip>
              </div>
              <CoverageTable r={r} />
            </div>
          )}
        </div>
      </details>
      <HowNote>
        Realized from daily returns of today&apos;s holdings over the window. Tracking error and stress-test gaps are measured against the sector benchmark; beta is to the S&amp;P 500. Expected shortfall is the average of the worst 5% of
        days. The drawdown and Sharpe ratio at the top hold today&apos;s positions through the window; the Fund&apos;s own history is under &quot;Realized&quot;.
      </HowNote>
    </>
  );
}

const WORST_DAY =
  "The worst single day for today's positions in the lookback window: today's weights applied to each day's returns (the same simulated days as VaR). It describes today's portfolio, not a day the Fund actually had.";

function Realized({ label, explain, value, hint }: { label: string; explain: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground"><Tip label={label}>{explain}</Tip></dt>
      <dd className="text-emph font-semibold">{value}</dd>
      {hint && <dd className="text-caption text-muted-foreground">{hint}</dd>}
    </div>
  );
}
