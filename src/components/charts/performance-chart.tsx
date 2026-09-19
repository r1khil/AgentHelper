"use client";

import { useId, useMemo, useState, type PointerEvent } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisInverseScale,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import {
  availableRanges,
  nearestPoint,
  normalizeObservations,
  performance,
  selectRange,
  type Observation,
  type PerformancePoint,
  type TimeRange,
} from "@/lib/charts/series";
import {
  ChartLegend,
  ChartTooltip,
  TimeRangeSelector,
  chartTick,
  exactDate,
  percent,
  signed,
  tone,
} from "./primitives";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  unit?: string;
};
type Props = {
  data: Observation[];
  series: ChartSeries[];
  label: string;
  kind?: "price" | "return";
  ranges?: boolean;
  note: string;
};

function price(value: number | null | undefined, unit?: string) {
  return value == null
    ? "Unavailable"
    : `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
}

/** Daily-price comparisons and cumulative-return indices share one interaction contract. */
export function PerformanceChart({ data, ...props }: Props) {
  const observations = useMemo(() => normalizeObservations(data), [data]);
  // Reset the range and scrub point when navigation replaces the underlying series.
  return (
    <ChartSession
      key={`${props.label}:${JSON.stringify(observations)}`}
      data={observations}
      {...props}
    />
  );
}

function ChartSession({
  data,
  series,
  label,
  kind = "price",
  ranges = true,
  note,
}: Props) {
  const options = useMemo(() => availableRanges(data), [data]);
  const [range, setRange] = useState<TimeRange>(
    ranges && options.includes("3M") ? "3M" : "ALL",
  );
  const [active, setActive] = useState<number | null>(null);
  const points = useMemo(
    () => performance(selectRange(data, range)),
    [data, range],
  );
  const plotted = useMemo(
    () => points.map((p) => ({ time: p.time, ...p.returns })),
    [points],
  );
  const helpId = useId();
  if (points.length < 2)
    return (
      <div className="py-8 text-sm text-muted-foreground" role="status">
        {points.length
          ? "At least two observations are needed to compare performance."
          : "No overlapping price history is available for this comparison."}
      </div>
    );
  const start = points[0];
  const end = points.at(-1)!;
  const selected = points[active ?? points.length - 1];
  const primary = series[0];
  const value = selected.values[primary.key];
  const baseline = start.values[primary.key];
  const change = value != null && baseline != null ? value - baseline : null;
  const selectedReturn = selected.returns[primary.key] ?? null;
  const activeReturn =
    series.length === 2 &&
    selected.returns[series[0].key] != null &&
    selected.returns[series[1].key] != null
      ? (selected.returns[series[0].key]! - selected.returns[series[1].key]!) *
        100
      : null;
  return (
    <section aria-label={label} className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground tnum">
          {exactDate(start.date)} – {exactDate(end.date)}
        </p>
        {ranges && (
          <TimeRangeSelector
            ranges={options}
            value={range}
            onChange={(next) => {
              setActive(null);
              setRange(next);
            }}
          />
        )}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 tnum">
        <Metric
          label={kind === "price" ? "Starting price" : "Starting index"}
          value={price(baseline, kind === "price" ? primary.unit : undefined)}
        />
        <Metric
          label={
            active === null
              ? kind === "price"
                ? "Latest close"
                : "Latest index"
              : kind === "price"
                ? "Selected close"
                : "Selected index"
          }
          value={price(value, kind === "price" ? primary.unit : undefined)}
        />
        <Metric
          label={kind === "price" ? "Price change" : "Index change"}
          value={
            change === null
              ? "Unavailable"
              : `${signed(change)}${kind === "price" && primary.unit ? ` ${primary.unit}` : ""}`
          }
          change={change}
        />
        <Metric
          label="Period return"
          value={
            selectedReturn === null ? "Unavailable" : percent(selectedReturn)
          }
          change={selectedReturn}
        />
      </div>
      <div
        key={range}
        className="financial-chart-enter relative h-64 w-full sm:h-72"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={plotted}
            margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
            accessibilityLayer={false}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="2 4"
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={[start.time, end.time]}
              scale="time"
              tickFormatter={(time: number) =>
                new Date(time).toISOString().slice(5, 10)
              }
              tick={chartTick}
              minTickGap={40}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${signed(v, 1)}%`}
              tick={chartTick}
              width={58}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
            />
            <ReferenceLine
              y={0}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.4}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="linear"
                dataKey={s.key}
                stroke={s.color}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                strokeWidth={s.dashed ? 1.5 : 2}
                connectNulls={false}
                dot={points.length <= 3 ? { r: 3 } : false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            <ScrubLayer
              points={points}
              series={series}
              active={active}
              onChange={setActive}
              label={label}
              helpId={helpId}
            />
          </LineChart>
        </ResponsiveContainer>
        {active !== null && (
          <div
            className={`pointer-events-none absolute top-2 z-10 max-w-[calc(100%-4rem)] ${active < points.length / 2 ? "right-3" : "left-16"}`}
          >
            <ChartTooltip label={exactDate(selected.date)}>
              {series.map((s) => (
                <div
                  key={s.key}
                  className="flex flex-wrap justify-between gap-x-4 gap-y-1"
                >
                  <span>{s.label}</span>
                  <span>
                    {kind === "price" && (
                      <>{price(selected.values[s.key], s.unit)} · </>
                    )}
                    <span className={tone(selected.returns[s.key])}>
                      {selected.returns[s.key] == null
                        ? "Unavailable"
                        : percent(selected.returns[s.key]!)}
                    </span>
                  </span>
                </div>
              ))}
              {activeReturn !== null && (
                <div className="border-t pt-1.5 text-muted-foreground">
                  Active return{" "}
                  <span className={tone(activeReturn)}>
                    {signed(activeReturn, 1)} bps
                  </span>
                </div>
              )}
            </ChartTooltip>
          </div>
        )}
      </div>
      <ChartLegend series={series} note={note} />
      <p id={helpId} className="mt-2 text-[11px] text-muted-foreground">
        Hover or drag to inspect · Touch and slide · Focus chart and use ← →,
        Home or End · Esc resets
      </p>
      {kind === "return" && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Index starts at 100; it represents cumulative return, not portfolio
          dollars.
        </p>
      )}
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">
          View observations ({points.length})
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded border">
          <table className="w-full text-left tnum">
            <caption className="sr-only">
              {label}, selected range observations
            </caption>
            <thead>
              <tr>
                <th className="p-2">Date</th>
                {series.map((s) => (
                  <th key={s.key} className="p-2">
                    {s.label}
                    {kind === "price" ? " · price / return" : " · return"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-t">
                  <th className="p-2 font-normal whitespace-nowrap">
                    {p.date}
                  </th>
                  {series.map((s) => (
                    <td key={s.key} className="p-2 whitespace-nowrap">
                      {kind === "price" && (
                        <>{price(p.values[s.key], s.unit)} / </>
                      )}
                      {p.returns[s.key] == null
                        ? "Unavailable"
                        : percent(p.returns[s.key]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Metric({
  label,
  value,
  change = null,
}: {
  label: string;
  value: string;
  change?: number | null;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-medium tracking-tight sm:text-base ${tone(change)}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Public Recharts scales keep pointer, touch and keyboard at the same exact date. */
function ScrubLayer({
  points,
  series,
  active,
  onChange,
  label,
  helpId,
}: {
  points: PerformancePoint[];
  series: ChartSeries[];
  active: number | null;
  onChange: (index: number | null) => void;
  label: string;
  helpId: string;
}) {
  const area = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const inverse = useXAxisInverseScale();
  if (!area || !xScale || !yScale || !inverse) return null;
  const point = points[active ?? points.length - 1];
  const x = xScale(point.time);
  function scrub(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pixel =
      area!.x +
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) *
        area!.width;
    const inverted = inverse!(pixel);
    const time = inverted instanceof Date ? inverted.getTime() : inverted;
    if (typeof time === "number" && Number.isFinite(time))
      onChange(nearestPoint(points, time));
  }
  return (
    <g>
      {active !== null && (
        <g pointerEvents="none">
          <line
            x1={x}
            x2={x}
            y1={area.y}
            y2={area.y + area.height}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {series.map(
            (s) =>
              point.returns[s.key] != null && (
                <circle
                  key={s.key}
                  cx={x}
                  cy={yScale(point.returns[s.key])}
                  r={4}
                  fill={s.color}
                  stroke="var(--background)"
                  strokeWidth={2}
                />
              ),
          )}
        </g>
      )}
      <rect
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        fill="transparent"
        style={{ touchAction: "pan-y", cursor: "crosshair" }}
        tabIndex={0}
        role="slider"
        aria-label={`${label} date`}
        aria-describedby={helpId}
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={active ?? points.length - 1}
        aria-valuetext={`${exactDate(point.date)}; ${series.map((s) => `${s.label}: ${point.returns[s.key] == null ? "unavailable" : percent(point.returns[s.key]!)}`).join("; ")}`}
        className="outline-none focus-visible:stroke-ring focus-visible:stroke-2"
        onPointerDown={(event) => {
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          scrub(event);
        }}
        onPointerMove={scrub}
        onPointerUp={(event) => {
          scrub(event);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerLeave={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId))
            onChange(null);
        }}
        onPointerCancel={() => onChange(null)}
        onBlur={() => onChange(null)}
        onFocus={() => onChange(points.length - 1)}
        onKeyDown={(event) => {
          const index = active ?? points.length - 1;
          const next =
            event.key === "ArrowLeft"
              ? Math.max(0, index - 1)
              : event.key === "ArrowRight"
                ? Math.min(points.length - 1, index + 1)
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? points.length - 1
                    : event.key === "Escape"
                      ? null
                      : undefined;
          if (next !== undefined) {
            event.preventDefault();
            onChange(next);
          }
        }}
      />
    </g>
  );
}
