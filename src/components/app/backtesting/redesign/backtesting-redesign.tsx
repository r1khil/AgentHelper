"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Hero } from "@/components/app/portfolio/hero";
import { ViewMeta } from "@/components/app/portfolio/view-meta";
import { BENCH_LINE, FUND_LINE, LineKey, LinesChart } from "@/components/app/portfolio/lines-chart";
import { HowNote, SectionHead, signTone } from "@/components/app/portfolio/parts";
import { ReplaySkeleton } from "@/components/app/skeletons";
import { Tabs, tabPanelProps } from "@/components/app/tabs";
import { DEFAULT_BENCHMARK, isTodaysWeights } from "@/lib/backtesting/default-run";
import type { SavedScenarioSummary } from "@/lib/backtesting/saved";
import { fmtChangeBp, fmtChangePct, fmtDate, fmtDayMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LayoutSwitch } from "../layout-switch";
import { useRemoveScenario } from "../saved-scenarios";
import { useBacktesting, type BacktestingOptions, type BacktestingState } from "../use-backtesting";
import { CalculationNotes, CashNote, DATES_HINT, METHOD_LINE, periodFigures, ReplayNote, runStatus, ScopeNote, shown } from "../workspace";
import { DailyHeatmap, ReplayContributors, ScenarioRiskSection, WhatChanges } from "./replay-tables";
import { SettingsRow } from "./settings-row";
import { WeightChanges, windowWord } from "./weight-changes";

/** The redesign's names for the two replays. */
const NAMES = { original: "Today's weights", modified: "Modified" } as const;

const chgPct = (v: number) => fmtChangePct(shown(v) * 100);
const day = (iso: string) => fmtDate(iso.slice(0, 10));
/** Today's weights: the dashed grey line between the scenario and the benchmark's dots. */
const TODAY_LINE = { color: "var(--series-2)", width: 1.75, dash: "6 4" } as const;
const DOTTED = { ...BENCH_LINE, dash: "1 5" } as const;

