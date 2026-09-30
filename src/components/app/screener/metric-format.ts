// Client-safe: how a screen metric reads on the page. Ratios and multiples carry "×", shares of something are percent,
// scores are plain; everything goes through the shared accounting formatter.
import { fmtAccounting, fmtNumber, fmtPct } from "@/lib/format";
import type { MetricDef } from "@/lib/screener/metrics";

export function fmtMetric(def: Pick<MetricDef, "format" | "key">, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  switch (def.format) {
    case "multiple":
      return fmtAccounting(v, 1, "×");
    case "ratio":
      return fmtAccounting(v, 2, "×");
    case "pct":
      // Stored as fractions (0.12 is 12%); the ROIC trend is points a year.
      return def.key === "roicTrend" ? `${fmtAccounting(v * 100, 1)} pt/yr` : fmtPct(v * 100, 1);
    case "score":
      return fmtNumber(v, 1);
  }
}
