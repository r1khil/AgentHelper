"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartPoint = { date: string; holding: number; spx: number };

export function PriceChart({ data, ticker }: { data: ChartPoint[]; ticker: string }) {
  if (!data.length) return <div className="text-sm text-muted-foreground">No price history.</div>;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} minTickGap={32} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} tick={{ fontSize: 11 }} width={44} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v, name) => [`${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}%`, name === "holding" ? ticker : "S&P 500"]}
            labelFormatter={(l) => String(l)}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Line type="monotone" dataKey="spx" stroke="var(--muted-foreground)" strokeWidth={1.25} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="holding" stroke="var(--primary)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-primary" />{ticker}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-muted-foreground" />S&amp;P 500</span>
        <span className="ml-auto">Rebased to 0% at the start of the window</span>
      </div>
    </div>
  );
}
