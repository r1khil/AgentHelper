"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChartLegend, chartGrid, chartTick, exactDate, tickDate, tone, valueAxis } from "@/components/charts/primitives";
import { useId } from "react";
import { RechartsScrubber, SelectionReadout, scrubHelp, useChartSelection } from "@/components/charts/interaction";
import { intervalChange } from "@/lib/charts/interval";
import { fmtPct } from "@/lib/format";

export type StressPathPoint = { date: string; fund: number; market: number; benchmark: number | null };

/** Cumulative return through a stress window: today's portfolio held from the first close, the S&P 500 and the sector benchmark. */
export function StressPathChart({ data, fundLabel, benchmarkLabel }: { data: StressPathPoint[]; fundLabel: string; benchmarkLabel: string }) {
  const helpId = useId();
  const { selection, dispatch, bounds } = useChartSelection(data[0]?.date, data.length);
  const hasBench = data.some((d) => d.benchmark !== null);
  const plotted = data.map((d) => ({ date: d.date, fund: d.fund * 100, market: d.market * 100, benchmark: d.benchmark === null ? null : d.benchmark * 100 }));
  // Round ticks over every line, always including the 0% start.
  const axis = valueAxis([...plotted.flatMap((d) => [d.fund, d.market, d.benchmark]), 0], fmtPct);
  const lines = [{ key: "fund", label: fundLabel, color: "var(--series-1)" }, { key: "market", label: "S&P 500 (SPY)", color: "var(--series-neutral)" }, ...(hasBench ? [{ key: "benchmark", label: benchmarkLabel, color: "var(--series-2)" }] : [])];
  const selected = plotted[bounds?.[1] ?? selection.active ?? plotted.length - 1];
  const first = bounds ? plotted[bounds[0]] : null;
  return (
    <div>
      <div className="relative h-52 w-full" style={{ touchAction: "pan-y" }} role="group" aria-label={`${fundLabel}, S&P 500 and sector benchmark cumulative return through the window`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={plotted} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={chartGrid} syncWithTicks />
            <XAxis dataKey="date" tick={chartTick} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d: string) => tickDate(d)} />
            <YAxis tick={chartTick} tickLine={false} axisLine={false} width={44} {...axis} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
            <Line type="linear" dataKey="fund" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={false} />
            <Line type="linear" dataKey="market" stroke="var(--series-neutral)" strokeDasharray="4 3" strokeWidth={1.25} dot={false} isAnimationActive={false} activeDot={false} />
            {hasBench && <Line type="linear" dataKey="benchmark" stroke="var(--series-2)" strokeWidth={1.25} dot={false} isAnimationActive={false} activeDot={false} />}
            <RechartsScrubber rows={plotted} xKey="date" lines={lines} selection={selection} dispatch={dispatch} label={`${fundLabel} stress window`} helpId={helpId}
            valueText={selected ? `${first ? `${exactDate(first.date)} to ` : ""}${exactDate(selected.date)}; ${lines.map((l) => `${l.label}: ${fmtPct(selected[l.key as keyof typeof selected] as number)}`).join("; ")}` : "No observations"} />
        </LineChart>
        </ResponsiveContainer>
      {selected && selection.active !== null && <SelectionReadout selected={!!bounds} onClear={() => dispatch({ type: "clear" })}
        label={first ? `${exactDate(first.date)} – ${exactDate(selected.date)}` : exactDate(selected.date)}>
        {lines.map((l) => {
          const a = first?.[l.key as keyof typeof first];
          const b = selected[l.key as keyof typeof selected];
          const result = first ? intervalChange(a, b, "return") : null;
          return <div key={l.key}>
            <div className="flex flex-wrap justify-between gap-x-4"><span>{l.label}</span><span>{first ? `${fmtPct(a as number)} → ` : ""}{fmtPct(b as number)}</span></div>
            {result && <div className={tone(result.returnPct)}>Interval return {result.returnPct === null ? "Unavailable" : fmtPct(result.returnPct)}</div>}
          </div>;
        })}
      </SelectionReadout>}
      </div>
      <p id={helpId} className="mt-2 text-caption text-muted-foreground">{scrubHelp}</p>
      <ChartLegend
        series={[
          { key: "fund", label: fundLabel, color: "var(--series-1)" },
          { key: "market", label: "S&P 500 (SPY)", color: "var(--series-neutral)", dashed: true },
          ...(hasBench ? [{ key: "benchmark", label: benchmarkLabel, color: "var(--series-2)" }] : []),
        ]}
      />
    </div>
  );
}
