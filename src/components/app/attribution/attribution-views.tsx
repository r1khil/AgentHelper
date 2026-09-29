import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHead } from "@/components/app/page-head";
import { StatStrip } from "@/components/app/panel";
import { Hero } from "@/components/app/portfolio/hero";
import { HowNote, signTone } from "@/components/app/portfolio/parts";
import { BENCH_LINE, FUND_LINE, LineKey } from "@/components/app/portfolio/lines-chart";
import type { AttributionResult, TeamAttributionResult } from "@/lib/attribution/attribution";
import type { PeriodKey } from "@/lib/attribution/periods";
import { INDEX_LABEL } from "@/lib/attribution/sectors";
import { fmtChangeBp, fmtChangePct, fmtDate, fmtDay, fmtDayMonth, fmtPct } from "@/lib/format";
import { bridgeCells, HoldingsSection, LegendItem, LEDGER_HREF, PeriodBar, SectorEffectsSection, TeamBars } from "./attribution-panels";
import type { TeamLookup } from "./contributors-table";
import { CumulativeDetails, CumulativeLines, type CumulativeChartPoint } from "./cumulative-active-chart";
import { HeroNotes, type QualityNotice } from "./data-quality-notice";
import { EXPLAIN } from "./explainers";
import { bps, pct } from "./format";
import { Tip } from "./info-tip";
import type { BreakdownQuery } from "./sector-breakdown";
import type { SectorEffectPoint } from "./sector-effects-list";
import { SectorsPanel } from "./sectors-panel";

/** The period on screen, as resolved from the URL. */
export type PeriodView = {
  basePath: string;
  period: { key: PeriodKey; start: string; end: string };
  from?: string;
  to?: string;
  /** "?period=…" (plus from/to for custom), for links that keep the period. */
  queryString: string;
  inception: string;
  latest: string;
};

const chgPct = (v: number | null) => (v === null ? "—" : fmtChangePct(pct(v)));

/** "since the ledger opened Sep 17", or the closes the period runs between and how many sessions it holds. */
function periodPhrase(view: PeriodView, days: number) {
  if (view.period.key === "itd") return `since the ledger opened ${fmtDayMonth(view.inception)}`;
  const n = `${days} trading ${days === 1 ? "day" : "days"}`;
  return `${fmtDay(view.period.start)} close through ${fmtDay(view.period.end)} · ${n}`;
}

/** What the hero says when the sector benchmark can't be worked out yet: a line pointing at the weights. */
function NoWeights() {
  return (
    <p className="border-b py-4 text-body text-muted-foreground">
      Add S&amp;P 500 sector weights to see allocation and selection.{" "}
      <Link href={`${LEDGER_HREF}?tab=benchmark`} className="font-semibold text-foreground underline underline-offset-2">Add weights</Link>
    </p>
  );
}

const ledgerLink = (
  <Link href={LEDGER_HREF} className="font-semibold text-foreground underline underline-offset-2">
    Open the ledger
  </Link>
);

