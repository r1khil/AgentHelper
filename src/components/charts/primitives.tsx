import type { ReactNode } from "react";
import type { TimeRange } from "@/lib/charts/series";
import { fmtDate, fmtDayMonth } from "@/lib/format";
import { Segmented } from "@/components/app/panel";

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
