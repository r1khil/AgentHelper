import type { ReactNode } from "react";
import type { TimeRange } from "@/lib/charts/series";
import { fmtDate, fmtDayMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Axis ticks: small muted mono, like every other figure in the app. */
export const chartTick = { fontSize: 10.5, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" };
/** Light gridlines in the row-divider color. */
export const chartGrid = "var(--row)";
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

export function RangeControlGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap items-center rounded-full bg-muted p-0.5"
    >
      {children}
    </div>
  );
}

export function rangeControlClass(active: boolean) {
  return cn(
    "rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
    active
      ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(60,40,20,.08)]"
      : "text-muted-foreground",
  );
}

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
    <RangeControlGroup label="Chart time range">
      {ranges.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={rangeControlClass(value === range)}
        >
          {range === "ALL" ? "All" : range}
        </button>
      ))}
    </RangeControlGroup>
  );
}

export function ChartTooltip({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="max-w-full rounded-[10px] border bg-popover/95 p-3 text-xs text-popover-foreground shadow-sm backdrop-blur-sm">
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
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
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