export function FundAttributionView({
  view,
  result,
  spx,
  spxSeries,
  teams,
  notices,
  showAll,
  transparency,
  weightsAsOf,
}: {
  view: PeriodView;
  result: AttributionResult;
  /** S&P 500 price return over the period; null until its closes are stored. */
  spx: number | null;
  /** Cumulative S&P 500 return at each date of `result.cumulative`. */
  spxSeries: (number | null)[];
  teams: TeamLookup;
  notices: QualityNotice[];
  showAll: boolean;
  transparency: boolean;
  weightsAsOf?: string;
}) {
  const head = <PageHead crumbs={[{ label: "Portfolio" }]} scope asof={`Closes through ${fmtDay(view.latest)}`} />;
  const bar = <PeriodBar basePath={view.basePath} active={view.period.key} from={view.from} to={view.to} inception={view.inception} latest={view.latest} />;

  if (result.days === 0) {
    return (
      <>
        {head}
        {bar}
        <EmptyState className="mt-6" title="No completed trading days in this period">
          The ledger opens at the {fmtDate(view.inception)} close. Results appear after the next session&apos;s closing prices load.
        </EmptyState>
      </>
    );
  }

  const active = spx === null ? null : result.portfolioReturn - spx;
  const cashRow = result.sectors.find((s) => s.key === "cash");
  const breakdownQuery: BreakdownQuery | undefined = transparency ? { basePath: view.basePath, period: view.period.key, from: view.from, to: view.to } : undefined;
  const gap = result.activeReturn;

  const chart: CumulativeChartPoint[] = result.cumulative.map((c, i) => ({
    date: c.date,
    portfolio: c.portfolio * 100,
    benchmark: c.benchmark === null ? null : c.benchmark * 100,
    index: spxSeries[i] == null ? null : spxSeries[i]! * 100,
  }));

  const change = (
    <span className="text-foreground">
      <Tip label="Fund">{EXPLAIN.portfolio}</Tip> {chgPct(result.portfolioReturn)}
    </span>
  );
  const note = (
    <>
      {result.benchmarkReturn !== null && (
        <>
          · <Tip label="Benchmark">{EXPLAIN.benchmark}</Tip> {chgPct(result.benchmarkReturn)}{" "}
        </>
      )}
      · <Tip label={INDEX_LABEL}>{EXPLAIN.index}</Tip> {chgPct(spx)}, for reference
      {active !== null && (
        <>
          {" "}· {fmtChangeBp(bps(active))} <Tip label="vs S&P 500">{EXPLAIN.active}</Tip>
        </>
      )}
    </>
  );

  const cells = bridgeCells(result, true);

  return (
    <>
      {head}
      <Hero
        label={result.benchmarkReturn === null ? `Fund return, ${periodPhrase(view, result.days)}` : `Against the sector benchmark, ${periodPhrase(view, result.days)}`}
        value={gap === null ? chgPct(result.portfolioReturn) : fmtChangeBp(bps(gap))}
        tone={signTone(gap ?? result.portfolioReturn, 10_000)}
        change={change}
        note={note}
        aside={<HeroNotes notices={notices} />}
      />
      <div className="mt-[22px]">
        <CumulativeLines data={chart} portfolioLabel="Fund" benchmarkLabel="Benchmark" />
      </div>
      <PeriodBar basePath={view.basePath} active={view.period.key} from={view.from} to={view.to} inception={view.inception} latest={view.latest}>
        <span className="flex items-center gap-3.5 text-caption text-muted-foreground">
          <LegendItem swatch={<LineKey line={FUND_LINE} />}>Fund</LegendItem>
          <LegendItem swatch={<LineKey line={BENCH_LINE} />}>Benchmark</LegendItem>
          <CumulativeDetails data={chart} portfolioLabel="Fund" benchmarkLabel="Sector benchmark" indexLabel={INDEX_LABEL} explain={EXPLAIN.cumulativeChart} />
        </span>
      </PeriodBar>
      {cells ? <StatStrip className="border-t-0" cells={cells} data-tour="attribution-strip" /> : <NoWeights />}
      <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
        <section aria-labelledby="perf-sectors">
          <h2 id="perf-sectors" className="text-title font-bold tracking-[-0.01em]">By sector</h2>
          <div className="mt-2">
            <SectorsPanel rows={result.sectors} hasBench={result.effects !== null} own="Fund" breakdownQuery={breakdownQuery} totals={result} />
          </div>
        </section>
        <TeamBars rows={result.teams} teams={teams} cashContribution={result.cashContribution} cashWeight={cashRow?.avgPortfolioWeight} portfolioReturn={result.portfolioReturn} query={view.queryString} />
      </div>
      <HoldingsSection holdings={result.holdings} teams={teams} basePath={view.basePath} queryString={view.queryString} showAll={showAll} />
      <HowNote>
        The headline comparison is against the S&amp;P 500 index on a price-return basis, the same as the major-movement rule. Allocation and selection are Brinson-Fachler by GICS sector, daily, linked day to day with Carino so the
        effects add up to the gap. &quot;Weights&quot; is allocation; &quot;Picks&quot; is selection including the overlap of the two. The benchmark is the saved S&amp;P 500 sector weights applied to Select Sector SPDR total
        returns{weightsAsOf ? ` (weights as of ${fmtDate(weightsAsOf)})` : ""}. Fund dividends reinvest on the ex-date.
        {transparency && " Transparency mode is on: select a sector row to see the daily working and the stored rows behind it."}
      </HowNote>
    </>
  );
}

