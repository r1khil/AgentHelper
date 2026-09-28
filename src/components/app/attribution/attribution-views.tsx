import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { StatStrip, type StatCell } from "@/components/app/panel";
import type { AttributionResult, TeamAttributionResult } from "@/lib/attribution/attribution";
import type { PeriodKey } from "@/lib/attribution/periods";
import { bucketLabel, INDEX_LABEL } from "@/lib/attribution/sectors";
import { fmtBp, fmtDate, fmtPct } from "@/lib/format";
import { AttributionToolbar, CumulativePanel, EffectsPanel, HoldingsPanel, LEDGER_HREF, MethodPanel, SectorEffectsPanel, TeamsPanel, type EffectBar } from "./attribution-panels";
import type { TeamLookup } from "./contributors-table";
import type { QualityNotice } from "./data-quality-notice";
import { EXPLAIN } from "./explainers";
import { bps, pct, toneOf } from "./format";
import { Tip } from "./info-tip";
import { InteractionScope } from "./interaction-toggle";
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

/** Above the fold fills the window under the header (56px) and the content padding (2 × 24px). */
const FOLD = "flex min-h-[calc(100dvh-104px)] flex-col gap-4";
const GRID = "grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]";

const pctOrDash = (v: number | null) => fmtPct(pct(v));

function Toolbar({ view, days, notices, ledger }: { view: PeriodView; days: number; notices: QualityNotice[]; ledger?: boolean }) {
  return (
    <AttributionToolbar
      basePath={view.basePath}
      period={view.period}
      from={view.from}
      to={view.to}
      inception={view.inception}
      latest={view.latest}
      days={days}
      notices={notices}
      ledger={ledger}
    />
  );
}

