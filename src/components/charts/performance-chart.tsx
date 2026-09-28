"use client";

import {
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
} from "react";
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
  tickDate,
  tone,
} from "./primitives";
import { fmtAccounting, fmtBp, fmtPct } from "@/lib/format";

import {
  emptySelection,
  intervalPerformance,
  selectionBounds,
  selectionReducer,
  type Selection,
  type SelectionAction,
} from "@/lib/charts/selection";

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
  /** Prefix the metric labels with the first series' name, for charts where several lines could be mistaken for it. */
  nameMetrics?: boolean;
};

function price(value: number | null | undefined, unit?: string) {
  return value == null
    ? "Unavailable"
    : fmtAccounting(value, 2, unit ? ` ${unit}` : "");
}

function formatChange(value: number | null, unit?: string) {
  return value === null
    ? "Unavailable"
    : fmtAccounting(value, 2, unit ? ` ${unit}` : "");
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
  nameMetrics = false,
}: Props) {
  const options = useMemo(() => availableRanges(data), [data]);
  const [range, setRange] = useState<TimeRange>(
    ranges && options.includes("3M") ? "3M" : "ALL",
  );
  const [selection, dispatch] = useReducer(selectionReducer, emptySelection);
  const { active } = selection;
  const bounds = selectionBounds(selection);
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
      <div className="py-8 text-body text-muted-foreground" role="status">
        {points.length
          ? "At least two observations are needed to compare performance."
          : "No overlapping price history is available for this comparison."}
      </div>
    );
  const start = points[0];
  const end = points.at(-1)!;
  const selected = points[bounds?.[1] ?? active ?? points.length - 1];
  const baselinePoint = points[bounds?.[0] ?? 0];
  const primary = series[0];
  const metric = (text: string) =>
    nameMetrics ? `${primary.label} · ${text.toLowerCase()}` : text;
  const value = selected.values[primary.key];
  const baseline = baselinePoint.values[primary.key];
  const { change, returnPct: selectedReturn } = intervalPerformance(
    baselinePoint,
    selected,
    primary.key,
  );
  const returns = Object.fromEntries(
    series.map((s) => [
      s.key,
      intervalPerformance(baselinePoint, selected, s.key).returnPct,
    ]),
  );
  const activeReturn =
    series.length === 2 &&
    returns[series[0].key] != null &&
    returns[series[1].key] != null
      ? (returns[series[0].key]! - returns[series[1].key]!) * 100
      : null;
  return (
    <section aria-label={label} className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-muted-foreground tnum">
          {exactDate(start.date)} – {exactDate(end.date)}
        </p>
        {ranges && (
          <TimeRangeSelector
            ranges={options}
            value={range}
            onChange={(next) => {
              dispatch({ type: "clear" });
              setRange(next);
            }}
          />
        )}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 tnum">
        <Metric
          label={metric(kind === "price" ? "Starting price" : "Starting index")}
          value={price(baseline, kind === "price" ? primary.unit : undefined)}
        />
        <Metric
          label={metric(
            active === null
              ? kind === "price"
                ? "Latest close"
                : "Latest index"
              : kind === "price"
                ? "Selected close"
                : "Selected index",
          )}
          value={price(value, kind === "price" ? primary.unit : undefined)}
        />
        <Metric
          label={metric(kind === "price" ? "Price change" : "Index change")}
          value={
            change === null
              ? "Unavailable"
              : fmtAccounting(change, 2, kind === "price" && primary.unit ? ` ${primary.unit}` : "")
          }
          change={change}
        />
        <Metric
          label={metric(bounds ? "Selected interval return" : "Period return")}
          value={
            selectedReturn === null ? "Unavailable" : fmtPct(selectedReturn)
          }
          change={selectedReturn}
        />
      </div>
      <div
        className="mb-3 flex h-14 items-center justify-between gap-2 text-body sm:h-8"
        aria-live="polite"
      >
        {bounds ? (
          <>
            <span>
              Selected interval: {exactDate(baselinePoint.date)} –{" "}
              {exactDate(selected.date)}
            </span>
            <button
              type="button"
              className="shrink-0 rounded px-2 py-1 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => dispatch({ type: "clear" })}
            >
              Clear selection
            </button>
          </>
        ) : (
          <span className="text-muted-foreground">
            Hold and drag between two dates to compare.
          </span>
        )}
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
              stroke="var(--row)"
              strokeDasharray=""
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={[start.time, end.time]}
              scale="time"
              tickFormatter={(time: number) =>
                tickDate(new Date(time).toISOString().slice(0, 10))
              }
              tick={chartTick}
              minTickGap={40}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => fmtPct(v, 1)}
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
                strokeOpacity={bounds ? 0.25 : 1}
                connectNulls={false}
                dot={points.length <= 3 ? { r: 3 } : false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            <ScrubLayer
              points={points}
              series={series}
              selection={selection}
              dispatch={dispatch}
              label={label}
              helpId={helpId}
            />
          </LineChart>
        </ResponsiveContainer>
        {active !== null && (
          <div
            className={`pointer-events-none absolute top-2 z-10 max-w-[calc(100%-4rem)] ${active < points.length / 2 ? "right-3" : "left-16"}`}
          >
            <ChartTooltip
              label={
                bounds
                  ? `${exactDate(baselinePoint.date)} – ${exactDate(selected.date)}`
                  : exactDate(selected.date)
              }
            >
              {bounds && (
                <div className="text-muted-foreground">
                  {kind === "price"
                    ? "Price change · return"
                    : "Interval return"}
                </div>
              )}
              {series.map((s) => (
                <div
                  key={s.key}
                  className="flex flex-wrap justify-between gap-x-4 gap-y-1"
                >
                  <span>{s.label}</span>
                  <span>
                    {kind === "price" && (
                      <>
                        {bounds
                          ? formatChange(
                              intervalPerformance(
                                baselinePoint,
                                selected,
                                s.key,
                              ).change,
                              s.unit,
                            )
                          : price(selected.values[s.key], s.unit)}{" "}
                        ·{" "}
                      </>
                    )}
                    <span className={tone(returns[s.key])}>
                      {returns[s.key] == null
                        ? "Unavailable"
                        : fmtPct(returns[s.key]!)}
                    </span>
                  </span>
                </div>
              ))}
              {activeReturn !== null && (
                <div className="border-t pt-1.5 text-muted-foreground">
                  Active return{" "}
                  <span className={tone(activeReturn)}>
                    {fmtBp(activeReturn, 1)}
                  </span>
                </div>
              )}
            </ChartTooltip>
          </div>
        )}
      </div>
      <ChartLegend series={series} note={note} />
      <p id={helpId} className="mt-2 text-caption text-muted-foreground">
        Hover to inspect · Hold and drag to compare dates · Shift + ← → selects
        an interval · Esc or Clear selection resets
      </p>
      {kind === "return" && (
        <p className="mt-1 text-caption text-muted-foreground">
          Index starts at 100; it represents cumulative return, not portfolio
          dollars.
        </p>
      )}
      <details className="mt-3 text-caption text-muted-foreground">
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
                <th scope="col" className="p-2">Date</th>
                {series.map((s) => (
                  <th scope="col" key={s.key} className="p-2">
                    {s.label}
                    {kind === "price" ? " · price / return" : " · return"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-t">
                  <th scope="row" className="p-2 font-normal whitespace-nowrap">
                    {p.date}
                  </th>
                  {series.map((s) => (
                    <td key={s.key} className="p-2 whitespace-nowrap">
                      {kind === "price" && (
                        <>{price(p.values[s.key], s.unit)} / </>
                      )}
                      {p.returns[s.key] == null
                        ? "Unavailable"
                        : fmtPct(p.returns[s.key]!)}
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
      <div className="mb-1 text-caption text-muted-foreground">{label}</div>
      <div
        className={`text-body font-medium tracking-tight sm:text-emph ${tone(change)}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Public Recharts scales keep pointer, touch and keyboard on actual observations. */
function ScrubLayer({
  points,
  series,
  selection,
  dispatch,
  label,
  helpId,
}: {
  points: PerformancePoint[];
  series: ChartSeries[];
  selection: Selection;
  dispatch: Dispatch<SelectionAction>;
  label: string;
  helpId: string;
}) {
  const pointer = useRef<number | null>(null);
  const gradientId = useId();
  const area = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const inverse = useXAxisInverseScale();
  if (!area || !xScale || !yScale || !inverse) return null;
  const { active } = selection;
  const bounds = selectionBounds(selection);
  const baseline = points[bounds?.[0] ?? 0];
  const end = points[bounds?.[1] ?? active ?? points.length - 1];
  const change = intervalPerformance(baseline, end, series[0].key).returnPct;
  const color =
    change === null || change === 0
      ? series[0].color
      : change > 0
        ? "var(--up)"
        : "var(--down)";
  function indexAt(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pixel =
      area!.x +
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) *
        area!.width;
    const inverted = inverse!(pixel);
    const time = inverted instanceof Date ? inverted.getTime() : inverted;
    return typeof time === "number" && Number.isFinite(time)
      ? nearestPoint(points, time)
      : null;
  }
  function release(target: SVGRectElement) {
    const id = pointer.current;
    pointer.current = null;
    if (id !== null && target.hasPointerCapture(id))
      target.releasePointerCapture(id);
  }
  const endpoints = bounds ?? (active === null ? [] : [active]);
  return (
    <g>
      {bounds && (
        <g pointerEvents="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {series.map((s, seriesIndex) => {
            // Separate paths at missing observations: never bridge a missing benchmark value.
            const segments: [number, number][][] = [];
            let segment: [number, number][] = [];
            for (const p of points.slice(bounds[0], bounds[1] + 1)) {
              const value = p.returns[s.key];
              const x = xScale(p.time);
              const y = value == null ? undefined : yScale(value);
              if (x == null || y == null) {
                if (segment.length) segments.push(segment);
                segment = [];
              } else segment.push([x, y]);
            }
            if (segment.length) segments.push(segment);
            return segments.map((coords, i) => {
              const path = coords
                .map(([x, y], j) => `${j ? "L" : "M"}${x},${y}`)
                .join(" ");
              return (
                <g key={`${s.key}-${i}`}>
                  {seriesIndex === 0 && coords.length > 1 && (
                    <path
                      d={`${path} L${coords.at(-1)![0]},${area.y + area.height} L${coords[0][0]},${area.y + area.height} Z`}
                      fill={`url(#${gradientId})`}
                    />
                  )}
                  <path
                    d={path}
                    fill="none"
                    stroke={seriesIndex === 0 ? color : s.color}
                    strokeWidth={2}
                    strokeDasharray={s.dashed ? "5 4" : undefined}
                  />
                </g>
              );
            });
          })}
        </g>
      )}
      <g pointerEvents="none">
        {endpoints.map((index) => (
          <g key={index}>
            <line
              x1={xScale(points[index].time)}
              x2={xScale(points[index].time)}
              y1={area.y}
              y2={area.y + area.height}
              stroke="var(--muted-foreground)"
              strokeDasharray="3 3"
            />
            {series.map(
              (s, i) =>
                points[index].returns[s.key] != null && (
                  <circle
                    key={s.key}
                    cx={xScale(points[index].time)}
                    cy={yScale(points[index].returns[s.key])}
                    r={4}
                    fill={bounds && i === 0 ? color : s.color}
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                ),
            )}
          </g>
        ))}
      </g>
      <rect
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        fill="transparent"
        style={{
          touchAction: "pan-y",
          cursor: "crosshair",
          userSelect: "none",
        }}
        tabIndex={0}
        role="slider"
        aria-label={`${label} date`}
        aria-describedby={helpId}
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={active ?? points.length - 1}
        aria-valuetext={`${bounds ? `${exactDate(baseline.date)} to ` : ""}${exactDate(end.date)}; ${series
          .map((s) => {
            const value = intervalPerformance(baseline, end, s.key).returnPct;
            return `${s.label}: ${value == null ? "unavailable" : fmtPct(value)}`;
          })
          .join("; ")}`}
        className="outline-none focus-visible:stroke-ring focus-visible:stroke-2"
        onPointerDown={(event) => {
          if (
            !event.isPrimary ||
            event.button !== 0 ||
            pointer.current !== null
          )
            return;
          const index = indexAt(event);
          if (index === null) return;
          event.currentTarget.focus({ preventScroll: true });
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          dispatch({ type: "start", index });
        }}
        onPointerMove={(event) => {
          if (
            !event.isPrimary ||
            (pointer.current !== null && pointer.current !== event.pointerId)
          )
            return;
          const index = indexAt(event);
          if (index !== null)
            dispatch({
              type: pointer.current === event.pointerId ? "move" : "hover",
              index,
            });
        }}
        onPointerUp={(event) => {
          if (pointer.current !== event.pointerId) return;
          const index = indexAt(event);
          dispatch(index === null ? { type: "clear" } : { type: "end", index });
          release(event.currentTarget);
        }}
        onPointerLeave={() => dispatch({ type: "leave" })}
        onPointerCancel={(event) => {
          if (pointer.current === event.pointerId) {
            release(event.currentTarget);
            dispatch({ type: "clear" });
          }
        }}
        onLostPointerCapture={() => {
          pointer.current = null;
          dispatch({ type: "lost" });
        }}
        onBlur={(event) => {
          release(event.currentTarget);
          dispatch({ type: "lost" });
          dispatch({ type: "leave" });
        }}
        onFocus={() => dispatch({ type: "hover", index: points.length - 1 })}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            release(event.currentTarget);
            dispatch({ type: "clear" });
            return;
          }
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
                    : undefined;
          if (next !== undefined) {
            event.preventDefault();
            release(event.currentTarget);
            dispatch({
              type: "key",
              index: next,
              extend: event.shiftKey,
              fallback: index,
            });
          }
        }}
      />
    </g>
  );
}