/**
 * Backtesting, in the new look: what the replay says in one number, its settings inline, the chart, the weight changes
 * beside the saved scenarios, then what changes and the risk impact. Same engine, endpoints and query params as the
 * classic `BacktestingWorkspace`; both share `useBacktesting`.
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
  scopeNote,
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
  /** Said beside the page's note when the replay isn't of the scope in view (an exec on a team: it replays the fund). */
  scopeNote?: React.ReactNode;
}) {
  const bt = useBacktesting(options);
  const { completed, busy, dirty, error, risk } = bt;
  const result = completed?.result;
  const baseline = result ? Boolean(completed?.baseline) : isTodaysWeights(bt.positions, bt.scenarioWeights);
  const active = saved.find((s) => s.id === activeId);
  const scenarioName = active?.name ?? (baseline ? "Today's weights" : "Your changes");
  const [tab, setTab] = useState<"contributors" | "days">("contributors");
  const period = result ? periodFigures(result) : null;
  const years = windowWord(completed?.from ?? bt.from, completed?.to ?? bt.to);
  const span = `${day(completed?.from ?? bt.from)} – ${day(completed?.to ?? bt.to)}`;
  const banner = options.initial?.banner;

  // The line under the big number: what each side returned, and how the scenario moved the risk.
  let value: string | null = null;
  let tone: ReturnType<typeof signTone> = null;
  let label: React.ReactNode = "Run the replay to compare the scenario with today's weights";
  let change: React.ReactNode;
  let note: React.ReactNode = "Choose your dates and weights, then run the replay.";
  if (result && period) {
    const vol = result.modified.volatility !== null && result.original.volatility !== null ? result.modified.volatility - result.original.volatility : null;
    const risky = vol === null || Math.abs(vol) < 5e-4 ? "with about the same risk" : vol > 0 ? "with more risk (see below)" : "with less risk (see below)";
    if (baseline) {
      value = fmtChangeBp(shown(period.currentActive) * 10_000);
      tone = signTone(period.currentActive, 10_000);
      label = `Today's weights against ${result.benchmark}, ${span}`;
      change = <span className="text-foreground">Today&apos;s weights {chgPct(period.current)}</span>;
      note = <>, {result.benchmark} {chgPct(period.benchmark)}</>;
    } else {
      value = fmtChangeBp(shown(period.delta) * 10_000);
      tone = signTone(period.delta, 10_000);
      label = (
        <>
          {active ? <>&ldquo;{active.name}&rdquo;</> : "Your changes"} against today&apos;s weights, {span}
        </>
      );
      change = <span className="text-foreground">Modified {chgPct(period.modified)}</span>;
      note = (
        <>
          , today&apos;s weights {chgPct(period.current)}, {result.benchmark} {chgPct(period.benchmark)}, {risky}
        </>
      );
    }
  }
  const points = useMemo(
    () =>
      result
        ? [
            { date: result.baseline, modified: 0, original: 0, benchmark: 0 },
            ...result.days.map((d) => ({ date: d.date, modified: d.modifiedCumulative * 100, original: d.originalCumulative * 100, benchmark: d.benchmarkCumulative * 100 })),
          ]
        : [],
    [result],
  );
  const lines = [
    ...(baseline ? [] : [{ key: "modified", label: NAMES.modified, ...FUND_LINE }]),
    baseline ? { key: "original", label: NAMES.original, ...FUND_LINE } : { key: "original", label: NAMES.original, ...TODAY_LINE },
    { key: "benchmark", label: result?.benchmark ?? bt.benchmark, ...DOTTED },
  ];

  return (
    <>
      <ViewMeta actions={<LayoutSwitch to="classic" href={classicHref} />}>
        A replay of past prices, not a forecast{scopeNote ? <>. {scopeNote}</> : null}
      </ViewMeta>
      <form onSubmit={bt.run} className="flex min-w-0 flex-col">
        <Hero label={label} value={value ?? "—"} tone={tone} change={change} note={note} />
        {(banner || bt.opened.problem) && (
          <div className="mt-3 max-w-[760px] text-body text-ink-3">
            {banner && <p>{banner}</p>}
            {bt.opened.problem && (
              <p role="alert">
                <b className="font-semibold text-caution-foreground">Check</b> {bt.opened.problem}
              </p>
            )}
          </div>
        )}
        <SettingsRow bt={bt} maxDate={options.defaultTo} scenarioName={scenarioName} saveAudience={saveAudience} />

        <div className={cn("mt-[18px]", dirty && "opacity-60")}>
          {error && (
            <p role="alert" className="mb-2 text-body">
              <b className="font-semibold text-caution-foreground">Failed</b> <span className="text-ink-3">{error}</span>
            </p>
          )}
          {result ? (
            <LinesChart
              rows={points}
              xKey="date"
              lines={lines}
              ariaLabel={`Replay: ${baseline ? "" : `modified weights ${period ? chgPct(period.modified) : ""}, `}today's weights ${period ? chgPct(period.current) : ""}, ${result.benchmark} ${period ? chgPct(period.benchmark) : ""}`}
              height={220}
              xAxis={{ interval: "preserveStartEnd", minTickGap: 90, tickFormatter: (d: string) => fmtDate(d) }}
              hoverLabel={(r) => fmtDate(r.date)}
              format={(v) => fmtChangePct(v)}
              gap={false}
            />
          ) : busy ? (
            <ReplaySkeleton />
          ) : (
            <div className="grid h-[220px] place-items-center border-b border-dashed">
              <p className="max-w-md text-center text-emph font-semibold">Choose your dates and weights, then run the replay.</p>
            </div>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-4 border-b pb-3.5 text-caption text-muted-foreground">
          {!baseline && (
            <span className="flex items-center gap-1.5">
              <LineKey line={FUND_LINE} />
              {NAMES.modified}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <LineKey line={baseline ? FUND_LINE : TODAY_LINE} />
            {NAMES.original}
          </span>
          <span className="flex items-center gap-1.5">
            <LineKey line={DOTTED} />
            {result?.benchmark ?? bt.benchmark}
          </span>
          <span className="flex-1" />
          <span className={cn("min-w-0 truncate", dirty && "font-semibold text-caution-foreground")} title={runStatus(bt)}>
            {result && !busy && !dirty ? `${day(result.baseline)} – ${day(result.days.at(-1)!.date)}, rebalanced daily` : runStatus(bt)}
          </span>
        </div>
        {result && (
          <div className="mt-2.5 text-caption text-muted-foreground">
            <p>
              <b className="font-semibold text-ink-3">Hypothetical replay, not this portfolio&apos;s realized return.</b> <ReplayNote result={result} realizedHref={realizedHref} />
            </p>
            {result.cashSubstitutions.length > 0 && (
              <p className="mt-1.5">
                <CashNote result={result} />
              </p>
            )}
          </div>
        )}

        <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
          <WeightChanges bt={bt} result={result} years={years} teams={teams} />
          <SavedPanel items={saved} activeId={activeId} viewerId={viewerId} fundWide={fundWide} audience={saveAudience} />
        </div>

        {result && period && <WhatChanges result={result} period={period} names={NAMES} years={years} />}
        {bt.riskEnabled && (risk.data || risk.busy || risk.error) && <ScenarioRiskSection data={risk.data} busy={risk.busy} error={risk.error} stale={bt.riskStale} names={NAMES} />}
        {result && period && (
          <section aria-labelledby="bt-detail" className={cn("mt-[30px]", dirty && "opacity-60")}>
            <SectionHead id="bt-detail" title="Replay in detail" />
            <Tabs
              label="Replay detail"
              idBase="replay-detail"
              className="mt-1"
              onSelect={(k) => setTab(k as typeof tab)}
              items={[
                { key: "contributors", label: "Contributors", active: tab === "contributors" },
                { key: "days", label: "By day", active: tab === "days" },
              ]}
            />
            <div {...tabPanelProps("replay-detail", tab)}>
              {tab === "contributors" && <ReplayContributors result={result} period={period} names={NAMES} />}
              {tab === "days" && <DailyHeatmap key={completed!.id} result={result} names={NAMES} defaultMode={baseline ? "originalActive" : "modifiedActive"} />}
            </div>
          </section>
        )}

        <HowCalculated bt={bt} />
        <HowNote>
          Both portfolios are replayed on the same daily closes and rebalanced back to their weights every day. Change the weights so they total 100%, or use the quick trade to offset a change for you. It&apos;s a replay of what already
          happened, not a forecast.
        </HowNote>
      </form>
      {/* Screen readers hear the run's progress; sighted readers see it under the chart. */}
      <span role="status" aria-live="polite" className="sr-only">
        {busy ? runStatus({ busy, dirty, completed }) : error}
      </span>
    </>
  );
}

/** Saved scenarios beside the edits: each reopens on this page; the open one is marked. */
function SavedPanel({ items, activeId, viewerId, fundWide, audience }: { items: SavedScenarioSummary[]; activeId?: string; viewerId?: string; fundWide?: boolean; audience?: string }) {
  const { busy, remove } = useRemoveScenario();
  return (
    <section aria-labelledby="bt-saved" className="min-w-0 self-start">
      <SectionHead id="bt-saved" title="Saved scenarios" sub={audience ? `Shared with ${audience}` : undefined} />
      {items.length ? (
        <ul className="mt-1 max-h-[360px] overflow-y-auto">
          {items.map((s) => {
            const open = s.id === activeId;
            const detail = `${s.changes} change${s.changes === 1 ? "" : "s"}, ${day(s.from)} – ${day(s.to)} vs ${s.benchmark}${s.note ? `. ${s.note}` : ""}`;
            return (
              <li key={s.id} className="group relative flex items-center gap-2 border-b border-row py-2.5">
                <Link
                  href={`?scenario=${s.id}`}
                  aria-current={open ? "page" : undefined}
                  title={detail}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                >
                  <span className={cn("truncate text-body", open ? "font-semibold" : "font-normal")}>{s.name}</span>
                  <span className="truncate text-caption text-muted-foreground">
                    {s.createdBy ?? "Someone"}, {fmtDayMonth(s.createdAt)}, {s.changes} change{s.changes === 1 ? "" : "s"}
                    {open ? ". Open now" : ""}
                  </span>
                </Link>
                {(fundWide || (viewerId && s.createdById === viewerId)) && (
                  <button
                    type="button"
                    aria-label={`Remove ${s.name} for everyone`}
                    title="Remove for everyone"
                    disabled={busy === s.id}
                    onClick={() => void remove(s.id)}
                    className="relative z-10 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-body text-muted-foreground">Nothing saved yet. Save a scenario to get a link {audience ?? "others"} can open.</p>
      )}
    </section>
  );
}

/** What's in the portfolio, the method and the fine print: always one click away, before and after a run. */
function HowCalculated({ bt }: { bt: BacktestingState }) {
  return (
    <details data-tour="bt-method" className="group mt-[30px] border-t">
      <summary className="cursor-pointer py-3 text-body font-semibold text-ink-2 select-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">How this is calculated</summary>
      <div className="grid gap-2 pb-2 text-body leading-relaxed text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">{bt.snapshot.scope}.</span> <ScopeNote snapshot={bt.snapshot} />
        </p>
        <p>
          The page opens on today&apos;s weights against {DEFAULT_BENCHMARK} over the last year, replayed as it loads. Change the weights, dates or benchmark and run the replay to compare a scenario; nothing is saved unless you save it.
        </p>
        <p>{METHOD_LINE}.</p>
        <p>{DATES_HINT}</p>
        <CalculationNotes />
      </div>
    </details>
  );
}

