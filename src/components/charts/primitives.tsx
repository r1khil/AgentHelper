import type { ReactNode } from "react";
import type { TimeRange } from "@/lib/charts/series";
import { cn } from "@/lib/utils";

export const chartTick = { fontSize: 11, fill: "var(--muted-foreground)" };
export const signed = (value: number, digits = 2) =>
  `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
export const percent = (value: number) => `${signed(value)}%`;
export const tone = (value: number | null) =>
  value === null || value === 0
    ? "text-foreground"
    : value > 0
      ? "text-up"
      : "text-down";
export const exactDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

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
      className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1"
    >
      {children}
    </div>
  );
}

export function rangeControlClass(active: boolean) {
  return cn(
    "rounded-md px-2.5 py-1.5 sm:px-3 text-xs font-medium transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
    active
      ? "bg-background text-foreground shadow-sm"
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
    <div className="max-w-full rounded-lg border bg-popover/95 p-3 text-xs text-popover-foreground shadow-sm backdrop-blur-sm">
      <div className="mb-2 font-medium">{label}</div>
      <div className="space-y-1.5 tnum">{children}</div>
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
          <span
            className="inline-block w-4 border-t-2"
            style={{
              borderColor: s.color,
              borderTopStyle: s.dashed ? "dashed" : "solid",
            }}
          />
          {s.label}
        </span>
      ))}
      {note && <span className="sm:ml-auto">{note}</span>}
    </div>
  );
}
