import Link from "next/link";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/app/page-header";
import { RangeControlGroup, rangeControlClass } from "@/components/charts/primitives";
import { fmtDate } from "@/lib/format";
import { LOOKBACKS, MIN_OBSERVATIONS, MIN_REALIZED_DAYS, type LookbackKey, type RiskReport } from "@/lib/risk/model";
import { Explained, InfoTip } from "../attribution/info-tip";
import { ActiveRiskSection } from "./active-risk";
import { CorrelationHeatmap } from "./correlation-heatmap";
import { DrawdownChart } from "./drawdown-chart";
import { RISK_EXPLAIN } from "./explainers";
import { rnum, rpct, rsigned, rusd } from "./format";
import { HoldingsRiskTable, type TeamNames } from "./holdings-risk-table";
import { BetaWorking, ConcentrationWorking, CoverageTable, StressWorking, TeWorking, VarWorking, VolWorking } from "./risk-working";
import { SectorExposure } from "./sector-exposure";
import { MiniStat, StatCard } from "./stat-card";

const TOP_HOLDINGS = 10;

export function LookbackSelector({ basePath, active, extra = "" }: { basePath: string; active: LookbackKey; extra?: string }) {
  return (
    <div className="flex items-center gap-2">
      <RangeControlGroup label="Lookback window">
        {(Object.keys(LOOKBACKS) as LookbackKey[]).map((k) => (
          <Link key={k} href={`${basePath}?lookback=${k}${extra}`} aria-current={k === active ? "true" : undefined} className={rangeControlClass(k === active)}>
            {LOOKBACKS[k].label}
          </Link>
        ))}
      </RangeControlGroup>
      <InfoTip label="the lookback window">{RISK_EXPLAIN.lookback}</InfoTip>
    </div>
  );
}

