"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartGrid, chartTick, exactDate } from "@/components/charts/primitives";

export type DrawdownPoint = { date: string; fund: number; market: number };

/** Underwater chart: the Fund's and the S&P 500's decline from their running peaks, in percent. */
export function DrawdownChart({ data, fundLabel }: { data: DrawdownPoint[]; fundLabel: string }) {
  if (data.length < 2) return <div className="text-sm text-muted-foreground">Needs at least two trading days.</div>;
  const min = Math.min(...data.flatMap((d) => [d.fund, d.market]), -1);
  return (
    <div className="h-52 w-full" role="img" aria-label={`${fundLabel} and S&P 500 drawdown from peak`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={chartGrid} />
          <XAxis dataKey="date" tick={chartTick} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d: string) => exactDate(d).replace(/, \d{4}$/, "")} />
          <YAxis tick={chartTick} tickLine={false} axisLine={false} width={44} domain={[Math.floor(min), 0]} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
          <Tooltip
            formatter={(v, name) => [`${Number(v).toFixed(2)}%`, name === "fund" ? fundLabel : "S&P 500 (SPY)"]}
            labelFormatter={(d) => exactDate(String(d))}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          />
          <Area type="linear" dataKey="fund" stroke="var(--series-1)" fill="var(--series-1)" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
          <Line type="linear" dataKey="market" stroke="var(--series-neutral)" strokeDasharray="4 3" dot={false} strokeWidth={1.25} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
