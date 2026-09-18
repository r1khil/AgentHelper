"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type SectorEffectPoint = { sector: string; allocation: number; selection: number; interaction: number; total: number };

const SERIES = [
  { key: "allocation", label: "Allocation", color: "var(--series-1)" },
  { key: "selection", label: "Selection", color: "var(--series-2)" },
  { key: "interaction", label: "Interaction", color: "var(--series-3)" },
] as const;

const bps = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} bps`;

/** Effects per sector in basis points, stacked around zero and sorted by total. */
export function SectorEffectsChart({ data }: { data: SectorEffectPoint[] }) {
  if (!data.length) return <div className="text-sm text-muted-foreground">No effects for this period.</div>;
  const rows = [...data].sort((a, b) => b.total - a.total);
  return (
    <div>
      <div style={{ height: Math.max(160, rows.length * 30 + 36) }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" stackOffset="sign" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="sector" width={148} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
            <ReferenceLine x={0} stroke="var(--muted-foreground)" />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              formatter={(v, name) => [bps(Number(v)), SERIES.find((s) => s.key === name)?.label ?? String(name)]}
              labelFormatter={(label, payload) => `${label} · total ${bps(Number(payload?.[0]?.payload?.total ?? 0))}`}
              contentStyle={{ fontSize: 12, borderRadius: 8, background: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)" }}
              itemStyle={{ color: "var(--popover-foreground)" }}
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} stackId="effects" fill={s.color} stroke="var(--card)" strokeWidth={2} barSize={14} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto">Basis points of active return</span>
      </div>
    </div>
  );
}
