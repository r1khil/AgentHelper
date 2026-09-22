"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestResult } from "@/lib/backtesting/engine";
import {
  ChartLegend,
  ChartTooltip,
  RangeControlGroup,
  chartTick,
  exactDate,
  rangeControlClass,
} from "@/components/charts/primitives";

type Mode = "growth" | "drawdown" | "difference";
type Row = { date: string; [key: string]: string | number };

const MODES: { id: Mode; label: string }[] = [
  { id: "growth", label: "Cumulative" },
  { id: "drawdown", label: "Drawdown" },
  { id: "difference", label: "Scenario − current" },
];
const KEYS = ["modified", "original", "benchmark"] as const;
const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function rows(result: BacktestResult, mode: Mode): Row[] {
  const cumulative = [
    {
      date: result.baseline,
      modified: 0,
      original: 0,
      benchmark: 0,
    },
    ...result.days.map((d) => ({
      date: d.date,
      modified: d.modifiedCumulative,
      original: d.originalCumulative,
      benchmark: d.benchmarkCumulative,
    })),
  ];
  if (mode === "growth")
    return cumulative.map((r) => ({
      date: r.date,
      modified: (1 + r.modified) * 100,
      original: (1 + r.original) * 100,
      benchmark: (1 + r.benchmark) * 100,
    }));
  if (mode === "difference")
    return cumulative.map((r) => ({
      date: r.date,
      difference: (r.modified - r.original) * 100,
    }));
  // Drawdown matches the engine: the peak includes the starting value of 1.
  const peaks = { modified: 1, original: 1, benchmark: 1 };
  return cumulative.map((r) => {
    const row: Row = { date: r.date };
    for (const key of KEYS) {
      const nav = 1 + r[key];
      peaks[key] = Math.max(peaks[key], nav);
      row[key] = (nav / peaks[key] - 1) * 100;
    }
    return row;
  });
}

export function BacktestChart({ result }: { result: BacktestResult }) {
  const [mode, setMode] = useState<Mode>("growth");
  const data = useMemo(() => rows(result, mode), [result, mode]);
  const series =
    mode === "difference"
      ? [
          {
            key: "difference",
            label: "Scenario − current",
            color: "var(--series-1)",
          },
        ]
      : [
          { key: "modified", label: "Scenario", color: "var(--series-1)" },
          { key: "original", label: "Current", color: "var(--foreground)" },
          {
            key: "benchmark",
            label: result.benchmark,
            color: "var(--muted-foreground)",
            dashed: true,
          },
        ];
  const format = (v: number) =>
    mode === "growth"
      ? v.toFixed(2)
      : `${v > 0 ? "+" : ""}${v.toFixed(2)}${mode === "difference" ? " pp" : "%"}`;
  const title =
    mode === "growth"
      ? "Growth of $100"
      : mode === "drawdown"
        ? "Drawdown from peak"
        : "Scenario minus current";
  return (
    <section aria-label={title} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <RangeControlGroup label="Chart measure">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className={rangeControlClass(mode === m.id)}
            >
              {m.label}
            </button>
          ))}
        </RangeControlGroup>
      </div>
      <div className="financial-chart-enter h-64 w-full sm:h-72" key={mode}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={chartTick}
              minTickGap={48}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) =>
                mode === "growth"
                  ? v.toFixed(0)
                  : `${v.toFixed(1)}${mode === "drawdown" ? "%" : ""}`
              }
              tick={chartTick}
              width={44}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
            />
            <ReferenceLine
              y={mode === "growth" ? 100 : 0}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.4}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }}
              isAnimationActive={false}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip label={exactDate(String(label))}>
                    {series.map((s) => {
                      const value = payload.find((p) => p.dataKey === s.key)
                        ?.value as number | undefined;
                      return (
                        <div key={s.key} className="flex justify-between gap-4">
                          <span>{s.label}</span>
                          <span>{value == null ? "—" : format(value)}</span>
                        </div>
                      );
                    })}
                  </ChartTooltip>
                ) : null
              }
            />
            {[...series].reverse().map((s) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                stroke={s.color}
                strokeDasharray={"dashed" in s && s.dashed ? "5 4" : undefined}
                strokeWidth={s.key === "modified" || s.key === "difference" ? 2.25 : 1.5}
                dot={data.length <= 3 ? { r: 3 } : false}
                activeDot={{ r: 3.5 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        series={series}
        note={
          mode === "growth"
            ? "Daily-rebalanced fixed weights, rebased to the baseline close."
            : mode === "drawdown"
              ? "Each line's decline from its own running peak."
              : "Cumulative return difference, in percentage points."
        }
      />
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">
          View observations ({data.length})
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded border">
          <table className="w-full text-left tnum">
            <caption className="sr-only">{title}, daily observations</caption>
            <thead>
              <tr>
                <th className="p-2">Date</th>
                {series.map((s) => (
                  <th key={s.key} className="p-2">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.date} className="border-t">
                  <th className="p-2 font-normal whitespace-nowrap">
                    {r.date}
                  </th>
                  {series.map((s) => (
                    <td key={s.key} className="p-2 whitespace-nowrap">
                      {format(Number(r[s.key]))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
