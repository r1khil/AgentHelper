"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Panel, PanelHeader, StatStrip, type StatCell } from "@/components/app/panel";
import { ReplaySkeleton, SkeletonStatStrip } from "@/components/app/skeletons";
import { Tabs, tabPanelProps } from "@/components/app/tabs";
import { PerformanceChart } from "@/components/charts/performance-chart";
import type { BacktestResult } from "@/lib/backtesting/engine";
import { DEFAULT_BENCHMARK, isTodaysWeights } from "@/lib/backtesting/default-run";
import type { SavedScenarioSummary } from "@/lib/backtesting/saved";
import { fmtBp, fmtDay, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Explained } from "../../attribution/info-tip";
import { LayoutSwitch } from "../layout-switch";
import { RISK_IMPACT_EXPLAIN, RiskImpactBody, riskWindow } from "../risk-impact";
import { useRemoveScenario } from "../saved-scenarios";
import { useBacktesting, type BacktestingOptions, type BacktestingState } from "../use-backtesting";
import {
  CalculationNotes,
  CashNote,
  Contributors,
  DailyDifferences,
  DATES_HINT,
  METHOD_LINE,
  periodFigures,
  replayPoints,
  ReplayNote,
  runStatus,
  ScopeNote,
  shown,
  Summary,
  type Frame,
} from "../workspace";
import { WeightsPanel } from "./weights-panel";

/** The redesign's names for the two replays. */
const NAMES = { original: "Today's weights", modified: "Scenario" } as const;

const shownPct = (v: number) => fmtPct(shown(v) * 100);
const toneOf = (v: number): StatCell["tone"] => (v > 1e-12 ? "up" : v < -1e-12 ? "down" : null);
const day = (iso: string) => fmtDay(iso.slice(0, 10));

/**
 * Backtesting, redesigned (S9): the weights on the left, the replay on the right. Same engine, endpoints and
 * query params as the classic `BacktestingWorkspace`; both share `useBacktesting`.
 */
export function BacktestingRedesign({
  saveAudience,
  realizedHref,
  saved,
  activeId,
  viewerId,
  fundWide,
  teams = {},
  classicHref,
  ...options
}: BacktestingOptions & {
  saveAudience?: string;
  realizedHref?: string;
  saved: SavedScenarioSummary[];
  activeId?: string;
  viewerId?: string;
  fundWide?: boolean;
  /** Team names by ticker, shown next to each holding. */
  teams?: Record<string, string>;
  /** The synthetic preview switches layouts with a link instead of the saved preference. */
  classicHref?: string;
}) {
  const bt = useBacktesting(options);
  const { completed, busy, dirty, error, risk } = bt;
  const result = completed?.result;
  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[480px_minmax(0,1fr)]">
      {/* The weights stay in view while the results below the fold scroll. */}
      <div className="flex min-h-0 flex-col max-lg:h-[720px] lg:sticky lg:top-20 lg:h-[calc(100dvh-6.5rem)] lg:self-start">
        <WeightsPanel
          bt={bt}
          maxDate={options.defaultTo}
          banner={options.initial?.banner}
          teams={teams}
          saveAudience={saveAudience}
          layoutSwitch={<LayoutSwitch to="classic" href={classicHref} />}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Stats result={result} baseline={Boolean(completed?.baseline)} busy={busy} stale={dirty} />
        <ReplayPanel bt={bt} result={result} realizedHref={realizedHref} />
        {bt.riskEnabled && (risk.data || risk.busy || risk.error) && (
          <Panel data-tour="bt-risk-impact" className="shrink-0">
            <PanelHeader
              title={<Explained label="Risk impact · today's weights vs scenario">{RISK_IMPACT_EXPLAIN}</Explained>}
              aside={riskWindow(risk.data)}
            />
            <div className="p-4">
              <RiskImpactBody data={risk.data} busy={risk.busy} error={risk.error} stale={bt.riskStale} names={NAMES} className="min-[1600px]:grid-cols-2" idle="Run the replay to see how the scenario changes the portfolio's risk." />
            </div>
          </Panel>
        )}
        {result && <ResultDetails key={completed.id} result={result} baseline={completed.baseline} bt={bt} />}
        <SavedPanel items={saved} activeId={activeId} viewerId={viewerId} fundWide={fundWide} audience={saveAudience} />
        <HowCalculated bt={bt} />
      </div>
      {/* Screen readers hear the run's progress; sighted readers see it in the replay panel. */}
      <span role="status" aria-live="polite" className="sr-only">
        {busy ? runStatus({ busy, dirty, completed }) : error}
      </span>
    </div>
  );
}

