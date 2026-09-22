"use client";

import { memo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RangeControlGroup,
  exactDate,
  rangeControlClass,
} from "@/components/charts/primitives";
import type {
  BacktestResult,
  Metrics,
  Position,
} from "@/lib/backtesting/engine";
import { weightChanged, type WeightInputs } from "@/lib/backtesting/scenario";
import { cn } from "@/lib/utils";
import { BacktestChart } from "./chart";

/** Signed percentage-point number; values that round to zero show unsigned rather than as "-0.00". */
const num = (v: number | null, digits = 2) => {
  if (v === null) return "—";
  const fixed = (v * 100).toFixed(digits);
  return Number(fixed) === 0
    ? (0).toFixed(digits)
    : `${v > 0 ? "+" : ""}${fixed}`;
};
const pct = (v: number | null) => (v === null ? "—" : `${num(v)}%`);
const pp = (v: number | null) => (v === null ? "—" : `${num(v)} pp`);
const tone = (v: number) =>
  v > 1e-12 ? "text-up" : v < -1e-12 ? "text-down" : "text-muted-foreground";
const cell = "px-3 py-2.5 text-right tnum whitespace-nowrap";
const head = "px-3 py-2.5 text-left font-medium text-muted-foreground";
const card = "rounded-xl border bg-card";

type Props = {
  result: BacktestResult;
  positions: Position[];
  weights: WeightInputs;
};

export const Results = memo(function Results({
  result,
  positions,
  weights,
}: Props) {
  return (
    <div className="space-y-4">
      <Kpis result={result} />
      <div className={cn(card, "p-4 sm:p-5")}>
        <BacktestChart result={result} />
      </div>
      <Tabs defaultValue="changed" className={cn(card, "gap-0")}>
        <div className="overflow-x-auto border-b px-2 sm:px-4">
          <TabsList variant="line" className="h-11">
            <TabsTrigger value="changed">What changed</TabsTrigger>
            <TabsTrigger value="daily">Daily calendar</TabsTrigger>
            <TabsTrigger value="holdings">All holdings</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="method">Method</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="changed" className="p-4 sm:p-5">
          <WhatChanged result={result} positions={positions} weights={weights} />
        </TabsContent>
        <TabsContent value="daily">
          <DailyCalendar result={result} positions={positions} weights={weights} />
        </TabsContent>
        <TabsContent value="holdings" className="p-4 sm:p-5">
          <Contributors result={result} />
        </TabsContent>
        <TabsContent value="metrics" className="p-4 sm:p-5">
          <Summary result={result} />
        </TabsContent>
        <TabsContent value="method" className="p-4 sm:p-5">
          <Method />
        </TabsContent>
      </Tabs>
    </div>
  );
});

