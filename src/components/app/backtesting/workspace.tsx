"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Check, Info, Play, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PageHeader } from "@/components/app/page-header";
import { exactDate } from "@/components/charts/primitives";
import {
  BENCHMARKS,
  type BacktestResult,
  type Snapshot,
} from "@/lib/backtesting/engine";
import {
  PRESETS,
  activePreset,
  equalWeights,
  isEdited,
  presetStart,
  requestWeights,
  roundedWeights,
  scaleTo100,
  tidyWeight,
  validWeight,
  weightTotal,
  type WeightInputs,
} from "@/lib/backtesting/scenario";
import { cn } from "@/lib/utils";
import { Results } from "./results";

const FORM_ID = "backtest-scenario";
const legend =
  "mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const two = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");

type Completed = {
  id: number;
  result: BacktestResult;
  weights: WeightInputs;
  from: string;
  to: string;
  benchmark: keyof typeof BENCHMARKS;
};
export function BacktestingWorkspace({
  snapshot,
  defaultFrom,
  defaultTo,
  endpoint = "/api/backtesting",
}: {
  snapshot: Snapshot;
  defaultFrom: string;
  defaultTo: string;
  endpoint?: string;
}) {
  // Saved weights rounded to two decimals; the request still uses the exact saved weights for unedited rows.
  const baseline = useMemo(
    () => roundedWeights(snapshot.positions),
    [snapshot.positions],
  );
  const [weights, setWeights] = useState(baseline);
  const [from, setFrom] = useState(defaultFrom),
    [to, setTo] = useState(defaultTo);
  const [benchmark, setBenchmark] = useState<keyof typeof BENCHMARKS>("SPY");
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showWeights, setShowWeights] = useState(false);
  const inFlight = useRef(false),
    runs = useRef(0);
  const values = Object.values(weights);
  const sum = weightTotal(weights);
  const entriesValid = values.every(validWeight);
  const valid = entriesValid && Math.abs(sum - 100) < 1e-6;
  const scaled = entriesValid && !valid ? scaleTo100(weights) : null;
  const changed = snapshot.positions.filter((p) =>
    isEdited(baseline, weights, p.id),
  ).length;
  const preset = activePreset(from, to, defaultTo);
  const barMax = Math.max(
    1,
    ...Object.values(baseline).map(Number),
    ...values.map((w) => (validWeight(w) ? Number(w) : 0)),
  );
  const q = query.trim().toLowerCase();
  const visible = q
    ? snapshot.positions.filter(
        (p) =>
          p.ticker.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q),
      )
    : snapshot.positions;
  const dirty =
    completed &&
    (completed.from !== from ||
      completed.to !== to ||
      completed.benchmark !== benchmark ||
      JSON.stringify(completed.weights) !== JSON.stringify(weights));
  function resetAll() {
    setWeights(baseline);
    setFrom(defaultFrom);
    setTo(defaultTo);
    setBenchmark("SPY");
    setQuery("");
  }
  async function run(event: FormEvent) {
    event.preventDefault();
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          benchmark,
          version: snapshot.version,
          weights: requestWeights(snapshot.positions, weights, baseline),
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (
        response.redirected ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new Error(
          "Your session expired. Sign in again, then reload this page.",
        );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Unable to replay this period.");
      setCompleted({
        id: ++runs.current,
        result,
        weights: { ...weights },
        from,
        to,
        benchmark,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to run backtest. Please retry.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const runLabel = busy
    ? "Replaying…"
    : valid
      ? "Run backtest"
      : "Fix weights to run";
  const result = completed?.result;
  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader
        title="Backtesting"
        description="Replay today's holdings with different weights and see what the change would have done."
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-background px-2.5 py-1">
              {snapshot.scope} · {snapshot.positions.length} holdings
            </span>
            <Popover>
              <PopoverTrigger className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                <Info className="size-3.5" />
                Assumptions
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-2 p-3">
                <p>
                  Saved weights total {snapshot.savedWeightTotal.toFixed(2)}%.
                  Invested holdings are normalized to 100% for this
                  comparison; cash is excluded.
                </p>
                <p className="text-muted-foreground">
                  The current portfolio is a snapshot of today&apos;s holdings,
                  not historical holdings. Changes here never update your saved
                  portfolio.
                </p>
                <p className="text-xs text-muted-foreground">
                  Fixed weights rebalanced daily · USD total returns · Dividends
                  reinvested · No fees, taxes, or transaction costs
                </p>
              </PopoverContent>
            </Popover>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <form
          id={FORM_ID}
          onSubmit={run}
          aria-label="Scenario"
          className="flex flex-col rounded-xl border bg-card"
        >
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Scenario</h2>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <RotateCcw className="size-3.5" />
              Reset all
            </button>
          </div>

          <fieldset className="shrink-0 space-y-3 border-b px-4 py-4">
            <legend className={cn(legend, "float-left w-full")}>Period</legend>
            <div
              role="group"
              aria-label="Period presets"
              className="clear-both grid grid-cols-7 gap-0.5 rounded-lg bg-muted/60 p-1"
            >
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={preset === p}
                  onClick={() => {
                    setFrom(presetStart(p, defaultTo));
                    setTo(defaultTo);
                  }}
                  className={cn(
                    "rounded-md py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-ring",
                    preset === p
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1.5 text-xs text-muted-foreground">
                <span>From</span>
                <Input
                  type="date"
                  value={from}
                  max={to}
                  required
                  onChange={(e) => setFrom(e.target.value)}
                  className="text-foreground"
                />
              </label>
              <label className="space-y-1.5 text-xs text-muted-foreground">
                <span>To</span>
                <Input
                  type="date"
                  value={to}
                  min={from}
                  max={defaultTo}
                  required
                  onChange={(e) => setTo(e.target.value)}
                  className="text-foreground"
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Up to five years of completed sessions. The start date includes
              that day&apos;s return from the prior close.
            </p>
          </fieldset>

          <fieldset className="shrink-0 border-b px-4 py-4">
            <legend className={cn(legend, "float-left w-full")}>
              Benchmark
            </legend>
            <div className="clear-both grid grid-cols-3 gap-2">
              {Object.entries(BENCHMARKS).map(([key, label]) => {
                const [name, ticker] = label.split(" · ");
                const on = benchmark === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setBenchmark(key as keyof typeof BENCHMARKS)
                    }
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-lg border bg-background px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring",
                      on
                        ? "border-foreground ring-1 ring-foreground"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <span className="text-sm font-semibold">{ticker}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3">
            <div className="flex items-baseline gap-2">
              <h3 className={cn(legend, "mb-0")}>Weights</h3>
              {changed > 0 && (
                <span className="text-xs font-medium text-[var(--series-1)]">
                  {changed} changed
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setWeights(equalWeights(snapshot.positions.map((p) => p.id)))
                }
              >
                Equal weight
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!changed && entriesValid}
                onClick={() => setWeights(baseline)}
              >
                Revert
              </Button>
            </div>
          </div>
          <button
            type="button"
            aria-expanded={showWeights}
            onClick={() => setShowWeights(!showWeights)}
            className="mx-4 mb-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium lg:hidden"
          >
            {showWeights ? "Hide holdings" : `Edit ${snapshot.positions.length} holding weights`}
          </button>
          <div className={cn("flex flex-col", !showWeights && "max-lg:hidden")}>
            <div className="shrink-0 space-y-2.5 px-4 pb-2">
              <label className="relative block">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <span className="sr-only">Filter holdings</span>
                <Input
                  type="search"
                  placeholder="Filter holdings"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8"
                />
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_5.25rem_3.25rem] gap-2 px-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Holding</span>
                <span className="text-right">Now %</span>
                <span className="text-right">Scenario %</span>
                <span className="text-right">Δ</span>
              </div>
            </div>
            <div className="px-2.5 pb-3">
              {visible.length === 0 && (
                <p className="px-1.5 py-4 text-sm text-muted-foreground">
                  No holdings match “{query}”.
                </p>
              )}
              {visible.map((p) => {
                const input = weights[p.id];
                const ok = validWeight(input);
                const saved = Number(baseline[p.id]);
                const edited = ok && isEdited(baseline, weights, p.id);
                const delta = ok ? Number(input) - saved : null;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_3.25rem_5.25rem_3.25rem] items-center gap-2 rounded-lg px-1.5 py-1.5",
                      edited &&
                        "bg-[color-mix(in_srgb,var(--series-1)_7%,transparent)]",
                    )}
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <span className="text-sm font-semibold">{p.ticker}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {p.name}
                        </span>
                      </div>
                      <div className="relative h-1 rounded-full bg-muted" aria-hidden>
                        <div
                          className={cn(
                            "absolute inset-y-0 left-0 rounded-full",
                            edited ? "bg-[var(--series-1)]" : "bg-muted-foreground/40",
                          )}
                          style={{
                            width: `${ok ? Math.min(Number(input) / barMax, 1) * 100 : 0}%`,
                          }}
                        />
                        <div
                          className="absolute -top-0.5 h-2 w-0.5 rounded-full bg-foreground"
                          style={{ left: `${(saved / barMax) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-right text-sm text-muted-foreground tnum">
                      {baseline[p.id]}
                    </span>
                    <Input
                      aria-label={`${p.ticker} scenario weight, percent`}
                      aria-invalid={!ok || undefined}
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      inputMode="decimal"
                      value={input}
                      onChange={(e) =>
                        setWeights({ ...weights, [p.id]: e.target.value })
                      }
                      onBlur={(e) => {
                        const tidy = tidyWeight(e.target.value);
                        if (tidy !== e.target.value)
                          setWeights({ ...weights, [p.id]: tidy });
                      }}
                      required
                      className={cn(
                        "h-8 px-2 text-right tnum",
                        edited && "border-[var(--series-1)]",
                      )}
                    />
                    <span
                      className={cn(
                        "text-right text-xs font-medium tnum",
                        delta === null || !edited
                          ? "text-muted-foreground"
                          : delta > 0
                            ? "text-up"
                            : "text-down",
                      )}
                    >
                      {delta === null
                        ? "?"
                        : edited
                          ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`
                          : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* The list scrolls with the page, so the total and Run button stay pinned while you edit. */}
          <div className="shrink-0 space-y-3 rounded-b-xl border-t bg-card px-4 py-4 lg:sticky lg:bottom-0 lg:z-10 lg:shadow-[0_-8px_16px_-12px_rgb(0_0_0/0.25)]">
            <div
              aria-live="polite"
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">Scenario total</span>
              <span
                className={cn(
                  "font-semibold tnum",
                  valid ? "text-up" : "text-destructive",
                )}
              >
                {two(sum)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className={cn("h-full", valid ? "bg-up" : "bg-destructive")}
                style={{
                  width: `${Number.isFinite(sum) ? Math.min(Math.max(sum, 0), 100) : 0}%`,
                }}
              />
            </div>
            {valid ? (
              <p className="flex items-center gap-1.5 text-xs text-up">
                <Check className="size-3.5" />
                Balanced · cash excluded, invested sleeve at 100%
              </p>
            ) : (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <span>
                  {entriesValid
                    ? `${two(Math.abs(sum - 100))}% ${sum > 100 ? "over" : "under"}. Weights must total 100%.`
                    : "Each weight must be a number from 0 to 100."}
                </span>
                {scaled && (
                  <button
                    type="button"
                    onClick={() => setWeights(scaled)}
                    className="shrink-0 rounded-md border border-destructive/30 bg-background px-2 py-1 font-medium hover:bg-destructive/5"
                  >
                    Scale to 100%
                  </button>
                )}
              </div>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={!valid || busy}
              className="hidden w-full lg:flex"
            >
              <Play className="size-3.5 fill-current" />
              {runLabel}
            </Button>
          </div>
        </form>

        <section aria-label="Results" className="min-w-0 space-y-4">
          <div role="status" aria-live="polite" className="sr-only">
            {busy
              ? "Fetching adjusted history and calculating every trading day…"
              : dirty
                ? "Scenario changed. Results show the last completed run."
                : result
                  ? `${result.days.length} trading days replayed.`
                  : ""}
          </div>
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          {dirty && !busy && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
              <span>
                <strong className="font-semibold">Scenario changed.</strong>{" "}
                <span className="text-muted-foreground">
                  Results below are from your last run.
                </span>
              </span>
              <Button type="submit" form={FORM_ID} size="sm" disabled={!valid}>
                {valid ? "Run again" : "Fix weights to run"}
              </Button>
            </div>
          )}
          {completed && result ? (
            <div
              className={cn(
                "space-y-4 transition-opacity motion-reduce:transition-none",
                (dirty || busy) && "opacity-55",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground tnum">
                <span>
                  {exactDate(result.days[0].date)} –{" "}
                  {exactDate(result.days.at(-1)!.date)} · {result.days.length}{" "}
                  trading days · vs {BENCHMARKS[completed.benchmark]}
                </span>
                <span>Baseline close {exactDate(result.baseline)}</span>
              </div>
              <Results
                key={completed.id}
                result={result}
                positions={snapshot.positions}
                weights={completed.weights}
                baseline={baseline}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-sm">
              <h2 className="font-semibold">
                {busy ? "Replaying your scenario…" : "No results yet"}
              </h2>
              <p className="mt-1 max-w-md text-muted-foreground">
                {busy
                  ? "Fetching adjusted price history and calculating every trading day. Longer periods take a little longer."
                  : "Pick a period and benchmark, adjust any weights, then run the backtest. Your current weights are replayed alongside the scenario so you can see exactly what your changes would have done."}
              </p>
              {busy && (
                <div className="mt-5 space-y-3" aria-hidden>
                  <div className="h-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
                  <div className="h-56 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex-1 text-xs text-muted-foreground">
          Scenario total
          <div
            className={cn(
              "text-sm font-semibold tnum",
              valid ? "text-up" : "text-destructive",
            )}
          >
            {two(sum)}%
          </div>
        </div>
        <Button type="submit" form={FORM_ID} size="lg" disabled={!valid || busy}>
          <Play className="size-3.5 fill-current" />
          {runLabel}
        </Button>
      </div>
    </div>
  );
}
