"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLegend, ChartTooltip, chartGrid, chartTick, exactDate, tickDate, tone, valueAxis } from "@/components/charts/primitives";
import { fmtPct } from "@/lib/format";

export type StressPathPoint = { date: string; fund: number; market: number; benchmark: number | null };

/** Cumulative return through a stress window: today's portfolio held from the first close, the S&P 500 and the sector benchmark. */
export function StressPathChart({ data, fundLabel, benchmarkLabel }: { data: StressPathPoint[]; fundLabel: string; benchmarkLabel: string }) {
  const hasBench = data.some((d) => d.benchmark !== null);
  const plotted = data.map((d) => ({ date: d.date, fund: d.fund * 100, market: d.market * 100, benchmark: d.benchmark === null ? null : d.benchmark * 100 }));
  // Round ticks over every line, always including the 0% start.
  const axis = valueAxis([...plotted.flatMap((d) => [d.fund, d.market, d.benchmark]), 0], fmtPct);
  return (
    <div>
      <div className="h-52 w-full" role="img" aria-label={`${fundLabel}, S&P 500 and sector benchmark cumulative return through the window`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={plotted} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={chartGrid} syncWithTicks />
            <XAxis dataKey="date" tick={chartTick} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d: string) => tickDate(d)} />
            <YAxis tick={chartTick} tickLine={false} axisLine={false} width={44} {...axis} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as (typeof plotted)[number] | undefined) : undefined;
                if (!p) return null;
                return (
                  <ChartTooltip label={exactDate(p.date)}>
                    <div className="flex justify-between gap-4"><span>{fundLabel}</span><span className={tone(p.fund)}>{fmtPct(p.fund)}</span></div>
                    <div className="flex justify-between gap-4"><span>S&amp;P 500 (SPY)</span><span className={tone(p.market)}>{fmtPct(p.market)}</span></div>
                    {hasBench && <div className="flex justify-between gap-4"><span>{benchmarkLabel}</span><span className={tone(p.benchmark)}>{fmtPct(p.benchmark)}</span></div>}
                  </ChartTooltip>
                );
              }}
            />
            <Line type="linear" dataKey="fund" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="market" stroke="var(--series-neutral)" strokeDasharray="4 3" strokeWidth={1.25} dot={false} isAnimationActive={false} />
            {hasBench && <Line type="linear" dataKey="benchmark" stroke="var(--series-2)" strokeWidth={1.25} dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
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
