"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip, chartGrid, chartTick, exactDate, tickDate, tone, valueAxis } from "@/components/charts/primitives";
import { fmtPct } from "@/lib/format";

export type DrawdownPoint = { date: string; fund: number; market: number };

/** Underwater chart: the Fund's and the S&P 500's decline from their running peaks, in percent. */
export function DrawdownChart({ data, fundLabel }: { data: DrawdownPoint[]; fundLabel: string }) {
  if (data.length < 2) return <div className="text-body text-muted-foreground">Needs at least two trading days.</div>;
  // Round ticks from the deepest drawdown (at least 1%) up to the peak at 0%.
  const axis = valueAxis([...data.flatMap((d) => [d.fund, d.market]), -1, 0], fmtPct);
  return (
    <div className="h-52 w-full" role="img" aria-label={`${fundLabel} and S&P 500 drawdown from peak`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={chartGrid} syncWithTicks />
          <XAxis dataKey="date" tick={chartTick} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d: string) => tickDate(d)} />
          <YAxis tick={chartTick} tickLine={false} axisLine={false} width={44} {...axis} />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as DrawdownPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <ChartTooltip label={exactDate(p.date)}>
                  <div className="flex justify-between gap-4"><span>{fundLabel}</span><span className={tone(p.fund)}>{fmtPct(p.fund)}</span></div>
                  <div className="flex justify-between gap-4"><span>S&amp;P 500 (SPY)</span><span className={tone(p.market)}>{fmtPct(p.market)}</span></div>
                </ChartTooltip>
              );
            }}
          />
          <Area type="linear" dataKey="fund" stroke="var(--series-1)" fill="var(--series-1)" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
          <Line type="linear" dataKey="market" stroke="var(--series-neutral)" strokeDasharray="4 3" dot={false} strokeWidth={1.25} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
