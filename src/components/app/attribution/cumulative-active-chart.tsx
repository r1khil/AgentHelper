"use client";

import { PerformanceChart } from "@/components/charts/performance-chart";

export type CumulativeChartPoint = { date: string; portfolio: number; benchmark: number | null };

/** Keep the page-wide period and cash-flow-adjusted return calculation authoritative. */
export function CumulativeActiveChart({ data, portfolioLabel, benchmarkLabel }: { data: CumulativeChartPoint[]; portfolioLabel: string; benchmarkLabel: string }) {
  if (data.length < 2) return <div className="text-sm text-muted-foreground">No completed trading days in this period.</div>;
  return <PerformanceChart
    data={data.map((p) => ({ date: p.date, values: { portfolio: 100 + p.portfolio, benchmark: p.benchmark === null ? null : 100 + p.benchmark } }))}
    label={`${portfolioLabel} versus ${benchmarkLabel}`}
    kind="return" ranges={false}
    series={[
      { key: "portfolio", label: portfolioLabel, color: "var(--series-1)" },
      { key: "benchmark", label: benchmarkLabel, color: "var(--muted-foreground)", dashed: true },
    ]}
    note="Cumulative return · page period"
  />;
}
