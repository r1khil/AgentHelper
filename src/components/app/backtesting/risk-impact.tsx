"use client";

import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/app/page-header";
import type { ScenarioMetrics, ScenarioRisk } from "@/lib/risk/compare";
import { fmtAccounting, fmtBp, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Explained, InfoTip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "../risk/explainers";

const pct = (v: number | null, d = 2) => fmtPct(v === null ? null : v * 100, d);
const num = (v: number | null, d = 2) => fmtAccounting(v, d);
const cell = "px-3 py-2 text-right tnum whitespace-nowrap";

// Lower is less risk for every row except effective positions, where higher is more diversified.
const ROWS: { key: keyof ScenarioMetrics; label: string; explain: string; fmt: (v: number | null) => string; unit: "bp" | "x"; higherIsSafer?: boolean }[] = [
  { key: "vol", label: "Volatility", explain: RISK_EXPLAIN.vol, fmt: pct, unit: "bp" },
  { key: "beta", label: "Beta", explain: RISK_EXPLAIN.beta, fmt: num, unit: "x" },
  { key: "trackingError", label: "Tracking error", explain: RISK_EXPLAIN.trackingError, fmt: pct, unit: "bp" },
  { key: "var", label: "1-day VaR (95%)", explain: RISK_EXPLAIN.var, fmt: pct, unit: "bp" },
  { key: "es", label: "Expected shortfall", explain: RISK_EXPLAIN.es, fmt: pct, unit: "bp" },
  { key: "effectiveN", label: "Effective positions", explain: RISK_EXPLAIN.effectiveN, fmt: (v) => num(v, 1), unit: "x", higherIsSafer: true },
  { key: "top5", label: "Top 5 weight", explain: RISK_EXPLAIN.top5, fmt: pct, unit: "bp" },
];

function Change({ before, after, unit, higherIsSafer }: { before: number | null; after: number | null; unit: "bp" | "x"; higherIsSafer?: boolean }) {
  if (before === null || after === null || !Number.isFinite(before) || !Number.isFinite(after)) return <span className="text-muted-foreground">—</span>;
  const d = after - before;
  const shown = unit === "bp" ? fmtBp(d * 10_000) : fmtAccounting(d, 2);
  if (!/[1-9]/.test(shown)) return <span className="text-muted-foreground">no change</span>;
  const safer = higherIsSafer ? d > 0 : d < 0;
  return <span className={safer ? "text-up" : "text-down"}>{shown}</span>;
}

const arrow = (a: string, b: string) => (a === b ? a : `${a} → ${b}`);

export const RISK_IMPACT_EXPLAIN =
  "Today's risk of the current and modified weights, using the Risk page's model: a 1-year window of daily total returns, sample covariance, beta against SPY, tracking error against the sector benchmark, and 1-day 95% historical VaR. It is independent of the backtest period above and is an estimate from past returns, not a forecast.";

/** The window the risk was measured over, for the section's aside. */
export const riskWindow = (data: ScenarioRisk | null) => (data ? `${data.window.days} daily returns to the ${data.window.to} close` : undefined);

/** Current vs modified weights' risk, computed with the Risk page's model on today's portfolio. */
export function RiskImpact({ data, busy, error, stale }: { data: ScenarioRisk | null; busy: boolean; error: string; stale: boolean }) {
  return (
    <Card data-tour="bt-risk-impact" className="mb-6 gap-3 p-4">
      <SectionTitle aside={riskWindow(data)}>
        <Explained label="Risk impact · current vs modified weights">
          {RISK_IMPACT_EXPLAIN}
        </Explained>
      </SectionTitle>
      <RiskImpactBody data={data} busy={busy} error={error} stale={stale} />
    </Card>
  );
}

/** The comparison tables, without a frame. */
export function RiskImpactBody({
  data,
  busy,
  error,
  stale,
  idle = "Run the backtest to see how the modified weights change the portfolio's risk.",
  names = { original: "Current", modified: "Modified" },
  className = "lg:grid-cols-2",
}: {
  data: ScenarioRisk | null;
  busy: boolean;
  error: string;
  stale: boolean;
  idle?: string;
  names?: { original: string; modified: string };
  /** Column layout of the tables; the classic card sits side by side from lg. */
  className?: string;
}) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">{error}</p>
  ) : !data ? (
    <p className="text-sm text-muted-foreground">{busy ? "Measuring risk…" : idle}</p>
  ) : (
    <div className={cn("grid gap-4", className, stale && "opacity-60")}>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr><th scope="col" className="px-3 py-2 text-left font-medium">Measure</th><th scope="col" className={cell}>{names.original}</th><th scope="col" className={cell}>{names.modified}</th><th scope="col" className={cell}>Change</th></tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key} className="border-t">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="inline-flex items-center gap-1">{r.label}<InfoTip label={r.label}>{r.explain}</InfoTip></span>
                </th>
                <td className={cell}>{r.fmt(data.before[r.key])}</td>
                <td className={cn(cell, "font-medium")}>{r.fmt(data.after[r.key])}</td>
                <td className={cell}><Change before={data.before[r.key]} after={data.after[r.key]} unit={r.unit} higherIsSafer={r.higherIsSafer} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid content-start gap-3">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Holding</th>
                <th scope="col" className={cell}>Weight</th>
                <th scope="col" className={cell}><span className="inline-flex items-center gap-1">Share of risk<InfoTip label="Share of risk">{RISK_EXPLAIN.riskShare}</InfoTip></span></th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => (
                <tr key={h.ticker} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-medium">{h.ticker}</th>
                  <td className={cell}>{arrow(pct(h.weightBefore), pct(h.weightAfter))}</td>
                  <td className={cell}>{arrow(pct(h.shareBefore, 1), pct(h.shareAfter, 1))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.sectors.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Sector</th>
                  <th scope="col" className={cell}><span className="inline-flex items-center gap-1">Active weight<InfoTip label="Active weight">{`${RISK_EXPLAIN.activeWeight} Against ${data.benchmarkLabel}.`}</InfoTip></span></th>
                  <th scope="col" className={cell}>Share of risk</th>
                </tr>
              </thead>
              <tbody>
                {data.sectors.map((s) => (
                  <tr key={s.label} className="border-t">
                    <th scope="row" className="px-3 py-2 text-left font-normal">{s.label}</th>
                    <td className={cell}>{s.activeBefore === null ? "—" : arrow(pct(s.activeBefore, 1), pct(s.activeAfter, 1))}</td>
                    <td className={cell}>{arrow(pct(s.shareBefore, 1), pct(s.shareAfter, 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.notices.map((n) => (
          <p key={n} className="text-xs text-muted-foreground">{n}</p>
        ))}
      </div>
    </div>
  );
}