export function TeamAttributionView({
  view,
  teamName,
  benchmarkName,
  benchmarkSectors,
  result,
  teams,
  notices,
  transparency,
  teamSlug,
  sectorEffects,
}: {
  view: PeriodView;
  teamName: string;
  teamSlug: string;
  /** Sector ETFs, e.g. "XLK + XLC", or "no sectors assigned". */
  benchmarkName: string;
  /** Sector names, e.g. "Information Technology, Communication Services". */
  benchmarkSectors: string;
  result: TeamAttributionResult;
  teams: TeamLookup;
  notices: QualityNotice[];
  transparency: boolean;
  sectorEffects: SectorEffectPoint[];
}) {
  const head = <PageHead crumbs={[{ label: "Portfolio" }]} scope asof={`Closes through ${fmtDay(view.latest)}`} />;
  const bar = <PeriodBar basePath={view.basePath} active={view.period.key} from={view.from} to={view.to} inception={view.inception} latest={view.latest} />;

  if (result.days === 0) {
    return (
      <>
        {head}
        {bar}
        <EmptyState className="mt-6" title={result.holdings.length || view.period.start === view.period.end ? "No completed trading days in this period" : "No positions in this period"}>
          Results cover sessions after the {fmtDate(view.period.start)} close in which the team held a position.
        </EmptyState>
      </>
    );
  }

  const breakdownQuery: BreakdownQuery | undefined = transparency ? { basePath: view.basePath, team: teamSlug, period: view.period.key, from: view.from, to: view.to } : undefined;
  const gap = result.activeReturn;

  const chart: CumulativeChartPoint[] = result.cumulative.map((c) => ({ date: c.date, portfolio: c.portfolio * 100, benchmark: c.benchmark === null ? null : c.benchmark * 100 }));

  const change = (
    <span className="text-foreground">
      <Tip label={teamName}>{EXPLAIN.teamReturn}</Tip> {chgPct(result.portfolioReturn)}
    </span>
  );
  const note = (
    <>
      {result.benchmarkReturn !== null && (
        <>
          · <Tip label="Benchmark">{EXPLAIN.teamBenchmark}</Tip> {chgPct(result.benchmarkReturn)} <span title={benchmarkSectors}>({benchmarkName})</span>{" "}
        </>
      )}
      · <Tip label="To the Fund">{EXPLAIN.fundContribution}</Tip> {fmtChangeBp(bps(result.fundContribution))}, {fmtPct(pct(result.avgFundWeight), 1)} of the Fund on average
    </>
  );

  const cells = bridgeCells(result, false);

  return (
    <>
      {head}
      <Hero
        label={result.benchmarkReturn === null ? `${teamName} return, ${periodPhrase(view, result.days)}` : `Against its sector benchmark, ${periodPhrase(view, result.days)}`}
        value={gap === null ? chgPct(result.portfolioReturn) : fmtChangeBp(bps(gap))}
        tone={signTone(gap ?? result.portfolioReturn, 10_000)}
        change={change}
        note={note}
        aside={<HeroNotes notices={notices} />}
      />
      <div className="mt-[22px]">
        <CumulativeLines data={chart} portfolioLabel={teamName} benchmarkLabel="Sector benchmark" />
      </div>
      <PeriodBar basePath={view.basePath} active={view.period.key} from={view.from} to={view.to} inception={view.inception} latest={view.latest}>
        <span className="flex items-center gap-3.5 text-caption text-muted-foreground">
          <LegendItem swatch={<LineKey line={FUND_LINE} />}>{teamName}</LegendItem>
          <LegendItem swatch={<LineKey line={BENCH_LINE} />}>Sector benchmark</LegendItem>
          <CumulativeDetails data={chart} portfolioLabel={teamName} benchmarkLabel="Sector benchmark" explain={EXPLAIN.cumulativeChart} />
        </span>
      </PeriodBar>
      {cells ? <StatStrip className="border-t-0" cells={cells} data-tour="attribution-strip" /> : <p className="border-b py-4 text-body text-muted-foreground">No benchmark for this period.</p>}
      <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
        <section aria-labelledby="perf-sectors">
          <h2 id="perf-sectors" className="text-title font-bold tracking-[-0.01em]">By sector</h2>
          <div className="mt-2">
            <SectorsPanel rows={result.sectors} hasBench={result.effects !== null} own="Team" breakdownQuery={breakdownQuery} totals={result} />
          </div>
        </section>
        <SectorEffectsSection data={result.effects ? sectorEffects : null} empty="No benchmark for this period." />
      </div>
      <HoldingsSection holdings={result.holdings} teams={teams} basePath={view.basePath} queryString={view.queryString} showAll showTeam={false} toggle={false} />
      <HowNote>
        The team&apos;s holdings are scaled to 100% and compared with the S&amp;P 500 weights of its sectors, using Select Sector SPDR total returns. Weights and contributions here are shares of the team&apos;s capital; To the
        Fund is in points of the whole Fund&apos;s return. Allocation and selection are Brinson-Fachler by GICS sector, daily, Carino-linked; &quot;Picks&quot; includes the overlap of weights and picks.
        {transparency && " Transparency mode is on: select a sector row to see the daily working and the stored rows behind it."}
      </HowNote>
    </>
  );
}
