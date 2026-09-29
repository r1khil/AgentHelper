"use client";

import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { exactDate, tickDate } from "@/components/charts/primitives";
import { BENCH_LINE, FUND_LINE, LinesChart } from "@/components/app/portfolio/lines-chart";
import { fmtChangePct } from "@/lib/format";

/** Percent points: `portfolio`, `benchmark` and `index` are cumulative returns in percent from the period's base close. */
export type CumulativeChartPoint = { date: string; portfolio: number; benchmark: number | null; index?: number | null };

/** The full interactive chart (scrub, drag-to-compare, observations table). Shown in the Details dialog. */
export function CumulativeActiveChart({ data, portfolioLabel, benchmarkLabel, indexLabel }: { data: CumulativeChartPoint[]; portfolioLabel: string; benchmarkLabel: string; indexLabel?: string }) {
  if (data.length < 2) return <div className="text-body text-muted-foreground">No completed trading days in this period.</div>;
  const withIndex = !!indexLabel && data.some((p) => p.index != null);
  return (
    <PerformanceChart
      data={data.map((p) => ({ date: p.date, values: { portfolio: 100 + p.portfolio, benchmark: p.benchmark === null ? null : 100 + p.benchmark, index: p.index == null ? null : 100 + p.index } }))}
      label={`${portfolioLabel} versus ${benchmarkLabel}`}
      kind="return"
      ranges={false}
      series={[
        { key: "portfolio", label: portfolioLabel, color: FUND_LINE.color },
        { key: "benchmark", label: benchmarkLabel, color: BENCH_LINE.color },
        ...(withIndex ? [{ key: "index", label: indexLabel!, color: "var(--series-2)" }] : []),
      ]}
      note="Cumulative return · page period"
    />
  );
}

/** Tick labels: "Sep 17" then day numbers, or "Sep 17" throughout when the period spans months. */
function tickLabels(dates: string[]) {
  const spansMonths = dates.length > 1 && dates[0].slice(0, 7) !== dates.at(-1)!.slice(0, 7);
  return (d: string, i?: number) => (spansMonths || d === dates[0] || i === 0 ? tickDate(d) : String(Number(d.slice(8, 10))));
}

/** The period's cumulative return, fund against benchmark, from the close before the first day. */
export function CumulativeLines({ data, portfolioLabel, benchmarkLabel }: { data: CumulativeChartPoint[]; portfolioLabel: string; benchmarkLabel: string }) {
  if (data.length < 2) return <div className="flex h-[200px] items-center text-body text-muted-foreground">Needs at least two closes in this period.</div>;
  const label = tickLabels(data.map((d) => d.date));
  return (
    <LinesChart
      rows={data}
      xKey="date"
      ariaLabel={`Cumulative return, ${portfolioLabel} versus ${benchmarkLabel}: ${portfolioLabel} ${fmtChangePct(data.at(-1)!.portfolio)}${data.at(-1)!.benchmark == null ? "" : `, ${benchmarkLabel} ${fmtChangePct(data.at(-1)!.benchmark)}`}`}
      lines={[
        { key: "portfolio", label: portfolioLabel, ...FUND_LINE },
        { key: "benchmark", label: benchmarkLabel, ...BENCH_LINE },
      ]}
      xAxis={{ interval: "preserveStartEnd", minTickGap: 36, tickFormatter: (d: string, i: number) => label(d, i) }}
      hoverLabel={(r) => exactDate(r.date)}
      format={(v) => fmtChangePct(v)}
    />
  );
}

/** "Details" opens the full interactive chart for the same series, with the S&P 500 added. */
export function CumulativeDetails({ data, portfolioLabel, benchmarkLabel, indexLabel, explain }: { data: CumulativeChartPoint[]; portfolioLabel: string; benchmarkLabel: string; indexLabel?: string; explain: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Maximize2 />
        Details
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Cumulative return, {portfolioLabel} vs {benchmarkLabel}</DialogTitle>
          <DialogDescription>{explain}</DialogDescription>
        </DialogHeader>
        <CumulativeActiveChart data={data} portfolioLabel={portfolioLabel} benchmarkLabel={benchmarkLabel} indexLabel={indexLabel} />
      </DialogContent>
    </Dialog>
  );
}
