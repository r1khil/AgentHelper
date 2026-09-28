"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip, chartGrid, chartTick, tone, valueAxis } from "@/components/charts/primitives";
import type { PathPoint } from "@/lib/attribution/live";
import { fmtBp, fmtPct, fmtTime } from "@/lib/format";

const FUND = "var(--series-1)";
const BENCH = "var(--series-neutral)";

type Row = { x: number; portfolio: number; benchmark: number | null };

/**
 * The session so far: both lines in percent from the prior close, on a time axis that runs the whole session so the
 * line grows across the day. `points` are fractions; null while the first fetch is running.
 */
export function IntradayChart({ points, hours, portfolioLabel, benchmarkLabel }: { points: PathPoint[] | null; hours: { open: string; close: string }; portfolioLabel: string; benchmarkLabel: string }) {
  if (points === null) return <div className="flex min-h-44 flex-1 items-center text-body text-muted-foreground">Loading the day&apos;s prices…</div>;
  const open = Date.parse(hours.open);
  const close = Date.parse(hours.close);
  const rows: Row[] = points.map((p) => ({ x: Date.parse(p.t), portfolio: p.portfolio * 100, benchmark: p.benchmark === null ? null : p.benchmark * 100 }));
  if (!rows.length) return <div className="flex min-h-44 flex-1 items-center text-body text-muted-foreground">No intraday prices yet for this session.</div>;
  // Every line starts from the prior close at the bell.
  if (rows[0].x > open) rows.unshift({ x: open, portfolio: 0, benchmark: rows[0].benchmark === null ? null : 0 });
  const ticks: number[] = [];
  for (let t = open + 30 * 60_000; t < close; t += 60 * 60_000) ticks.push(t);

  return (
    <div className="h-full min-h-44 w-full" role="img" aria-label={`Return through the session, ${portfolioLabel} versus ${benchmarkLabel}`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke={chartGrid} syncWithTicks />
          <XAxis dataKey="x" type="number" domain={[open, close]} ticks={ticks} tick={chartTick} tickLine={false} axisLine={false} tickFormatter={(x: number) => fmtTime(new Date(x)).replace(" ET", "")} dy={6} />
          <YAxis tick={chartTick} tickLine={false} axisLine={false} width={48} {...valueAxis(rows.flatMap((r) => [r.portfolio, r.benchmark]), fmtPct)} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.35} />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
              if (!p) return null;
              const gap = p.benchmark === null ? null : (p.portfolio - p.benchmark) * 100;
              return (
                <ChartTooltip label={fmtTime(new Date(p.x))}>
                  <div className="flex justify-between gap-4"><span>{portfolioLabel}</span><span className={tone(p.portfolio)}>{fmtPct(p.portfolio)}</span></div>
                  <div className="flex justify-between gap-4"><span>{benchmarkLabel}</span><span className={tone(p.benchmark)}>{fmtPct(p.benchmark)}</span></div>
                  {gap !== null && <div className="flex justify-between gap-4 border-t pt-1.5 text-muted-foreground"><span>Gap</span><span className={tone(gap)}>{fmtBp(gap)}</span></div>}
                </ChartTooltip>
              );
            }}
          />
          <Line type="linear" dataKey="benchmark" stroke={BENCH} strokeWidth={1.5} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="linear" dataKey="portfolio" stroke={FUND} strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: FUND }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
