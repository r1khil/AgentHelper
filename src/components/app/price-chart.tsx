"use client";

import { PerformanceChart } from "@/components/charts/performance-chart";
import type { Observation } from "@/lib/charts/series";

export function PriceChart({ data, ticker, currency }: { data: Observation[]; ticker: string; currency?: string }) {
  return <PerformanceChart data={data} label={`${ticker} versus S&P 500`} series={[
    { key: "holding", label: ticker, color: "var(--series-1)", unit: currency },
    { key: "benchmark", label: "S&P 500", color: "var(--muted-foreground)", dashed: true, unit: "pts" },
  ]} note="Daily closes · rebased to 0% · price return" />;
}