/**
 * The body of the Risk page, shared by the Fund and team views. Tooltips explain every figure;
 * transparency mode adds each headline number's working and the data coverage table.
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
  /** The historical stress tests section, streamed in separately (it reads older stored closes). */
  stress?: React.ReactNode;
}) {
  const p = r.portfolio;
  const rows = showAll ? r.holdings : r.holdings.slice(0, TOP_HOLDINGS);
  const topShare = r.holdings.slice(0, 3).reduce((s, h) => s + h.riskShare, 0);
  const topWeight = r.holdings.slice(0, 3).reduce((s, h) => s + h.weight, 0);
  const realized = r.realized;
  const download = (file: string, label: string) => (
    <a href={`/api/risk/export?file=${file}&lookback=${r.lookback}${exportQuery}`} className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2" download>
      <Download className="size-3" aria-hidden />
      {label}
    </a>
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <LookbackSelector basePath={basePath} active={r.lookback} />
        <div className="text-xs text-muted-foreground">
          Positions at the {fmtDate(r.asOf)} close · returns {r.window.from ? `${fmtDate(r.window.from)} – ${fmtDate(r.window.to)}` : "—"} ({r.window.days} trading days)
        </div>
      </div>

      <SectionTitle aside={<Explained label="Forward-looking" align="right">{RISK_EXPLAIN.exAnte}</Explained>}>Today&apos;s portfolio</SectionTitle>
      <section aria-label="Headline risk" className="mb-3 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Volatility"
          explain={RISK_EXPLAIN.vol}
          value={rpct(p.vol)}
          caption={<>annualized · S&amp;P 500 {rpct(p.marketVol)}</>}
          working={transparency ? <VolWorking r={r} /> : undefined}
        />
        <StatCard
          label="Beta"
          explain={RISK_EXPLAIN.beta}
          value={rnum(p.beta)}
          caption="vs S&P 500 (SPY)"
          working={transparency ? <BetaWorking r={r} /> : undefined}
        />
        <StatCard
          label="Tracking error"
          explain={RISK_EXPLAIN.trackingError}
          value={rpct(p.trackingError)}
          caption={p.trackingError === null ? "Add S&P 500 sector weights" : `annualized · vs ${benchmarkLabel}`}
          working={transparency ? <TeWorking r={r} /> : undefined}
        />
        <StatCard
          label="1-day VaR (95%)"
          explain={RISK_EXPLAIN.var}
          value={rusd(p.var.dollars)}
          caption={`${rpct(p.var.pct, 2)} of ${scopeLabel} · historical`}
          working={transparency ? <VarWorking r={r} /> : undefined}
        />
      </section>
      <Card className="mb-2 grid grid-cols-2 gap-0 divide-border p-0 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        <MiniStat label="Expected shortfall" explain={RISK_EXPLAIN.es} value={rusd(p.var.esDollars)} caption={`${rpct(p.var.es, 2)} · avg of worst 5% of days`} />
        <MiniStat label="If the S&P 500 fell 10%" explain={RISK_EXPLAIN.stress} value={rusd(p.stress.dollars)} caption={`${rsigned(p.stress.move)} · beta-implied`} />
        <MiniStat label="Effective positions" explain={RISK_EXPLAIN.effectiveN} value={rnum(p.effectiveN, 1)} caption={`of ${r.holdings.length} holdings`} />
        <MiniStat label="Top 5 weight" explain={RISK_EXPLAIN.top5} value={rpct(p.top5)} caption={r.scope === "fund" ? "of NAV" : "of the team's holdings"} />
        <MiniStat label="Cash" explain={RISK_EXPLAIN.cash} value={r.scope === "fund" ? rpct(r.cash.weight) : "—"} caption={r.scope === "fund" ? rusd(r.cash.value) : "Cash is held at Fund level"} />
      </Card>
      {transparency && (
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <StressWorking r={r} />
          <ConcentrationWorking r={r} />
        </div>
      )}
      <div className="mb-6" />

      <SectionTitle aside={<>Today&apos;s weights · <Link href={basePath.replace(/\/risk$/, "/exposure")} className="hover:text-foreground hover:underline">by active weight on Exposure →</Link></>}>
        <Explained label="Sector exposure and where risk comes from">{RISK_EXPLAIN.riskShare}</Explained>
      </SectionTitle>
      <div className="mb-6">
        <SectorExposure sectors={r.sectors} benchmarkLabel={benchmarkLabel} />
      </div>

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Holdings by share of risk</h2>
        <RangeControlGroup label="Holdings view">
          <Link href={`${basePath}?lookback=${r.lookback}`} aria-current={showAll ? undefined : "true"} className={rangeControlClass(!showAll)}>Top {TOP_HOLDINGS}</Link>
          <Link href={`${basePath}?lookback=${r.lookback}&all=1`} aria-current={showAll ? "true" : undefined} className={rangeControlClass(showAll)}>All {r.holdings.length}</Link>
        </RangeControlGroup>
      </div>
      {r.holdings.length >= 3 && (
        <p className="mb-2 text-sm text-muted-foreground">
          The three largest risk sources ({r.holdings.slice(0, 3).map((h) => h.ticker).join(", ")}) are {rpct(topWeight)} of value and {rpct(topShare)} of risk.
        </p>
      )}
      <div className="mb-6">
        <HoldingsRiskTable rows={rows} teams={teams} totals={{ weight: p.invested, vol: p.vol, riskRows: r.holdings.length }} showActive={p.trackingError !== null} />
      </div>

      <ActiveRiskSection report={r} teams={teams} benchmarkLabel={benchmarkLabel} transparency={transparency} basePath={basePath} showAll={showAll} download={download("active-risk", "Active risk")} />

      <section aria-label="Correlation and realized risk" className="mb-6 grid gap-4 lg:grid-cols-12">
        <Card className="gap-3 p-4 lg:col-span-7">
          <SectionTitle aside={`Largest ${r.correlation.tickers.length} holdings`}>
            <Explained label="Correlation">{RISK_EXPLAIN.correlation}</Explained>
          </SectionTitle>
          <CorrelationHeatmap tickers={r.correlation.tickers} matrix={r.correlation.matrix} />
        </Card>
        <Card className="gap-3 p-4 lg:col-span-5">
          <SectionTitle aside={realized ? `${realized.days} trading days` : undefined}>
            <Explained label="Realized, from the Fund's own returns">{RISK_EXPLAIN.realized}</Explained>
          </SectionTitle>
          {!realized ? (
            <div className="text-sm text-muted-foreground">No ledger history yet.</div>
          ) : (
            <>
              {!realized.enough && (
                <p className="text-sm text-muted-foreground">
                  Realized volatility, beta, tracking error and Sharpe need {MIN_REALIZED_DAYS} trading days of ledger history; the ledger has {realized.days} since {fmtDate(inception)}. Until then, use the forward-looking numbers above.
                </p>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Realized label="Return" explain="Compounded daily NAV return over the window, net of deposits and withdrawals." value={rsigned(realized.totalReturn, 2)} />
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

      <details className="rounded-xl bg-muted/40 ring-1 ring-foreground/10">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">How this is calculated, and the data behind it</summary>
        <div className="grid gap-3 px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            Forward-looking figures apply today&apos;s positions (the trade ledger replayed to the {fmtDate(r.asOf)} close) to {r.window.days} daily total returns
            (split-adjusted closes plus dividends on their ex-dates, from Yahoo Finance, stored nightly) on the S&amp;P 500&apos;s trading days. Covariance is the
            equal-weighted sample covariance; volatility, beta and tracking error are annualized with √252. Beta is against SPY total return. Tracking error is against
            {weightSetAsOf ? ` the S&P 500 sector weights saved ${fmtDate(weightSetAsOf)}, drifted to today,` : " the saved S&P 500 sector weights"} applied to the Select Sector SPDR ETFs,
            the same benchmark attribution uses. VaR is one-day, 95%, historical simulation. A holding with fewer than {MIN_OBSERVATIONS} days of its own returns is modeled with its
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
    </>
  );
}

function Realized({ label, explain, value, hint }: { label: string; explain: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <InfoTip label={label}>{explain}</InfoTip>
      </dt>
      <dd className="tnum font-semibold">{value}</dd>
      {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}