export function FundAttributionView({
  view,
  result,
  spx,
  spxSeries,
  teams,
  notices,
  showAll,
  transparency,
  sectorEffects,
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
  sectorEffects: SectorEffectPoint[];
  weightsAsOf?: string;
}) {
  if (result.days === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Toolbar view={view} days={0} notices={notices} ledger />
        <EmptyState title="No completed trading days in this period">
          The ledger opens at the {fmtDate(view.inception)} close. Results appear after the next session&apos;s closing prices load.
        </EmptyState>
      </div>
    );
  }

  const active = spx === null ? null : result.portfolioReturn - spx;
  const cashRow = result.sectors.find((s) => s.key === "cash");
  const leader = result.effects ? [...result.sectors].filter((s) => s.key !== "cash").sort((a, b) => b.selection - a.selection)[0] : undefined;
  const breakdownQuery: BreakdownQuery | undefined = transparency ? { basePath: view.basePath, period: view.period.key, from: view.from, to: view.to } : undefined;

  const cells: StatCell[] = [
    { label: <Tip label="Owl Fund" side="bottom">{EXPLAIN.portfolio}</Tip>, value: fmtPct(pct(result.portfolioReturn)), tone: toneOf(result.portfolioReturn), note: "Total return" },
    { label: <Tip label={INDEX_LABEL} side="bottom">{EXPLAIN.index}</Tip>, value: pctOrDash(spx), note: "Index, price return" },
    { label: <Tip label={`Active vs ${INDEX_LABEL}`} side="bottom">{EXPLAIN.active}</Tip>, value: fmtBp(bps(active)), tone: toneOf(active), note: "Fund minus index" },
    {
      label: <Tip label="vs sector benchmark" side="bottom">{EXPLAIN.benchmark}</Tip>,
      value: fmtBp(bps(result.activeReturn)),
      tone: toneOf(result.activeReturn),
      note: result.benchmarkReturn === null ? "Needs sector weights" : `Benchmark ${fmtPct(pct(result.benchmarkReturn))}`,
    },
  ];

  const effects: EffectBar[] = result.effects
    ? [
        { label: "Allocation", value: result.effects.allocation, explain: EXPLAIN.allocation },
        { label: "Selection", value: result.effects.selection, explain: EXPLAIN.selection },
        { label: "Interaction", value: result.effects.interaction, explain: `${EXPLAIN.interaction} Weight × pick.`, interaction: true },
      ]
    : [];
  const total: EffectBar | null = result.effects && result.activeReturn !== null ? { label: "Total", value: result.activeReturn, explain: `${EXPLAIN.benchmark} Brinson-Fachler, daily, Carino-linked.` } : null;
  const note = (
    <>
      {leader && leader.selection > 0 && <>Selection led by {bucketLabel(leader.key)}, {fmtBp(bps(leader.selection))}. </>}
      {cashRow && result.effects && (
        <>
          {cashRow.allocation < 0 ? "Cash drag is" : "Cash accounts for"} {fmtBp(bps(cashRow.allocation))} of the allocation effect; sector bets {fmtBp(bps(result.effects.allocation - cashRow.allocation))}.
        </>
      )}
    </>
  );
  const noWeights = (
    <>
      Add S&amp;P 500 sector weights to see allocation and selection.{" "}
      <Link href={`${LEDGER_HREF}?tab=benchmark`} className="font-medium text-foreground underline underline-offset-2">Add weights</Link>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <InteractionScope className={FOLD}>
        <Toolbar view={view} days={result.days} notices={notices} ledger />
        <StatStrip data-tour="attribution-strip" cells={cells} size="lg" />
        <div className={`${GRID} lg:min-h-[252px]`}>
          <CumulativePanel
            portfolioLabel="Owl Fund"
            benchmarkLabel={INDEX_LABEL}
            asOf={view.latest}
            data={result.cumulative.map((c, i) => ({ date: c.date, portfolio: c.portfolio * 100, benchmark: spxSeries[i] == null ? null : spxSeries[i]! * 100 }))}
          />
          <EffectsPanel items={effects} total={total} aside="vs sector benchmark, bp" note={note} empty={noWeights} />
        </div>
        <div className={`${GRID} flex-1`}>
          <SectorsPanel rows={result.sectors} hasBench={result.effects !== null} own="Fund" breakdownQuery={breakdownQuery} />
          <TeamsPanel rows={result.teams} teams={teams} cashContribution={result.cashContribution} cashWeight={cashRow?.avgPortfolioWeight} query={view.queryString} />
        </div>
      </InteractionScope>

      <div className={`${GRID} lg:items-start`}>
        <HoldingsPanel holdings={result.holdings} teams={teams} basePath={view.basePath} queryString={view.queryString} showAll={showAll} />
        <div className="flex min-w-0 flex-col gap-5">
          <SectorEffectsPanel data={result.effects ? sectorEffects : null} empty="Add S&P 500 sector weights to see allocation and selection." />
          <MethodPanel>
            Headline comparison is against the S&amp;P 500 index on a price-return basis, the same as the major-movement rule. Allocation and selection are Brinson-Fachler by
            GICS sector, daily, Carino-linked, against a sector benchmark of saved S&amp;P 500 sector weights applied to Select Sector SPDR total returns
            {weightsAsOf ? ` (weights as of ${fmtDate(weightsAsOf)})` : ""}. Fund dividends reinvest on the ex-date.
            {transparency && " Transparency mode is on: select a sector row to see the daily working and the stored rows behind it."}
          </MethodPanel>
        </div>
      </div>
    </div>
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
  if (result.days === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Toolbar view={view} days={0} notices={notices} />
        <EmptyState title={result.holdings.length || view.period.start === view.period.end ? "No completed trading days in this period" : "No positions in this period"}>
          Results cover sessions after the {fmtDate(view.period.start)} close in which the team held a position.
        </EmptyState>
      </div>
    );
  }

  const selection = result.effects ? result.effects.selection + result.effects.interaction : null;
  const leader = result.effects ? [...result.sectors].sort((a, b) => b.selection + b.interaction - (a.selection + a.interaction))[0] : undefined;
  const breakdownQuery: BreakdownQuery | undefined = transparency ? { basePath: view.basePath, team: teamSlug, period: view.period.key, from: view.from, to: view.to } : undefined;

  const cells: StatCell[] = [
    { label: <Tip label={teamName} side="bottom">{EXPLAIN.teamReturn}</Tip>, value: fmtPct(pct(result.portfolioReturn)), tone: toneOf(result.portfolioReturn), note: "Team return, own capital" },
    { label: <Tip label="Sector benchmark" side="bottom">{EXPLAIN.teamBenchmark}</Tip>, value: pctOrDash(result.benchmarkReturn), note: <span title={benchmarkSectors}>{benchmarkName}</span> },
    { label: <Tip label="Active vs benchmark" side="bottom">{EXPLAIN.teamActive}</Tip>, value: fmtBp(bps(result.activeReturn)), tone: toneOf(result.activeReturn), note: "Team minus benchmark" },
    { label: <Tip label="To the Fund" side="bottom">{EXPLAIN.fundContribution}</Tip>, value: fmtBp(bps(result.fundContribution)), tone: toneOf(result.fundContribution), note: `${fmtPct(pct(result.avgFundWeight), 1)} of the Fund on average` },
  ];

  const effects: EffectBar[] =
    result.effects && selection !== null
      ? [
          { label: "Selection", value: selection, explain: EXPLAIN.teamSelection },
          { label: "Allocation", value: result.effects.allocation, explain: `${EXPLAIN.teamAllocation} Mix across team sectors.` },
        ]
      : [];
  const total: EffectBar | null = result.effects && result.activeReturn !== null ? { label: "Total", value: result.activeReturn, explain: `${EXPLAIN.teamBenchmark} Brinson-Fachler, daily, Carino-linked.` } : null;
  const leaderSel = leader ? leader.selection + leader.interaction : 0;
  const note = (
    <>
      {leader && leaderSel > 0 ? <>Selection led by {bucketLabel(leader.key)}, {fmtBp(bps(leaderSel))}. </> : <>Selection is the team&apos;s picks against their sector ETFs, interaction included. </>}
      Benchmark: {benchmarkSectors} ({benchmarkName}).
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <InteractionScope className={FOLD}>
        <Toolbar view={view} days={result.days} notices={notices} />
        <StatStrip data-tour="attribution-strip" cells={cells} size="lg" />
        <div className={`${GRID} lg:min-h-[252px]`}>
          <CumulativePanel
            portfolioLabel={teamName}
            benchmarkLabel="Sector benchmark"
            asOf={view.latest}
            data={result.cumulative.map((c) => ({ date: c.date, portfolio: c.portfolio * 100, benchmark: c.benchmark === null ? null : c.benchmark * 100 }))}
          />
          <EffectsPanel items={effects} total={total} aside={`vs ${benchmarkName}, bp`} note={note} empty="No benchmark for this period." />
        </div>
        <div className={`${GRID} flex-1`}>
          <SectorsPanel rows={result.sectors} hasBench={result.effects !== null} own="Team" breakdownQuery={breakdownQuery} />
          <HoldingsPanel holdings={result.holdings} teams={teams} basePath={view.basePath} queryString={view.queryString} showAll showTeam={false} toggle={false} />
        </div>
      </InteractionScope>

      <div className={`${GRID} lg:items-start`}>
        <SectorEffectsPanel data={result.effects ? sectorEffects : null} empty="No benchmark for this period." />
        <MethodPanel>
          The team&apos;s holdings are scaled to 100% and compared with the S&amp;P 500 weights of its sectors, using Select Sector SPDR total returns. Weights and
          contributions here are shares of the team&apos;s capital; To the Fund is in points of the whole Fund&apos;s return.
          {transparency && " Transparency mode is on: select a sector row to see the daily working and the stored rows behind it."}
        </MethodPanel>
      </div>
    </div>
  );
}
