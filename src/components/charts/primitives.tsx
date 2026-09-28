import type { ReactNode } from "react";
import type { TimeRange } from "@/lib/charts/series";
import { niceScale } from "@/lib/charts/ticks";
import { fmtDate, fmtDayMonth } from "@/lib/format";
import { Segmented } from "@/components/app/panel";

/**
 * Axis ticks: small muted mono, like every other figure in the app, at the type scale's caption size (11px); an SVG
 * attribute can't read the CSS token.
 */
export const chartTick = { fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" };
/** Light gridlines in the row-divider color. */
export const chartGrid = "var(--row)";

/**
 * A Recharts value axis on round ticks (three or four by default), spread onto a <YAxis>. `format` gets the decimals
 * the step needs, so no two ticks print alike. Missing values are ignored; with none, the axis falls back to auto.
 */
export function valueAxis(values: (number | null | undefined)[], format: (v: number, digits: number) => string, max = 4) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const s = finite.length ? niceScale(Math.min(...finite), Math.max(...finite), max) : null;
  if (!s) return { domain: ["auto", "auto"] as [string, string], tickFormatter: (v: number) => format(v, 1) };
  const tickFormatter = (v: number) => format(v, s.digits);
  return { ticks: s.ticks, domain: s.domain, interval: 0 as const, tickFormatter, width: axisWidth(s.ticks.map(tickFormatter)) };
}

/** A y-axis wide enough for its longest tick label at 11px mono (about 0.62em a character), and never under 44px. */
export const axisWidth = (labels: string[]) => Math.max(44, Math.ceil(Math.max(0, ...labels.map((l) => l.length)) * 6.8) + 8);
export const tone = (value: number | null) =>
  value === null || value === 0
    ? "text-foreground"
    : value > 0
      ? "text-up"
      : "text-down";
/** A chart point's date in full, "28 Sep 2026", for tooltips and ranges. */
export const exactDate = (date: string) => fmtDate(date);
/** An axis tick, "28 Sep". */
export const tickDate = (date: string) => fmtDayMonth(date);

/** The chart's time range: a mono segmented control (1M, 3M, …, All). */
export function TimeRangeSelector({
  ranges,
  value,
  onChange,
}: {
  ranges: readonly TimeRange[];
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  return (
    <Segmented
      mono
      label="Chart time range"
      className="flex-wrap"
      segments={ranges.map((range) => ({ key: range, label: range === "ALL" ? "All" : range, active: value === range, onClick: () => onChange(range) }))}
    />
  );
}

/**
 * Every chart's hover readout, at body size: it is where a chart's exact figures are read, so it matches the tables
 * those figures come from; caption stays for the chart's peripheral text (ticks, legend, notes).
 */
export function ChartTooltip({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="max-w-full rounded-[10px] border bg-popover/95 p-3 text-body text-popover-foreground shadow-sm backdrop-blur-sm">
      <div className="mb-2 font-medium">{label}</div>
      <div className="space-y-1.5 font-mono tnum">{children}</div>
    </div>
  );
}

export function ChartLegend({
  series,
  note,
}: {
  series: { key: string; label: string; color: string; dashed?: boolean }[];
  note?: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted-foreground">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          {s.dashed ? (
            <span className="inline-block w-4 border-t-2" style={{ borderColor: s.color, borderTopStyle: "dashed" }} />
          ) : (
            <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
          )}
          {s.label}
        </span>
      ))}
      {note && <span className="sm:ml-auto">{note}</span>}
    </div>
  );
}