function Stats({ result, baseline, busy, stale }: { result?: BacktestResult; baseline: boolean; busy: boolean; stale: boolean }) {
  if (!result && busy) return <SkeletonStatStrip cells={4} wrap />;
  if (!result)
    return (
      <StatStrip
        wrap
        cells={[
          { label: "Scenario", value: "—", note: "Run the replay to compare" },
          { label: NAMES.original, value: "—", note: "Same window" },
          { label: "Difference", value: "—", note: "Scenario minus today" },
          { label: "Volatility", value: "—", note: "Annualized, scenario" },
        ]}
      />
    );
  const period = periodFigures(result);
  const vol = (v: number | null) => fmtPct(v === null ? null : v * 100, 1);
  const span = `${day(result.from)} – ${day(result.days.at(-1)!.date)}`;
  // At today's weights the scenario is today's portfolio, so the strip compares it with the benchmark instead.
  if (baseline) {
    const bp = Math.round(period.currentActive * 10_000);
    return (
      <StatStrip
        wrap
        className={cn(stale && "opacity-60")}
        cells={[
          { label: NAMES.original, value: shownPct(period.current), tone: toneOf(period.current), note: span },
          { label: result.benchmark, value: shownPct(period.benchmark), tone: toneOf(period.benchmark), note: "Same window" },
          { label: "Difference", value: fmtBp(bp), tone: bp > 0 ? "up" : bp < 0 ? "down" : null, note: `Today's weights minus ${result.benchmark}` },
          { label: "Volatility", value: vol(result.original.volatility), note: `vs ${vol(result.benchmarkMetrics.volatility)} ${result.benchmark}` },
        ]}
      />
    );
  }
  const bp = Math.round(period.delta * 10_000);
  return (
    <StatStrip
      wrap
      className={cn(stale && "opacity-60")}
      cells={[
        { label: "Scenario", value: shownPct(period.modified), tone: toneOf(period.modified), note: span },
        { label: NAMES.original, value: shownPct(period.current), tone: toneOf(period.current), note: "Same window" },
        { label: "Difference", value: fmtBp(bp), tone: bp > 0 ? "up" : bp < 0 ? "down" : null, note: "Scenario minus today" },
        { label: "Volatility", value: vol(result.modified.volatility), note: `vs ${vol(result.original.volatility)} today` },
      ]}
    />
  );
}

function Dot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-[5px] text-body whitespace-nowrap text-ink-2">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function ReplayPanel({ bt, result, realizedHref }: { bt: BacktestingState; result?: BacktestResult; realizedHref?: string }) {
  const points = useMemo(() => (result ? replayPoints(result) : []), [result]);
  const benchmark = result?.benchmark ?? bt.benchmark;
  // A run at today's weights draws one portfolio line: the scenario would sit exactly on top of it. Before the
  // first result, the legend follows the weights on screen.
  const baseline = result ? Boolean(bt.completed?.baseline) : isTodaysWeights(bt.positions, bt.scenarioWeights);
  return (
    <Panel className="flex-1 px-4 pt-3.5 pb-4">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1">
        <h2 className="text-emph font-semibold whitespace-nowrap">Replay, rebalanced daily</h2>
        {!baseline && <Dot color="var(--series-2)">Scenario</Dot>}
        <Dot color="var(--series-1)">{NAMES.original}</Dot>
        <Dot color="var(--series-neutral)">{benchmark}</Dot>
        <span className="flex-1" />
        <span className={cn("min-w-0 truncate text-caption text-muted-foreground", bt.dirty && "text-caution-foreground")} title={runStatus(bt)}>
          {(bt.busy || bt.dirty || result) && runStatus(bt)}
        </span>
      </div>
      {bt.error && (
        <p role="alert" className="mt-3 rounded-[10px] bg-[color-mix(in_oklch,var(--down)_10%,var(--card))] px-3 py-2 text-body text-down">
          {bt.error}
        </p>
      )}
      {result ? (
        <div className={cn("mt-3 min-w-0", bt.dirty && "opacity-60")}>
          <PerformanceChart
            data={points}
            kind="return"
            ranges={false}
            label="Backtest cumulative returns"
            note="Compounded daily total returns, rebased to the same closing baseline."
            nameMetrics
            series={[
              ...(baseline ? [] : [{ key: "modified", label: NAMES.modified, color: "var(--series-2)" }]),
              { key: "original", label: NAMES.original, color: "var(--series-1)" },
              { key: "benchmark", label: result.benchmark, color: "var(--series-neutral)" },
            ]}
          />
          <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Hypothetical replay, not this portfolio’s realized return.</span>{" "}
            <ReplayNote result={result} realizedHref={realizedHref} />
          </p>
          {result.cashSubstitutions.length > 0 && (
            <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
              <CashNote result={result} />
            </p>
          )}
        </div>
      ) : bt.busy ? (
        <ReplaySkeleton />
      ) : (
        <div className="grid flex-1 place-items-center py-10">
          <p className="max-w-md text-center text-emph font-medium">Choose your dates and weights, then run the replay.</p>
        </div>
      )}
    </Panel>
  );
}