function Kpis({ result }: { result: BacktestResult }) {
  const { original: o, modified: m, benchmarkMetrics: b } = result;
  const delta = m.totalReturn - o.totalReturn;
  const diff = (a: number | null, z: number | null) =>
    a === null || z === null ? null : a - z;
  const ratio = (v: number | null) => (v === null ? "—" : v.toFixed(2));
  const ratioDelta = (v: number | null) =>
    v === null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  const days = result.days.length;
  const stats: {
    label: string;
    value: string;
    delta: string;
    good: number | null;
  }[] = [
    {
      label: "Volatility (ann.)",
      value: m.volatility === null ? "—" : `${(m.volatility * 100).toFixed(1)}%`,
      delta: diff(m.volatility, o.volatility) === null
        ? ""
        : `${num(diff(m.volatility, o.volatility), 1)} pp`,
      // Higher volatility is not better or worse on its own.
      good: null,
    },
    {
      label: "Max drawdown",
      value: `${(m.maxDrawdown * 100).toFixed(1)}%`,
      delta: `${num(m.maxDrawdown - o.maxDrawdown, 1)} pp`,
      good: m.maxDrawdown - o.maxDrawdown,
    },
    {
      label: "Up capture",
      value: ratio(m.upCapture),
      delta: ratioDelta(diff(m.upCapture, o.upCapture)),
      good: diff(m.upCapture, o.upCapture),
    },
    {
      label: "Down capture",
      value: ratio(m.downCapture),
      delta: ratioDelta(diff(m.downCapture, o.downCapture)),
      good:
        diff(m.downCapture, o.downCapture) === null
          ? null
          : -diff(m.downCapture, o.downCapture)!,
    },
    {
      label: `Days beating ${result.benchmark}`,
      value: `${m.outDays} / ${days}`,
      delta: `${m.outDays - o.outDays >= 0 ? "+" : ""}${m.outDays - o.outDays}`,
      good: m.outDays - o.outDays,
    },
  ];
  const heroes = [
    {
      label: "Scenario return",
      value: pct(m.totalReturn),
      hint: "Your edited weights",
      swatch: "bg-[var(--series-1)]",
    },
    {
      label: "Current weights",
      value: pct(o.totalReturn),
      hint: "Snapshot as held today",
      swatch: "bg-foreground",
    },
    {
      label: result.benchmark,
      value: pct(b.totalReturn),
      hint: "Total return, dividends in",
      swatch: "border-t-2 border-dashed border-muted-foreground bg-transparent",
    },
  ];
  return (
    <div className={card}>
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {heroes.map((h, i) => (
          <div
            key={h.label}
            className={cn(
              "flex flex-col gap-1 p-4 lg:border-r",
              i < 2 && "border-b lg:border-b-0",
              i % 2 === 0 && "border-r",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("inline-block h-0.5 w-3 rounded", h.swatch)} />
              {h.label}
            </span>
            <strong className="text-xl font-semibold tracking-tight tnum sm:text-2xl">
              {h.value}
            </strong>
            <span className="hidden text-xs text-muted-foreground sm:block">
              {h.hint}
            </span>
          </div>
        ))}
        <div
          className={cn(
            "flex flex-col gap-1 p-4 lg:rounded-tr-xl",
            delta > 1e-12
              ? "bg-up/8"
              : delta < -1e-12
                ? "bg-down/8"
                : "bg-muted/40",
          )}
        >
          <span className="text-xs text-muted-foreground">
            Effect of your changes
          </span>
          <strong
            className={cn(
              "text-xl font-semibold tracking-tight tnum sm:text-2xl",
              tone(delta),
            )}
          >
            {pp(delta)}
          </strong>
          <span className="hidden text-xs text-muted-foreground sm:block">
            Scenario minus current
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-2 border-t sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 px-4 py-3">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-2 tnum">
              <span className="text-sm font-semibold">{s.value}</span>
              {s.delta && (
                <span
                  className={cn(
                    "text-xs",
                    s.good === null ? "text-muted-foreground" : tone(s.good),
                  )}
                >
                  {s.delta}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function WhatChanged({ result, positions, weights }: Props) {
  const byId = new Map(result.contributions.map((c) => [c.id, c]));
  const edited = positions.filter((p) => weightChanged(p.weight, weights[p.id]));
  const unchanged = positions.filter(
    (p) => !weightChanged(p.weight, weights[p.id]),
  );
  const rest = unchanged.reduce(
    (s, p) => {
      const c = byId.get(p.id);
      return c
        ? { original: s.original + c.original, modified: s.modified + c.modified }
        : s;
    },
    { original: 0, modified: 0 },
  );
  const rows = [
    ...edited
      .map((p) => {
        const c = byId.get(p.id)!;
        return {
          key: p.id,
          label: p.ticker,
          sub: `${(p.weight * 100).toFixed(2).replace(/\.?0+$/, "")}% → ${Number(weights[p.id]).toFixed(2).replace(/\.?0+$/, "")}%`,
          original: c.original,
          modified: c.modified,
          delta: c.delta,
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    ...(unchanged.length
      ? [
          {
            key: "unchanged",
            label: `${unchanged.length} unchanged`,
            sub: "Compounding effects only",
            original: rest.original,
            modified: rest.modified,
            delta: rest.modified - rest.original,
          },
        ]
      : []),
  ];
  if (!edited.length)
    return (
      <p className="text-sm text-muted-foreground">
        No weights were changed in this run, so the scenario matches your
        current weights. Edit weights in the scenario panel and run again to see
        what the change would have done.
      </p>
    );
  const scale = Math.max(...rows.map((r) => Math.abs(r.delta)), 1e-9);
  const grid =
    "grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3 sm:grid-cols-[9rem_4.5rem_4.5rem_minmax(0,1fr)_4.5rem]";
  const total = result.modified.totalReturn - result.original.totalReturn;
  return (
    <div className="text-sm">
      <p className="mb-3 text-muted-foreground">
        How each weight change moved the result, as contribution to total
        return in percentage points.
      </p>
      <div
        className={cn(
          grid,
          "border-b pb-2 text-xs font-medium text-muted-foreground",
        )}
      >
        <span>Holding</span>
        <span className="text-right">Current</span>
        <span className="text-right">Scenario</span>
        <span className="hidden text-center sm:block">Impact</span>
        <span className="hidden text-right sm:block">Δ pp</span>
      </div>
      {rows.map((r) => {
        const half = Math.max((Math.abs(r.delta) / scale) * 50, 0.5);
        return (
          <div key={r.key} className={cn(grid, "border-b py-2.5 last:border-0")}>
            <div className="min-w-0">
              <div
                className={cn(
                  "font-semibold",
                  r.key === "unchanged" && "text-muted-foreground",
                )}
              >
                {r.label}
                <span className={cn("ml-2 text-xs font-medium tnum sm:hidden", tone(r.delta))}>
                  {num(r.delta)}
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {r.sub}
              </div>
            </div>
            <span className="text-right text-muted-foreground tnum">
              {num(r.original)}
            </span>
            <span className="text-right text-muted-foreground tnum">
              {num(r.modified)}
            </span>
            <div className="relative hidden h-3.5 sm:block" aria-hidden>
              <div className="absolute inset-y-[-4px] left-1/2 w-px bg-border" />
              <div
                className={cn(
                  "absolute top-0.5 h-2.5 rounded-sm",
                  r.delta >= 0 ? "bg-up" : "bg-down",
                )}
                style={{
                  left: `${r.delta >= 0 ? 50 : 50 - half}%`,
                  width: `${half}%`,
                }}
              />
            </div>
            <span
              className={cn(
                "hidden text-right font-semibold tnum sm:block",
                tone(r.delta),
              )}
            >
              {num(r.delta)}
            </span>
          </div>
        );
      })}
      <div className={cn(grid, "pt-3 font-semibold")}>
        <span>Total effect</span>
        <span className="text-right tnum">{num(result.original.totalReturn)}</span>
        <span className="text-right tnum">{num(result.modified.totalReturn)}</span>
        <span className="hidden sm:block" />
        <span className={cn("hidden text-right tnum sm:block", tone(total))}>
          {num(total)}
        </span>
      </div>
    </div>
  );
}

type HeatMode = "modifiedActive" | "originalActive" | "delta";

function DailyCalendar({ result, positions, weights }: Props) {
  const [mode, setMode] = useState<HeatMode>("modifiedActive");
  const [index, setIndex] = useState(result.days.length - 1);
  const [showAll, setShowAll] = useState(false);
  const selected = result.days[index];
  const byDate = new Map(result.days.map((d, i) => [d.date, i]));
  const first = result.days[0].date,
    last = result.days.at(-1)!.date;
  // The weight-change delta is an order of magnitude smaller than active return.
  const cap = mode === "delta" ? 0.0025 : 0.01;
  const shade = (v: number) =>
    Math.abs(v) < 1e-12
      ? "var(--muted)"
      : `color-mix(in srgb, ${v > 0 ? "var(--up)" : "var(--down)"} ${14 + Math.min(Math.abs(v) / cap, 1) * 56}%, var(--background))`;
  const months = [...new Set(result.days.map((d) => d.date.slice(0, 7)))];
  const edited = new Set(
    positions.filter((p) => weightChanged(p.weight, weights[p.id])).map((p) => p.id),
  );
  const contributions = [...selected.contributions].sort(
    (a, b) =>
      Number(edited.has(b.id)) - Number(edited.has(a.id)) ||
      Math.abs(b.modified) - Math.abs(a.modified),
  );
  const shown = showAll ? contributions : contributions.slice(0, 8);
  const modes: [HeatMode, string][] = [
    ["modifiedActive", `Scenario vs ${result.benchmark}`],
    ["originalActive", `Current vs ${result.benchmark}`],
    ["delta", "Scenario − current"],
  ];
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4 p-4 sm:p-5 lg:border-r">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangeControlGroup label="Color days by">
            {modes.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
                className={rangeControlClass(mode === id)}
              >
                {label}
              </button>
            ))}
          </RangeControlGroup>
          <div
            className="flex items-center gap-2 text-[11px] text-muted-foreground"
            aria-hidden
          >
            <span>−{mode === "delta" ? "0.25" : "1"} pp</span>
            <div className="flex gap-0.5">
              {[-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((k) => (
                <span
                  key={k}
                  className="h-3 w-4 rounded-[3px]"
                  style={{ backgroundColor: shade(k * cap) }}
                />
              ))}
            </div>
            <span>+{mode === "delta" ? "0.25" : "1"} pp</span>
          </div>
        </div>
        <div className="grid max-h-[34rem] gap-6 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
          {months.map((month) => {
            const [y, m] = month.split("-").map(Number);
            const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
            const cells: ReactNode[] = [];
            let beat = 0,
              total = 0;
            for (let day = 1; day <= count; day++) {
              const date = `${month}-${String(day).padStart(2, "0")}`;
              const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
              if (weekday === 0 || weekday === 6) continue;
              if (!cells.length)
                for (let pad = 1; pad < weekday; pad++)
                  cells.push(<span key={`pad${pad}`} />);
              const i = byDate.get(date);
              if (i === undefined) {
                const outside = date < first || date > last;
                cells.push(
                  <span
                    key={date}
                    title={outside ? "Outside the replay" : "No benchmark session"}
                    className={cn(
                      "grid h-10 place-items-center rounded-md text-xs text-muted-foreground/60",
                      !outside && "border border-dashed",
                    )}
                  >
                    {day}
                  </span>,
                );
                continue;
              }
              const value = result.days[i][mode];
              total++;
              if (value > 1e-12) beat++;
              const label = `${exactDate(date)}: ${pp(value)}`;
              cells.push(
                <button
                  key={date}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={i === index}
                  onClick={() => setIndex(i)}
                  className={cn(
                    "flex h-10 flex-col items-center justify-center rounded-md text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                    i === index &&
                      "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                  )}
                  style={{ backgroundColor: shade(value) }}
                >
                  <span className="text-xs font-semibold leading-none">{day}</span>
                  <span className="mt-0.5 text-[9px] leading-none tnum opacity-80">
                    {num(value, mode === "delta" ? 2 : 1)}
                  </span>
                </button>,
              );
            }
            return (
              <div key={month}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </h3>
                  <span className="text-xs text-muted-foreground tnum">
                    {beat} of {total} {mode === "delta" ? "helped" : "beat"}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                    <span key={d} className="pb-0.5 text-[11px] text-muted-foreground">
                      {d}
                    </span>
                  ))}
                  {cells}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Weekends are hidden. Dashed days had no benchmark session; they are
          never assigned a zero return. Select a day to see what drove it.
        </p>
      </div>
      <aside
        aria-label="Selected day"
        aria-live="polite"
        className="space-y-3 border-t bg-muted/20 p-4 sm:p-5 lg:border-t-0"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{exactDate(selected.date)}</h3>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous trading day"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              className="grid size-8 place-items-center rounded-md border bg-background disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next trading day"
              disabled={index === result.days.length - 1}
              onClick={() => setIndex(index + 1)}
              className="grid size-8 place-items-center rounded-md border bg-background disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Scenario", selected.modified, "text-[var(--series-1)]"],
            ["Current", selected.original, "text-muted-foreground"],
            [result.benchmark, selected.benchmark, "text-muted-foreground"],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-lg border bg-background px-3 py-2">
              <div className={cn("text-[11px] font-medium", String(color))}>
                {String(label)}
              </div>
              <div className="text-sm font-semibold tnum">{pct(Number(value))}</div>
            </div>
          ))}
        </div>
        <dl className="space-y-1.5 text-sm">
          {[
            [`Scenario vs ${result.benchmark}`, selected.modifiedActive],
            [`Current vs ${result.benchmark}`, selected.originalActive],
            ["Effect of your changes", selected.delta],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{String(label)}</dt>
              <dd className={cn("font-semibold tnum", tone(Number(value)))}>
                {pp(Number(value))}
              </dd>
            </div>
          ))}
        </dl>
        <table className="w-full border-t text-sm">
          <caption className="pt-3 pb-1 text-left text-xs text-muted-foreground">
            Contribution to the day&apos;s return, pp
          </caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1.5 text-left font-medium">Holding</th>
              <th className="py-1.5 text-right font-medium">Return</th>
              <th className="py-1.5 text-right font-medium">Scenario</th>
              <th className="py-1.5 text-right font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-t">
                <th className="py-1.5 text-left font-semibold">
                  {c.ticker}
                  {edited.has(c.id) && (
                    <span className="ml-1.5 rounded bg-[color-mix(in_srgb,var(--series-1)_14%,transparent)] px-1 py-px text-[10px] font-medium text-[var(--series-1)]">
                      edited
                    </span>
                  )}
                </th>
                <td className="py-1.5 text-right text-muted-foreground tnum">
                  {pct(c.return)}
                </td>
                <td className="py-1.5 text-right text-muted-foreground tnum">
                  {num(c.modified)}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right tnum",
                    edited.has(c.id) ? tone(c.delta) : "text-muted-foreground",
                  )}
                >
                  {edited.has(c.id) ? num(c.delta) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contributions.length > 8 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-sm font-medium text-[var(--series-1)] hover:underline"
          >
            {showAll ? "Show fewer" : `Show all ${contributions.length} holdings`}
          </button>
        )}
      </aside>
    </div>
  );
}

function Summary({ result }: { result: BacktestResult }) {
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
  const fmt = (v: number | null, kind: string) =>
    v === null ? "—" : kind === "count" ? String(v) : kind === "ratio" ? v.toFixed(2) : pct(v);
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={head}>Metric</th>
            <th className={cell}>Scenario</th>
            <th className={cell}>Current</th>
            <th className={cell}>{result.benchmark}</th>
            <th className={cell}>Scenario − current</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key, kind]) => {
            const a = result.original[key],
              b = result.modified[key],
              d = a === null || b === null ? null : b - a;
            return (
              <tr key={key} className="border-t">
                <th className={head}>{label}</th>
                <td className={cell}>{fmt(b, kind)}</td>
                <td className={cell}>{fmt(a, kind)}</td>
                <td className={cell}>{fmt(result.benchmarkMetrics[key], kind)}</td>
                <td className={cell}>
                  {d === null
                    ? "—"
                    : kind === "count"
                      ? `${d >= 0 ? "+" : ""}${d}`
                      : kind === "ratio"
                        ? `${d >= 0 ? "+" : ""}${d.toFixed(2)}`
                        : pp(d)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t">
            <th className={head}>Active return</th>
            <td className={cell}>
              {pp(result.modified.totalReturn - result.benchmarkMetrics.totalReturn)}
            </td>
            <td className={cell}>
              {pp(result.original.totalReturn - result.benchmarkMetrics.totalReturn)}
            </td>
            <td className={cell}>{pp(0)}</td>
            <td className={cell}>
              {pp(result.modified.totalReturn - result.original.totalReturn)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Contributors({ result }: { result: BacktestResult }) {
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
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Rank by</span>
        <RangeControlGroup label="Contribution ranking">
          {(
            [
              ["modified", "Scenario"],
              ["original", "Current"],
              ["delta", "Effect of changes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={sort === id}
              onClick={() => setSort(id)}
              className={rangeControlClass(sort === id)}
            >
              {label}
            </button>
          ))}
        </RangeControlGroup>
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        {(
          [
            ["Top contributors", leaders],
            ["Top detractors", detractors],
          ] as const
        ).map(([label, rows]) => (
          <div key={label} className="rounded-lg bg-muted/40 p-3">
            <h3 className="mb-2 text-sm font-medium">{label}</h3>
            {rows.length ? (
              rows.map((c) => (
                <div key={c.id} className="flex justify-between py-1 text-sm">
                  <span>{c.ticker}</span>
                  <span className={cn("tnum", tone(c[sort]))}>{pp(c[sort])}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">None in this period.</p>
            )}
          </div>
        ))}
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr>
              <th className={head}>Holding</th>
              <th className={cell}>Current contribution</th>
              <th className={cell}>Scenario contribution</th>
              <th className={cell}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className="border-t">
                <th className={head}>{c.ticker}</th>
                <td className={cell}>{pp(c.original)}</td>
                <td className={cell}>{pp(c.modified)}</td>
                <td className={cn(cell, tone(c.delta))}>{pp(c.delta)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <th className={head}>Total</th>
              <td className={cell}>{pp(result.original.totalReturn)}</td>
              <td className={cell}>{pp(result.modified.totalReturn)}</td>
              <td className={cell}>
                {pp(result.modified.totalReturn - result.original.totalReturn)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function Method() {
  return (
    <div className="max-w-3xl space-y-3 text-sm text-muted-foreground">
      <p>
        Returns use Yahoo Finance adjusted closing prices for both holdings and
        the selected ETF benchmark, including dividend and split adjustments.
        Returns are calculated as adjusted close / previous adjusted close − 1.
        Each daily portfolio return is the weighted sum of holding returns.
        Cumulative return is the product of (1 + daily return) − 1.
      </p>
      <p>
        Volatility is the sample standard deviation of daily returns × √252.
        Drawdown includes the initial value of 1 and is shown as a negative
        peak-to-trough return. Up/down capture is the ratio of geometric mean
        daily portfolio and benchmark returns on benchmark-positive/negative
        days; unavailable subsets show a dash. Flat benchmark days enter neither
        capture ratio.
      </p>
      <p>
        Daily contributions are weight × holding return. Period contributions
        sum each daily contribution multiplied by the portfolio’s value at the
        start of that day. They reconcile to each compounded portfolio return;
        their differences reconcile to the weight-change effect. Active return
        is portfolio minus benchmark, in percentage points; active returns are
        not compounded separately.
      </p>
      <p>
        This is a hypothetical replay of current holdings. It excludes cash,
        trading costs, taxes and historical changes in membership; current
        selection introduces survivorship and hindsight bias. Missing holding
        prices block a run. The benchmark’s observed sessions define the replay
        calendar.
      </p>
    </div>
  );
}
