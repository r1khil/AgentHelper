"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { PerformanceChart } from "@/components/charts/performance-chart";
import {
  BENCHMARKS,
  type BacktestResult,
  type Metrics,
} from "@/lib/backtesting/engine";
import { fmtAccounting, fmtBp, fmtMonth, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { QuickTrade } from "./quick-trade";
import { RiskImpact } from "./risk-impact";
import { SaveScenario } from "./saved-scenarios";
import { useBacktesting, type BacktestingOptions } from "./use-backtesting";

export type { InitialScenario } from "./use-backtesting";

export const pct = (v: number | null) => fmtPct(v === null ? null : v * 100);
// Round half away from zero to the displayed 0.01, so ties are symmetric and -0 never shows as "+0.00".
export const shown = (v: number) => (Math.sign(v) * Math.round(Math.abs(v) * 10000)) / 10000 || 0;
/** A difference, active return or contribution in basis points, from the displayed (rounded) fraction. */
export const bp = (v: number | null) => fmtBp(v === null ? null : shown(v) * 10_000);
/** One name per series, used by every card, chart, select and table. */
const SERIES = { original: "Current replay", modified: "Modified replay" } as const;
export const tone = (v: number) =>
  v > 1e-12 ? "text-up" : v < -1e-12 ? "text-down" : "text-muted-foreground";
const cell = "px-3 py-2.5 text-right tnum whitespace-nowrap";
const head = "px-3 py-2.5 text-left font-medium text-muted-foreground";

/** The classic layout: today's page, unchanged. The redesign lives in ./redesign and shares useBacktesting. */
export function BacktestingWorkspace({
  saveAudience,
  aside,
  realizedHref,
  headerActions,
  ...options
}: BacktestingOptions & {
  /** Who a saved scenario is shared with ("the Fund's execs and admins"); omitted, saving is off. */
  saveAudience?: string;
  /** Rendered under the header: the saved scenarios list. */
  aside?: ReactNode;
  /** Attribution page with this portfolio's realized return, when the viewer may open it. */
  realizedHref?: string;
  /** Right of the page header: the "Try the new layout" switch. */
  headerActions?: ReactNode;
}) {
  const { snapshot, defaultTo, initial } = options;
  const bt = useBacktesting(options);
  const { opened, positions, weights, scenarioWeights, sum, valid, dirty, from, to, benchmark, completed, busy, error, risk, lookupBusy } = bt;
  return (
    <>
      <PageHeader
        title="Backtesting"
        description="Replay today's portfolio weights over past prices and compare them with a modified copy."
        actions={headerActions}
      />
      {aside}
      {(initial?.banner || opened.problem) && (
        <Card className="mb-5 gap-1 border-dashed p-4 text-body">
          {initial?.banner && <p>{initial.banner}</p>}
          {opened.problem && <p className="text-destructive">{opened.problem}</p>}
        </Card>
      )}
      <Card className="mb-5 gap-3 p-4 text-body">
        <div className="font-medium">{snapshot.scope}</div>
        <p className="text-muted-foreground">
          <ScopeNote snapshot={snapshot} />
        </p>
        <p className="text-body text-muted-foreground">
          {METHOD_LINE}
        </p>
      </Card>
      <form onSubmit={bt.run}>
        <Card className="mb-5 gap-4 p-4">
          <SectionTitle>Replay settings</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2 text-body">
              Start date
              <Input
                aria-label="Start date"
                type="date"
                value={from}
                max={to}
                required
                onChange={(e) => bt.setFrom(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-body">
              End date
              <Input
                aria-label="End date"
                type="date"
                value={to}
                min={from}
                max={defaultTo}
                required
                onChange={(e) => bt.setTo(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-body">
              Benchmark
              <select
                aria-label="Benchmark"
                value={benchmark}
                onChange={(e) =>
                  bt.setBenchmark(e.target.value as keyof typeof BENCHMARKS)
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-body"
              >
                {Object.entries(BENCHMARKS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-body text-muted-foreground">
            {DATES_HINT}
          </p>
          <details open className="group">
            <summary className="cursor-pointer text-body font-medium">
              Portfolio weights{" "}
              <span className="text-muted-foreground">
                · edit the modified copy
              </span>
            </summary>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-body">
                Add company by ticker
                <Input
                  className="w-44 uppercase"
                  aria-label="Ticker to add"
                  placeholder="Enter ticker"
                  value={bt.tickerInput}
                  disabled={lookupBusy}
                  maxLength={10}
                  onChange={(e) => bt.changeTickerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void bt.addCompany();
                    }
                  }}
                />
              </label>
              <Button type="button" variant="outline" disabled={lookupBusy} onClick={() => void bt.addCompany()}>
                {lookupBusy ? "Looking up…" : "Add company"}
              </Button>
              <p className="text-body text-muted-foreground">
                {ADD_HINT}
              </p>
            </div>
            {bt.lookupError && <p role="alert" className="mt-2 text-body text-destructive">{bt.lookupError}</p>}
            <QuickTrade positions={positions} onApply={bt.quickTrade} disabled={lookupBusy} />
            <div className="mt-3 max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-body">
                <caption className="sr-only">
                  Current and modified portfolio weights
                </caption>
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th scope="col" className={head}>Holding</th>
                    <th scope="col" className={cell}>Current</th>
                    <th scope="col" className={cell}>Modified (%)</th>
                    <th scope="col" className={cell}>Change</th>
                    <th scope="col" className={cell}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id} className="border-t">
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {p.ticker}
                        <span className="mt-1 block max-w-60 truncate text-caption font-normal text-muted-foreground">
                          {p.name}{p.kind === "scenario" ? " · Added to scenario" : ""}
                        </span>
                      </th>
                      <td className={cell}>{pct(p.weight)}</td>
                      <td className={cell}>
                        <Input
                          className="ml-auto w-28 text-right"
                          aria-label={`${p.ticker} modified weight`}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={weights[p.id]}
                          onChange={(e) => bt.editWeight(p.id, e.target.value)}
                          onBlur={(e) => bt.settleWeight(p.id, e.target.value)}
                          required
                        />
                      </td>
                      <td
                        className={cn(
                          cell,
                          tone(scenarioWeights[p.id] - p.weight),
                        )}
                      >
                        {weights[p.id]?.trim() === "" ? "—" : bp(scenarioWeights[p.id] - p.weight)}
                      </td>
                      <td className={cell}>
                        {p.kind === "scenario" ? (
                          <Button type="button" size="sm" variant="ghost" disabled={lookupBusy} onClick={() => bt.removeAdded(p.ticker)}>
                            Remove
                          </Button>
                        ) : p.kind !== "cash" && scenarioWeights[p.id] > 0 ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => bt.dropPosition(p.id)}>
                            Drop
                          </Button>
                        ) : p.kind !== "cash" && p.weight > 0 ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => bt.restorePosition(p)}>
                            Restore
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/40 font-medium">
                  <tr>
                    <th scope="row" className="px-3 py-2.5 text-left">Total</th>
                    <td className={cell}>100.00%</td>
                    <td className={cell}>{Number.isFinite(sum) ? fmtPct(sum) : "—"}</td>
                    <td className={cell}>{Number.isFinite(sum) ? bp(sum / 100 - 1) : "—"}</td>
                    <td className={cell} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              aria-live="polite"
              className={cn("text-body tnum", !valid && "text-destructive")}
            >
              Modified total:{" "}
              {Number.isFinite(sum) ? fmtPct(sum) : "—"}
              {!valid && " · must total 100%"}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={lookupBusy}
                onClick={bt.resetWeights}
              >
                Reset weights
              </Button>
              <Button type="submit" data-tour="bt-run" disabled={!valid || busy}>
                {busy ? "Replaying…" : "Run backtest"}
              </Button>
            </div>
          </div>
        </Card>
      </form>
      <div
        role="status"
        aria-live="polite"
        className="mb-4 text-body text-muted-foreground"
      >
        {runStatus({ busy, dirty, completed })}
      </div>
      {error && (
        <Card
          role="alert"
          className="mb-5 border-destructive/40 p-4 text-body text-destructive"
        >
          {error}
        </Card>
      )}
      {bt.riskEnabled && (risk.data || risk.busy || risk.error) && (
        <RiskImpact data={risk.data} busy={risk.busy} error={risk.error} stale={bt.riskStale} />
      )}
      {saveAudience && <SaveScenario onSave={bt.save} disabled={!valid} audience={saveAudience} />}
      {completed && (
        <Results key={completed.id} result={completed.result} realizedHref={realizedHref} />
      )}
    </>
  );
}

/** How the portfolio on screen is made up; shown in both layouts. */
export function ScopeNote({ snapshot }: { snapshot: BacktestingOptions["snapshot"] }) {
  return (
    <>
      {snapshot.sleeve
        ? `This team’s holdings total ${fmtPct(snapshot.savedWeightTotal)} of the Fund; the replay rescales them to 100% of this portfolio, with no cash.`
        : `Invested holdings total ${fmtPct(snapshot.savedWeightTotal)}; uninvested cash is ${fmtPct((snapshot.positions.find((p) => p.kind === "cash")?.weight ?? 0) * 100)}. Cash earns 0% by default.`}{" "}
      No weights are redistributed. Added or dropped companies affect only the modified copy and never update your
      saved portfolio. Results are a hypothetical replay of these weights, not realized performance.
    </>
  );
}
export const METHOD_LINE =
  "Fixed weights are rebalanced daily · USD total returns · Dividends reinvested · No fees, taxes, or transaction costs";
export const DATES_HINT =
  "Start date includes that session’s return from the previous trading close. Up to five years; completed sessions only.";
export const ADD_HINT = "New companies start at 0.00%. Offset changes yourself, including with cash.";

/** The line under the form: running, stale, the last run's span, or what to do first. */
export function runStatus({ busy, dirty, completed }: { busy: boolean; dirty: boolean; completed: { result: BacktestResult } | null }) {
  return busy
    ? "Fetching adjusted history and calculating every trading day…"
    : dirty
      ? "Settings changed. Results below show the last completed run; run again to apply changes."
      : completed
        ? `${completed.result.days.length} trading days replayed · ${completed.result.baseline} closing baseline → ${completed.result.days.at(-1)!.date}`
        : "Choose your dates and weights, then run the comparison.";
}

/** Full-period figures derived once from the displayed (rounded) returns, so every difference reconciles on screen. */
export type Period = ReturnType<typeof periodFigures>;
export function periodFigures(result: BacktestResult) {
  const current = shown(result.original.totalReturn),
    modified = shown(result.modified.totalReturn),
    benchmark = shown(result.benchmarkMetrics.totalReturn);
  return {
    current,
    modified,
    benchmark,
    currentActive: current - benchmark,
    modifiedActive: modified - benchmark,
    delta: modified - current,
  };
}

/** Rebased cumulative-return index points for the chart: 100 at the baseline close. */
export function replayPoints(result: BacktestResult) {
  return [
    {
      date: result.baseline,
      values: { original: 100, modified: 100, benchmark: 100 },
    },
    ...result.days.map((d) => ({
      date: d.date,
      values: {
        original: (1 + d.originalCumulative) * 100,
        modified: (1 + d.modifiedCumulative) * 100,
        benchmark: (1 + d.benchmarkCumulative) * 100,
      },
    })),
  ];
}

/** Why this is not the realized return, with a link to Attribution for the same dates. */
export function ReplayNote({ result, realizedHref }: { result: BacktestResult; realizedHref?: string }) {
  const lastSession = result.days.at(-1)!.date;
  return (
    <>
      Both replays hold their weights fixed, rebalanced daily, from the {result.baseline} close through{" "}
      {lastSession}. Past trades, weight changes, and cash flows are not reconstructed. The benchmark uses adjusted
      total returns for {result.benchmark}
      {result.benchmark === "SPY"
        ? "; an S&P 500 figure in another report may use the index’s price return and differ."
        : "."}
      {realizedHref && (
        <>
          {" "}
          <Link
            href={`${realizedHref}?${new URLSearchParams({ period: "custom", from: result.from, to: lastSession })}`}
            className="text-foreground underline underline-offset-2"
          >
            See the realized return for these dates on Attribution
          </Link>
          .
        </>
      )}
    </>
  );
}

/** Holdings whose early history counted as cash in this run. */
export function CashNote({ result }: { result: BacktestResult }) {
  return (
    <>
      <span className="font-medium text-foreground">Early history treated as cash:</span>{" "}
      {result.cashSubstitutions.map((p) => `${p.ticker} through ${p.through}`).join("; ")}.
      The fixed weights were kept; those allocations earned 0% during the listed periods.
    </>
  );
}

export type Frame = (props: { title: ReactNode; ariaLabel?: string; children: ReactNode }) => ReactNode;
const ClassicFrame: Frame = ({ title, ariaLabel, children }) => (
  <Card className="p-4" aria-label={ariaLabel}>
    <SectionTitle>{title}</SectionTitle>
    {children}
  </Card>
);

const Results = memo(function Results({
  result,
  realizedHref,
}: {
  result: BacktestResult;
  realizedHref?: string;
}) {
  const points = useMemo(() => replayPoints(result), [result]);
  const period = periodFigures(result);
  const summary = [
    { label: SERIES.original, value: period.current, diff: false },
    { label: SERIES.modified, value: period.modified, diff: false },
    { label: `${result.benchmark} benchmark return`, value: period.benchmark, diff: false },
    { label: `${SERIES.original} vs ${result.benchmark}`, value: period.currentActive, diff: true },
    { label: `${SERIES.modified} vs ${result.benchmark}`, value: period.modifiedActive, diff: true },
    { label: "Weight-change delta", value: period.delta, diff: true },
  ];
  return (
    <div className="space-y-6">
      <Card className="p-4 text-body">
        <h2 className="font-medium">Hypothetical replay, not this portfolio’s realized return</h2>
        <p className="text-muted-foreground">
          <ReplayNote result={result} realizedHref={realizedHref} />
        </p>
      </Card>
      {result.cashSubstitutions.length > 0 && (
        <Card className="p-4 text-body text-muted-foreground">
          <CashNote result={result} />
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {summary.map(({ label, value, diff }) => (
          <Card key={label} className="gap-1 p-4">
            <span className="text-body text-muted-foreground">{label}</span>
            <strong
              className={cn("text-display font-semibold tnum", tone(value))}
            >
              {diff ? bp(value) : pct(value)}
            </strong>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <SectionTitle>Cumulative returns</SectionTitle>
        <PerformanceChart
          data={points}
          kind="return"
          ranges={false}
          label="Backtest cumulative returns"
          note="Compounded daily total returns, rebased to the same closing baseline."
          nameMetrics
          series={[
            { key: "original", label: SERIES.original, color: "var(--foreground)" },
            { key: "modified", label: SERIES.modified, color: "var(--up)" },
            {
              key: "benchmark",
              label: result.benchmark,
              color: "var(--muted-foreground)",
              dashed: true,
            },
          ]}
        />
      </Card>
      <DailyDifferences result={result} Frame={ClassicFrame} />
      <Card className="p-4">
        <SectionTitle>Period summary</SectionTitle>
        <Summary result={result} period={period} />
      </Card>
      <Card className="p-4">
        <SectionTitle>
          Contributors, detractors & weight-change impact
        </SectionTitle>
        <Contributors result={result} period={period} />
      </Card>
      <details className="rounded-lg border p-4 text-body text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          Calculation notes
        </summary>
        <CalculationNotes className="mt-3" />
      </details>
    </div>
  );
});

/** The daily heatmap and the selected day's detail, each drawn inside `Frame` (a card or a panel). */
export function DailyDifferences({
  result,
  Frame,
  names = SERIES,
}: {
  result: BacktestResult;
  Frame: Frame;
  /** Series names; the redesign calls them "Today's weights" and "Scenario". */
  names?: { original: string; modified: string };
}) {
  const [date, setDate] = useState(result.days.at(-1)!.date);
  const [mode, setMode] = useState<
    "originalActive" | "modifiedActive" | "delta"
  >("modifiedActive");
  const selected = result.days.find((d) => d.date === date)!;
  const months = [...new Set(result.days.map((d) => d.date.slice(0, 7)))];
  const byDate = new Map(result.days.map((d) => [d.date, d]));
  const modeLabel = {
    modifiedActive: `${names.modified} vs ${result.benchmark}`,
    originalActive: `${names.original} vs ${result.benchmark}`,
    delta: `${names.modified} − ${names.original.toLowerCase()}`,
  };
  return (
    <>
      <Frame title={<>Daily differences · {modeLabel[mode]}</>}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-body">
            <label className="flex items-center gap-2">
              Color by
              <select
                aria-label="Heatmap measure"
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                className="rounded border bg-background p-2"
              >
                {(Object.keys(modeLabel) as (keyof typeof modeLabel)[]).map((key) => (
                  <option key={key} value={key}>
                    {modeLabel[key]}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-body text-muted-foreground">
              {mode === "delta"
                ? `Green: ${names.modified.toLowerCase()} ahead that day · red: ${names.original.toLowerCase()} ahead`
                : `Green: ahead of ${result.benchmark} that day · red: behind ${result.benchmark}`}{" "}
              · neutral: equal · darker: larger (up to 100 bp). Daily colors do not show the full-period result.
            </span>
          </div>
          <div className="grid max-h-[36rem] gap-6 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
            {months.map((month) => {
              const first = new Date(`${month}-01T00:00:00Z`);
              const count = new Date(
                Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
              ).getUTCDate();
              const offset = (first.getUTCDay() + 6) % 7;
              return (
                <div key={month}>
                  <h3 className="mb-2 text-body font-medium">
                    {fmtMonth(`${month}-01`)}
                  </h3>
                  <div className="grid grid-cols-7 gap-1 text-center text-body">
                    {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                      <span key={i} className="pb-1 text-muted-foreground">
                        {d}
                      </span>
                    ))}
                    {Array.from({ length: offset }, (_, i) => (
                      <span key={`pad${i}`} />
                    ))}
                    {Array.from({ length: count }, (_, i) => {
                      const day = `${month}-${String(i + 1).padStart(2, "0")}`,
                        row = byDate.get(day);
                      if (!row)
                        return (
                          <span
                            key={day}
                            className="grid min-h-8 place-items-center rounded bg-muted/30 text-muted-foreground/60"
                            title="Outside replay or no benchmark session"
                          >
                            {i + 1}
                          </span>
                        );
                      const value = row[mode];
                      const label = `${day}: ${modeLabel[mode]} ${bp(value)}`;
                      return (
                        <button
                          type="button"
                          key={day}
                          title={label}
                          aria-label={label}
                          aria-pressed={day === date}
                          onClick={() => setDate(day)}
                          className={cn(
                            "min-h-8 rounded border border-transparent text-body text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                            day === date &&
                              "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                          )}
                          style={{
                            backgroundColor:
                              Math.abs(value) < 1e-12
                                ? "var(--muted)"
                                : `color-mix(in srgb, ${value > 0 ? "var(--up)" : "var(--down)"} ${20 + Math.min(Math.abs(value) / 0.01, 1) * 50}%, var(--background))`,
                          }}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-caption text-muted-foreground">
            Select a trading day for contributions. Blank sessions are not
            assigned a zero return.
          </p>
      </Frame>
      <Frame title={<>Day detail · {date}</>} ariaLabel="Selected day details">
          <div className="overflow-auto">
            <table className="w-full text-body">
              <thead>
                <tr>
                  <th scope="col" className={head}>Return</th>
                  <th scope="col" className={cell}>{names.original}</th>
                  <th scope="col" className={cell}>{names.modified}</th>
                  <th scope="col" className={cell}>Difference</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <th scope="row" className={head}>Portfolio</th>
                  <td className={cell}>{pct(selected.original)}</td>
                  <td className={cell}>{pct(selected.modified)}</td>
                  <td className={cell}>{bp(selected.delta)}</td>
                </tr>
                <tr className="border-t">
                  <th scope="row" className={head}>Benchmark · {result.benchmark}</th>
                  <td className={cell}>{pct(selected.benchmark)}</td>
                  <td className={cell}>{pct(selected.benchmark)}</td>
                  <td className={cell}>{bp(0)}</td>
                </tr>
                <tr className="border-t">
                  <th scope="row" className={head}>Difference vs {result.benchmark}</th>
                  <td className={cell}>{bp(selected.originalActive)}</td>
                  <td className={cell}>{bp(selected.modifiedActive)}</td>
                  <td className={cell}>{bp(selected.delta)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-body">
              <caption className="py-3 text-left text-body text-muted-foreground">
                Holding contributions to daily portfolio return, in percentage
                points.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={head}>Holding</th>
                  <th scope="col" className={cell}>Holding return</th>
                  <th scope="col" className={cell}>{names.original}</th>
                  <th scope="col" className={cell}>{names.modified}</th>
                  <th scope="col" className={cell}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {selected.contributions.map((c) => (
                  <tr key={c.id} className="border-t">
                    <th scope="row" className={head}>{c.ticker}</th>
                    <td className={cell}>{pct(c.return)}</td>
                    <td className={cell}>{bp(c.original)}</td>
                    <td className={cell}>{bp(c.modified)}</td>
                    <td className={cn(cell, tone(c.delta))}>{bp(c.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </Frame>
    </>
  );
}

/** How the replay is calculated. */
export function CalculationNotes({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <p>
        Returns use Yahoo Finance adjusted closing prices for both holdings
        and the selected ETF benchmark, including dividend and split
        adjustments. Returns are calculated as adjusted close / previous
        adjusted close − 1. Each daily portfolio return is the weighted sum
        of holding returns. Cumulative return is the product of (1 + daily
        return) − 1.
      </p>
      <p>
        Volatility is the sample standard deviation of daily returns × √252.
        Drawdown includes the initial value of 1 and is shown as a negative
        peak-to-trough return. Up/down capture is the ratio of geometric
        mean daily portfolio and benchmark returns on
        benchmark-positive/negative days; unavailable subsets show a dash.
        Flat benchmark days enter neither capture ratio.
      </p>
      <p>
        Daily contributions are weight × holding return. Period
        contributions sum each daily contribution multiplied by the
        portfolio’s value at the start of that day. They reconcile to each
        compounded portfolio return; their differences reconcile to the
        weight-change delta. The difference vs the benchmark is portfolio minus
        benchmark return, in basis points; daily differences are not
        compounded separately. Period differences are taken from the returns as
        displayed (rounded to 0.01%), so the figures on screen add up.
      </p>
      <p>
        Cash earns 0%; a holding without earlier adjusted closes earns 0% until its
        first close establishes a return basis. Later missing prices still block a
        run. Trading costs, fees, taxes and historical changes in membership are
        excluded; current selection introduces survivorship and hindsight bias.
        The benchmark’s observed sessions define the replay calendar.
      </p>
    </div>
  );
}

export function Summary({ result, period, names = SERIES }: { result: BacktestResult; period: Period; names?: { original: string; modified: string } }) {
  const rows: [string, keyof Metrics, "return" | "ratio" | "count"][] = [
    ["Cumulative return", "totalReturn", "return"],
    ["Annualized volatility", "volatility", "return"],
    ["Max drawdown", "maxDrawdown", "return"],
    ["Up capture", "upCapture", "ratio"],
    ["Down capture", "downCapture", "ratio"],
    ["Outperforming days", "outDays", "count"],
    ["Underperforming days", "underDays", "count"],
    ["Equal-return days", "equalDays", "count"],
  ];
  return (
    <div className="overflow-auto">
      <table className="w-full text-body">
        <thead>
          <tr>
            <th scope="col" className={head}>Metric</th>
            <th scope="col" className={cell}>{names.original}</th>
            <th scope="col" className={cell}>{names.modified}</th>
            <th scope="col" className={cell}>Benchmark</th>
            <th scope="col" className={cell}>{names === SERIES ? "Delta (modified − current)" : `Delta (${names.modified.toLowerCase()} − ${names.original.toLowerCase()})`}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key, kind]) => {
            // Cumulative returns come from the rounded period figures, matching the cards above.
            const total = key === "totalReturn";
            const a = total ? period.current : result.original[key],
              b = total ? period.modified : result.modified[key],
              d = a === null || b === null ? null : b - a;
            return (
              <tr key={key} className="border-t">
                <th scope="row" className={head}>{label}</th>
                {[a, b, total ? period.benchmark : result.benchmarkMetrics[key]].map((v, i) => (
                  <td key={i} className={cell}>
                    {kind === "count" ? v : pct(v)}
                  </td>
                ))}
                <td className={cell}>
                  {kind === "count" ? fmtAccounting(d, 0) : bp(d)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t">
            <th scope="row" className={head}>Difference vs {result.benchmark}</th>
            <td className={cell}>{bp(period.currentActive)}</td>
            <td className={cell}>{bp(period.modifiedActive)}</td>
            <td className={cell}>{bp(0)}</td>
            <td className={cell}>{bp(period.delta)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
export function Contributors({ result, period, names = SERIES }: { result: BacktestResult; period: Period; names?: { original: string; modified: string } }) {
  const [sort, setSort] = useState<"original" | "modified" | "delta">(
    "modified",
  );
  const sorted = [...result.contributions].sort((a, b) => b[sort] - a[sort]);
  const leaders = sorted.filter((c) => c[sort] > 0).slice(0, 5),
    detractors = sorted
      .filter((c) => c[sort] < 0)
      .reverse()
      .slice(0, 5);
  return (
    <>
      <label className="mb-4 flex items-center gap-2 text-body">
        Rank by
        <select
          aria-label="Contribution ranking"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded border bg-background p-2"
        >
          <option value="modified">{names.modified}</option>
          <option value="original">{names.original}</option>
          <option value="delta">Weight-change delta</option>
        </select>
      </label>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        {[
          ["Top contributors", leaders],
          ["Top detractors", detractors],
        ].map(([label, rows]) => (
          <div key={String(label)} className="rounded-md bg-muted/40 p-3">
            <h3 className="mb-2 text-body font-medium">{String(label)}</h3>
            {(rows as typeof leaders).length ? (
              (rows as typeof leaders).map((c) => (
                <div key={c.id} className="flex justify-between py-1 text-body">
                  <span>{c.ticker}</span>
                  <span className={cn("tnum", tone(c[sort]))}>
                    {bp(c[sort])}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-body text-muted-foreground">
                None in this period.
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-body">
          <thead>
            <tr>
              <th scope="col" className={head}>Holding</th>
              <th scope="col" className={cell}>{names.original} contribution</th>
              <th scope="col" className={cell}>{names.modified} contribution</th>
              <th scope="col" className={cell}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className="border-t">
                <th scope="row" className={head}>{c.ticker}</th>
                <td className={cell}>{bp(c.original)}</td>
                <td className={cell}>{bp(c.modified)}</td>
                <td className={cn(cell, tone(c.delta))}>{bp(c.delta)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <th scope="row" className={head}>Total</th>
              <td className={cell}>{bp(period.current)}</td>
              <td className={cell}>{bp(period.modified)}</td>
              <td className={cell}>{bp(period.delta)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
