"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type CumulativeChartPoint = { date: string; portfolio: number; benchmark: number | null };

const signed = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;

/** Cumulative return in percent, both lines on one axis from a common 0% base. */
export function CumulativeActiveChart({ data, portfolioLabel, benchmarkLabel }: { data: CumulativeChartPoint[]; portfolioLabel: string; benchmarkLabel: string }) {
  if (data.length < 2) return <div className="text-sm text-muted-foreground">No completed trading days in this period.</div>;
  const hasBench = data.some((d) => d.benchmark !== null);
  return (
    <div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} minTickGap={32} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => signed(v, 1)} tick={{ fontSize: 11 }} width={52} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v, name) => [signed(Number(v)), name === "portfolio" ? portfolioLabel : benchmarkLabel]}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as CumulativeChartPoint | undefined;
                return p && p.benchmark !== null ? `${label} · active ${((p.portfolio - p.benchmark) * 100 > 0 ? "+" : "") + ((p.portfolio - p.benchmark) * 100).toFixed(1)} bps` : String(label);
              }}
              contentStyle={{ fontSize: 12, borderRadius: 8, background: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)" }}
              itemStyle={{ color: "var(--popover-foreground)" }}
            />
            {hasBench && <Line type="monotone" dataKey="benchmark" stroke="var(--muted-foreground)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />}
            <Line type="monotone" dataKey="portfolio" stroke="var(--series-1)" strokeWidth={2} dot={data.length <= 3 ? { r: 4 } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ background: "var(--series-1)" }} />{portfolioLabel}</span>
        {hasBench && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-muted-foreground" />{benchmarkLabel}</span>}
        <span className="ml-auto">Cumulative total return</span>
      </div>
    </div>
  );
}
