"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLegend, chartGrid, chartTick, exactDate, tickDate } from "@/components/charts/primitives";
import { fmtPct } from "@/lib/format";

export type StressPathPoint = { date: string; fund: number; market: number; benchmark: number | null };

/** Cumulative return through a stress window: today's portfolio held from the first close, the S&P 500 and the sector benchmark. */
export function StressPathChart({ data, fundLabel, benchmarkLabel }: { data: StressPathPoint[]; fundLabel: string; benchmarkLabel: string }) {
  const hasBench = data.some((d) => d.benchmark !== null);
  const values = data.flatMap((d) => [d.fund, d.market, ...(d.benchmark === null ? [] : [d.benchmark])]).map((v) => v * 100);
  const lo = Math.floor(Math.min(0, ...values));
  const hi = Math.ceil(Math.max(0, ...values));
  const names: Record<string, string> = { fund: fundLabel, market: "S&P 500 (SPY)", benchmark: benchmarkLabel };
  return (
    <div>
      <div className="h-52 w-full" role="img" aria-label={`${fundLabel}, S&P 500 and sector benchmark cumulative return through the window`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.map((d) => ({ date: d.date, fund: d.fund * 100, market: d.market * 100, benchmark: d.benchmark === null ? null : d.benchmark * 100 }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={chartGrid} />
            <XAxis dataKey="date" tick={chartTick} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d: string) => tickDate(d)} />
            <YAxis tick={chartTick} tickLine={false} axisLine={false} width={44} domain={[lo, hi]} tickFormatter={(v: number) => fmtPct(v, 0)} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
            <Tooltip
              formatter={(v, name) => [fmtPct(Number(v)), names[String(name)] ?? String(name)]}
              labelFormatter={(d) => exactDate(String(d))}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
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