const DetailFrame: Frame = ({ title, ariaLabel, children }) => (
  <section aria-label={ariaLabel} className="min-w-0">
    <h3 className="mb-3 text-body font-semibold">{title}</h3>
    {children}
  </section>
);

type DetailTab = "daily" | "contributors" | "summary";

/** Everything else the run produced, one view at a time. */
function ResultDetails({ result, baseline, bt }: { result: BacktestResult; baseline: boolean; bt: BacktestingState }) {
  const [tab, setTab] = useState<DetailTab>("daily");
  const period = periodFigures(result);
  const tabs: { key: DetailTab; label: string }[] = [
    { key: "daily", label: "By day" },
    { key: "contributors", label: "Contributors" },
    { key: "summary", label: "Period summary" },
  ];
  return (
    <Panel className="shrink-0">
      <PanelHeader title="Replay in detail">
        <Tabs label="Replay detail" idBase="replay-detail" rule={false} className="ml-4 self-stretch" onSelect={(k) => setTab(k as DetailTab)} items={tabs.map((t) => ({ ...t, active: tab === t.key }))} />
      </PanelHeader>
      <div {...tabPanelProps("replay-detail", tab)} className={cn("p-4 text-body", bt.dirty && "opacity-60")}>
        {tab === "daily" && (
          <div className="space-y-6">
            <DailyDifferences result={result} Frame={DetailFrame} names={NAMES} defaultMode={baseline ? "originalActive" : "modifiedActive"} />
          </div>
        )}
        {tab === "contributors" && <Contributors result={result} period={period} names={NAMES} />}
        {tab === "summary" && <Summary result={result} period={period} names={NAMES} />}
      </div>
    </Panel>
  );
}

function SavedPanel({
  items,
  activeId,
  viewerId,
  fundWide,
  audience,
}: {
  items: SavedScenarioSummary[];
  activeId?: string;
  viewerId?: string;
  fundWide?: boolean;
  audience?: string;
}) {
  const { busy, remove } = useRemoveScenario();
  return (
    <Panel className="shrink-0">
      <PanelHeader title="Saved scenarios" aside={audience ? `Shared with ${audience}` : undefined} />
      {items.length ? (
        <ul className="max-h-[205px] overflow-y-auto">
          {items.map((s) => {
            const detail = `${s.changes} change${s.changes === 1 ? "" : "s"} · ${day(s.from)} – ${day(s.to)} vs ${s.benchmark}${s.note ? ` · ${s.note}` : ""}`;
            return (
              <li key={s.id} className={cn("group relative flex h-10 items-center gap-2.5 border-b border-row px-4 text-body last:border-b-0 hover:bg-band", s.id === activeId && "bg-band")}>
                <Link href={`/backtesting?scenario=${s.id}`} title={detail} className="min-w-0 flex-1 truncate font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset">
                  {s.name}
                </Link>
                <span className="text-body whitespace-nowrap text-muted-foreground">
                  {s.createdBy ?? "Someone"} · {fmtDay(s.createdAt)}
                </span>
                <span className="w-[74px] text-right font-mono text-body whitespace-nowrap text-muted-foreground" title={detail}>
                  {s.changes} change{s.changes === 1 ? "" : "s"}
                </span>
                {(fundWide || (viewerId && s.createdById === viewerId)) && (
                  <button
                    type="button"
                    aria-label={`Remove ${s.name} for everyone`}
                    title="Remove for everyone"
                    disabled={busy === s.id}
                    onClick={() => void remove(s.id)}
                    className="relative z-10 -mr-1.5 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-3 text-body text-muted-foreground">
          Nothing saved yet. Save a scenario to get a link {audience ?? "others"} can open.
        </p>
      )}
    </Panel>
  );
}

/** What's in the portfolio, the method and the fine print: always one click away, before and after a run. */
function HowCalculated({ bt }: { bt: BacktestingState }) {
  return (
    <details data-tour="bt-method" className="shrink-0 rounded-[14px] bg-band-2 shadow-[0_0_0_1px_var(--border)]">
      <summary className="cursor-pointer px-4 py-3 text-body font-medium text-ink-2 select-none hover:text-foreground">How this is calculated</summary>
      <div className="grid gap-2 border-t border-row px-4 py-4 text-body leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{bt.snapshot.scope}.</span> <ScopeNote snapshot={bt.snapshot} />
        </p>
        <p>
          The page opens on today&apos;s weights against {DEFAULT_BENCHMARK} over the last year, replayed as it loads. Change the weights, dates
          or benchmark and run the replay to compare a scenario; nothing is saved unless you save it.
        </p>
        <p>{METHOD_LINE}.</p>
        <p>{DATES_HINT}</p>
        <CalculationNotes />
      </div>
    </details>
  );
}
