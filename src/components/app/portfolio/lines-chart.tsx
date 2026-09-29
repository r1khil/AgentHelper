"use client";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type XAxisProps } from "recharts";
import { ChartTooltip, tone } from "@/components/charts/primitives";
import { niceScale } from "@/lib/charts/ticks";
import { fmtChangeBp } from "@/lib/format";

// The Portfolio pages' line chart: no gridlines and no y-axis (the figures are in the hero and the hover), the fund in
// ink, the comparison dashed or dotted grey. Green and red are for the sign of a number, never for a series.

export type LineSpec = {
  key: string;
  label: string;
  /** A CSS colour or token: "var(--series-1)". */
  color: string;
  width?: number;
  /** SVG dash pattern: "5 4" dashed, "1 5" with a round cap for dotted. */
  dash?: string;
};

/** Ink for the fund or the modified weights. */
export const FUND_LINE = { color: "var(--series-1)", width: 2.5 } as const;
/** Dashed grey for the benchmark, the dotted/dashed style of the design. */
export const BENCH_LINE = { color: "var(--series-neutral)", width: 2, dash: "5 4" } as const;

/**
 * An x-axis label in the chart's own type (12px grey sans), the first flush with the left edge and the last with the
 * right so neither is cut off; the rest are centred on their date.
 */
export function EdgeTick({ x = 0, y = 0, payload, index = 0, visibleTicksCount = 1, format }: { x?: number; y?: number; payload?: { value: string | number }; index?: number; visibleTicksCount?: number; format?: (v: never, i: number) => string }) {
  const anchor = visibleTicksCount > 1 && index === 0 ? "start" : visibleTicksCount > 1 && index === visibleTicksCount - 1 ? "end" : "middle";
  const value = payload?.value ?? "";
  return (
    <text x={x} y={y} dy={12} textAnchor={anchor} fill="var(--muted-foreground)" fontSize={12}>
      {format ? format(value as never, index) : String(value)}
    </text>
  );
}

/** The key of a line's legend swatch, drawn like the line itself. */
export function LineKey({ line, className }: { line: Pick<LineSpec, "color" | "dash" | "width">; className?: string }) {
  const dotted = line.dash?.startsWith("1 ");
  return (
    <span
      aria-hidden
      className={className}
      style={{ display: "inline-block", width: 14, height: 0, borderTop: `${Math.max(2, Math.round(line.width ?? 2))}px ${line.dash ? (dotted ? "dotted" : "dashed") : "solid"} ${line.color}` }}
    />
  );
}

/**
 * Lines over a shared x axis. `rows` carry the x value under `xKey` and each line's value under its key, in the same
 * unit (percent). The hover shows every line at that x and, with two or more, the gap between the first two in bp.
 */
export function LinesChart<Row extends Record<string, unknown>>({
  rows,
  xKey,
  lines,
  ariaLabel,
  height = 200,
  xAxis,
  hoverLabel,
  format,
  gap = true,
  zero = true,
}: {
  rows: Row[];
  xKey: keyof Row & string;
  lines: LineSpec[];
  ariaLabel: string;
  height?: number;
  xAxis: Pick<XAxisProps, "tickFormatter" | "ticks" | "domain" | "type" | "interval" | "minTickGap">;
  /** The hover's heading for a row. */
  hoverLabel: (row: Row) => React.ReactNode;
  /** A value in the chart's unit as text: fmtPct for percent. */
  format: (v: number | null) => string;
  gap?: boolean;
  zero?: boolean;
}) {
  const values = rows.flatMap((r) => lines.map((l) => r[l.key] as number | null | undefined)).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const scale = values.length ? niceScale(Math.min(0, ...values), Math.max(0, ...values), 4, { fit: "inner" }) : null;
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={rows} margin={{ top: 6, right: 2, bottom: 0, left: 2 }} accessibilityLayer={false}>
          <XAxis dataKey={xKey as string} tick={<EdgeTick format={xAxis.tickFormatter as ((v: never, i: number) => string) | undefined} />} tickLine={false} axisLine={false} padding={{ left: 0, right: 0 }} {...xAxis} />
          <YAxis hide domain={scale?.domain ?? ["auto", "auto"]} />
          {zero && <ReferenceLine y={0} stroke="var(--bench-bar)" strokeOpacity={0.55} />}
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
              if (!row) return null;
              const a = row[lines[0]?.key] as number | null | undefined;
              const b = lines[1] ? (row[lines[1].key] as number | null | undefined) : undefined;
              const diff = gap && typeof a === "number" && typeof b === "number" ? (a - b) * 100 : null;
              return (
                <ChartTooltip label={hoverLabel(row)}>
                  {lines.map((l) => {
                    const v = row[l.key] as number | null | undefined;
                    return (
                      <div key={l.key} className="flex justify-between gap-4">
                        <span>{l.label}</span>
                        <span className={tone(v ?? null)}>{typeof v === "number" ? format(v) : "—"}</span>
                      </div>
                    );
                  })}
                  {diff !== null && (
                    <div className="flex justify-between gap-4 border-t pt-1.5 text-muted-foreground">
                      <span>Gap</span>
                      <span className={tone(diff)}>{fmtChangeBp(diff)}</span>
                    </div>
                  )}
                </ChartTooltip>
              );
            }}
          />
          {/* Comparison lines first so the fund is drawn over them. */}
          {[...lines].reverse().map((l) => (
            <Line
              key={l.key}
              type="linear"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={l.width ?? 2}
              strokeDasharray={l.dash}
              strokeLinecap={l.dash?.startsWith("1 ") ? "round" : "butt"}
              strokeLinejoin="round"
              dot={false}
              activeDot={l === lines[0] ? { r: 3, strokeWidth: 0, fill: l.color } : false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
