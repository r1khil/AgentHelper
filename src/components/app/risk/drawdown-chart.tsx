"use client";

import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip, exactDate, tone } from "@/components/charts/primitives";
import { EdgeTick } from "@/components/app/portfolio/lines-chart";
import { fmtDate, fmtPct } from "@/lib/format";

/** `fund` and `market` are drawdowns in percent (0 or negative). */
export type DrawdownPoint = { date: string; fund: number; market?: number };

/**
 * Drawdown from the previous high, the one chart with a fill: the decline as a light red area under a line at the
 * peak (0%). With `market` the S&P 500's is drawn dotted-grey beside it. The x axis names five dates and the worst
 * day, with its depth.
 */
export function DrawdownChart({ data, fundLabel, marketLabel = "S&P 500 (SPY)", height = 150, worstDate }: { data: DrawdownPoint[]; fundLabel: string; marketLabel?: string; height?: number; worstDate?: string | null }) {
  if (data.length < 2) return <div className="text-body text-muted-foreground">Needs at least two trading days.</div>;
  const hasMarket = data.some((d) => d.market !== undefined);
  const lows = data.flatMap((d) => [d.fund, d.market ?? 0]);
  const low = Math.min(-1, ...lows);
  const worst = data.reduce((w, d) => (d.fund < w.fund ? d : w), data[0]);
  const worstAt = worstDate ?? worst.date;
  // Five dates across the window; the one nearest the worst day is that day, named.
  const pick = [0, 0.25, 0.5, 0.75, 1].map((f) => data[Math.round(f * (data.length - 1))].date);
  const worstIdx = data.findIndex((d) => d.date === worstAt);
  const nearest = pick.reduce((best, d, i) => (Math.abs(data.findIndex((x) => x.date === d) - worstIdx) < Math.abs(data.findIndex((x) => x.date === pick[best]) - worstIdx) ? i : best), 0);
  const ticks = pick.map((d, i) => (i === nearest && i > 0 && i < pick.length - 1 ? worstAt : d));
  const label = (d: string) => (d === worstAt && d !== data[0].date && d !== data.at(-1)!.date ? `${fmtDate(d)} · worst ${fmtPct(worst.fund)}` : fmtDate(d));
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={`${fundLabel} drawdown from the previous high; the worst was ${fmtPct(worst.fund)} on ${fmtDate(worstAt)}`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }} accessibilityLayer={false}>
          <XAxis dataKey="date" ticks={ticks} interval={0} tick={<EdgeTick format={label} />} tickLine={false} axisLine={false} padding={{ left: 0, right: 0 }} />
          <YAxis hide domain={[low, 0]} />
          <ReferenceLine y={0} stroke="var(--bench-bar)" />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as DrawdownPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <ChartTooltip label={exactDate(p.date)}>
                  <div className="flex justify-between gap-4"><span>{fundLabel}</span><span className={tone(p.fund)}>{fmtPct(p.fund)}</span></div>
                  {p.market !== undefined && <div className="flex justify-between gap-4"><span>{marketLabel}</span><span className={tone(p.market)}>{fmtPct(p.market)}</span></div>}
                </ChartTooltip>
              );
            }}
          />
          <Area type="linear" dataKey="fund" stroke="var(--down-line)" fill="var(--down-fill)" fillOpacity={1} strokeWidth={2} strokeLinejoin="round" baseValue={0} isAnimationActive={false} />
          {hasMarket && <Line type="linear" dataKey="market" stroke="var(--series-neutral)" strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" dot={false} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
