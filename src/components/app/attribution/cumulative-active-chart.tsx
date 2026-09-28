"use client";

import { Maximize2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { ChartTooltip, chartGrid, chartTick, exactDate, tickDate, tone, valueAxis } from "@/components/charts/primitives";
import { fmtBp, fmtPct } from "@/lib/format";

/** Percent points: `portfolio` and `benchmark` are cumulative returns in percent from the period's base close. */
export type CumulativeChartPoint = { date: string; portfolio: number; benchmark: number | null };

const FUND = "var(--series-1)";
const BENCH = "var(--series-neutral)";

/** The full interactive chart (scrub, drag-to-compare, observations table). Shown in the Details dialog. */
export function CumulativeActiveChart({ data, portfolioLabel, benchmarkLabel }: { data: CumulativeChartPoint[]; portfolioLabel: string; benchmarkLabel: string }) {
  if (data.length < 2) return <div className="text-body text-muted-foreground">No completed trading days in this period.</div>;
  return (
    <PerformanceChart
      data={data.map((p) => ({ date: p.date, values: { portfolio: 100 + p.portfolio, benchmark: p.benchmark === null ? null : 100 + p.benchmark } }))}
      label={`${portfolioLabel} versus ${benchmarkLabel}`}
      kind="return"
      ranges={false}
      series={[
        { key: "portfolio", label: portfolioLabel, color: FUND },
        { key: "benchmark", label: benchmarkLabel, color: BENCH },
      ]}
      note="Cumulative return · page period"
    />
  );
}

/** Tick labels: "17 Sep" then day numbers, or "17 Sep" throughout when the period spans months. */
function tickLabels(dates: string[]) {
  const spansMonths = dates.length > 1 && dates[0].slice(0, 7) !== dates.at(-1)!.slice(0, 7);
  return (d: string, i?: number) => (spansMonths || d === dates[0] || i === 0 ? tickDate(d) : String(Number(d.slice(8, 10))));
}

/** Compact cumulative-return panel body: thin lines, no dots, mono ticks, hover readout. */
export function CompactCumulativeChart({ data, portfolioLabel, benchmarkLabel }: { data: CumulativeChartPoint[]; portfolioLabel: string; benchmarkLabel: string }) {
  if (data.length < 2) return <div className="flex flex-1 items-center text-body text-muted-foreground">Needs at least two closes in this period.</div>;
  const label = tickLabels(data.map((d) => d.date));
  return (
    <div className="h-full min-h-44 w-full" role="img" aria-label={`Cumulative return, ${portfolioLabel} versus ${benchmarkLabel}`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke={chartGrid} syncWithTicks />
          <XAxis dataKey="date" tick={chartTick} tickLine={false} axisLine={false} minTickGap={28} interval="preserveStartEnd" tickFormatter={(d: string) => label(d)} dy={6} />
          <YAxis tick={chartTick} tickLine={false} axisLine={false} width={44} {...valueAxis(data.flatMap((d) => [d.portfolio, d.benchmark]), fmtPct)} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.35} />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as CumulativeChartPoint | undefined) : undefined;
              if (!p) return null;
              const gap = p.benchmark === null ? null : (p.portfolio - p.benchmark) * 100;
              return (
                <ChartTooltip label={exactDate(p.date)}>
                  <div className="flex justify-between gap-4"><span>{portfolioLabel}</span><span className={tone(p.portfolio)}>{fmtPct(p.portfolio)}</span></div>
                  <div className="flex justify-between gap-4"><span>{benchmarkLabel}</span><span className={tone(p.benchmark)}>{fmtPct(p.benchmark)}</span></div>
                  {gap !== null && (
                    <div className="flex justify-between gap-4 border-t pt-1.5 text-muted-foreground"><span>Gap</span><span className={tone(gap)}>{fmtBp(gap)}</span></div>
                  )}
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

/** "Details" opens the full interactive chart for the same series. */
export function CumulativeDetails({ data, portfolioLabel, benchmarkLabel, explain }: { data: CumulativeChartPoint[]; portfolioLabel: string; benchmarkLabel: string; explain: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Maximize2 />
        Details
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Cumulative return, {portfolioLabel} vs {benchmarkLabel}</DialogTitle>
          <DialogDescription>{explain}</DialogDescription>
        </DialogHeader>
        <CumulativeActiveChart data={data} portfolioLabel={portfolioLabel} benchmarkLabel={benchmarkLabel} />
      </DialogContent>
    </Dialog>
  );
}
