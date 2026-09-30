"use client";

import { useId, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { TimeRangeSelector, chartGrid, chartTick, exactDate, tone, valueAxis } from "@/components/charts/primitives";
import { fmtAccounting, fmtCurrency, fmtPct } from "@/lib/format";
import { availableRanges, normalizeObservations, performance, selectRange, type Observation, type TimeRange } from "@/lib/charts/series";
import { RechartsScrubber, SelectionReadout, scrubHelp, useChartSelection } from "@/components/charts/interaction";
import { intervalChange } from "@/lib/charts/interval";
import { cn } from "@/lib/utils";

const COMPACT_RANGES: TimeRange[] = ["1M", "3M", "6M", "1Y"];
const HOLDING = "var(--series-1)";
const BENCH = "var(--series-neutral)";

/**
 * The holding page's "Price vs S&P 500" panel: a compact rebased chart with a 1M/3M/6M/1Y control and both returns in
 * the legend. "Compare dates" swaps in the full PerformanceChart (start/end prices, interval selection, observations).
 */
export function PriceChart({ data, ticker, currency, className }: { data: Observation[]; ticker: string; currency?: string; className?: string }) {
  const observations = useMemo(() => normalizeObservations(data), [data]);
  const options = useMemo(() => {
    const avail = availableRanges(observations);
    const compact = COMPACT_RANGES.filter((r) => avail.includes(r));
    return compact.length ? compact : avail.includes("ALL") ? (["ALL"] as TimeRange[]) : [];
  }, [observations]);
  const [range, setRange] = useState<TimeRange>(() => (options.includes("1Y") ? "1Y" : (options.at(-1) ?? "ALL")));
  const [detailed, setDetailed] = useState(false);
  const points = useMemo(() => performance(selectRange(observations, range)), [observations, range]);
  const plotted = useMemo(() => points.map((p) => ({ time: p.time, date: p.date, holding: p.returns.holding, benchmark: p.returns.benchmark, price: p.values.holding })), [points]);
  const helpId = useId();
  const { selection, dispatch, bounds } = useChartSelection(points);
  const last = points[bounds?.[1] ?? selection.active ?? points.length - 1];
  const first = bounds ? points[bounds[0]] : null;
  const chartLines = [{ key: "holding", color: HOLDING }, { key: "benchmark", color: BENCH }];
  const ticks = useMemo(() => pickTicks(points.map((p) => ({ time: p.time, date: p.date }))), [points]);
  // Both lines are rebased to 0% at the range's first close, so the axis is the return; the tooltip gives the price.
  const axis = useMemo(() => valueAxis(plotted.flatMap((p) => [p.holding, p.benchmark]), fmtPct), [plotted]);

  return (
    <section className={cn("panel min-w-0 px-4 py-3.5", className)} aria-label={`${ticker} versus S&P 500`}>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <h2 className="text-emph font-semibold whitespace-nowrap">Price vs S&amp;P 500</h2>
        {!detailed && last && (
          <>
            <LegendItem color={HOLDING} label={ticker} value={last.returns.holding} />
            <LegendItem color={BENCH} label="S&P 500" value={last.returns.benchmark} />
          </>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => { dispatch({ type: "clear" }); setDetailed((d) => !d); }} className="text-body text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-pressed={detailed}>
          {detailed ? "Simple view" : "Compare dates"}
        </button>
        {!detailed && options.length > 1 && (
          <TimeRangeSelector ranges={options} value={range} onChange={(next) => { dispatch({ type: "clear" }); setRange(next); }} />
        )}
      </div>
      {detailed ? (
        <div className="mt-3">
          <PerformanceChart
            data={observations}
            label={`${ticker} versus S&P 500`}
            series={[
              { key: "holding", label: ticker, color: HOLDING, currency },
              { key: "benchmark", label: "S&P 500", color: BENCH, dashed: true, unit: "pts" },
            ]}
            note="Daily closes · rebased to 0% · price return"
          />
        </div>
      ) : points.length < 2 ? (
        <p className="py-16 text-center text-body text-muted-foreground" role="status">
          No overlapping price history is available for this comparison yet.
        </p>
      ) : (
        <div className="mt-2.5">
          <div className="relative h-[200px] w-full" style={{ touchAction: "pan-y" }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={plotted} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
              {/* Gridlines only at the labelled returns, not the plot's unlabelled top and bottom edges. */}
              <CartesianGrid vertical={false} stroke={chartGrid} syncWithTicks />
              <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks.map((t) => t.time)}
                tick={({ x, y, payload }: { x: number | string; y: number | string; payload: { value: number } }) => {
                  // The end ticks hug the plot edges instead of centering past them.
                  const i = ticks.findIndex((t) => t.time === payload.value);
                  const anchor = i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle";
                  return (
                    <text x={Number(x)} y={Number(y)} dy={10} textAnchor={anchor} fontSize={chartTick.fontSize} fill={chartTick.fill} fontFamily={chartTick.fontFamily}>
                      {ticks[i]?.label ?? ""}
                    </text>
                  );
                }}
                axisLine={false} tickLine={false} interval={0} height={22} />
              <YAxis tick={chartTick} tickLine={false} axisLine={false} {...axis} />
              {/* The 0% start both lines are rebased to. */}
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
              <Line type="linear" dataKey="benchmark" stroke={BENCH} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />
              <Line type="linear" dataKey="holding" stroke={HOLDING} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />
              <RechartsScrubber rows={plotted} xKey="time" lines={chartLines} selection={selection} dispatch={dispatch} label={`${ticker} versus S&P 500`} helpId={helpId}
                valueText={`${first ? `${exactDate(first.date)} to ` : ""}${exactDate(last.date)}; ${ticker}: ${fmtCurrency(last.values.holding, currency)}; S&P 500: ${fmtPct(last.returns.benchmark)}`} />
            </LineChart>
          </ResponsiveContainer>
          {selection.active !== null && last && <SelectionReadout selected={!!bounds} onClear={() => dispatch({ type: "clear" })}
            label={first ? `${exactDate(first.date)} – ${exactDate(last.date)}` : exactDate(last.date)}>
            {[{ key: "holding", label: ticker }, { key: "benchmark", label: "S&P 500" }].map((l) => {
              const result = first ? intervalChange(first.values[l.key], last.values[l.key], "price") : null;
              const amount = (v: number | null) => v == null ? "Unavailable" : l.key === "holding" ? fmtCurrency(v, currency) : `${fmtAccounting(v, 2)} pts`;
              return <div key={l.key}>
                <div className="flex flex-wrap justify-between gap-x-4"><span>{l.label}</span><span>{first ? `${amount(first.values[l.key])} → ` : ""}{amount(last.values[l.key])}</span></div>
                <div className={tone(result ? result.returnPct : last.returns[l.key])}>{result ? `Change ${amount(result.change)} · interval return ` : "Period return "}{(result ? result.returnPct : last.returns[l.key]) == null ? "Unavailable" : fmtPct((result ? result.returnPct : last.returns[l.key])!)}</div>
              </div>;
            })}
          </SelectionReadout>}
          </div>
          <p id={helpId} className="mt-2 text-caption text-muted-foreground">{scrubHelp}</p>
        </div>
      )}
    </section>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number | null | undefined }) {
  return (
    <span className="flex items-center gap-1.5 text-body whitespace-nowrap text-ink-2">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
      <span className="font-mono">{fmtPct(value, 1)}</span>
    </span>
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** About five ticks: the ends as "OCT 25" (month and day) and month starts in between, or weekly ticks on a short range. */
function pickTicks(points: { time: number; date: string }[]) {
  if (points.length < 2) return [];
  const label = (date: string, day: boolean) => `${MONTHS[Number(date.slice(5, 7)) - 1]}${day ? ` ${Number(date.slice(8, 10))}` : ""}`;
  const first = points[0];
  const last = points.at(-1)!;
  const span = last.time - first.time;
  const inner: { time: number; date: string }[] = [];
  if (span > 50 * 86_400_000) {
    for (let i = 1; i < points.length - 1; i++) if (points[i].date.slice(0, 7) !== points[i - 1].date.slice(0, 7)) inner.push(points[i]);
  } else {
    const step = Math.max(1, Math.round(points.length / 4));
    for (let i = step; i < points.length - 1; i += step) inner.push(points[i]);
  }
  // Keep inner ticks clear of the ends and thin them to at most three.
  const gap = span * 0.12;
  const clear = inner.filter((p) => p.time - first.time > gap && last.time - p.time > gap);
  const k = Math.ceil(clear.length / 3) || 1;
  const middle = clear.filter((_, i) => i % k === Math.floor(k / 2));
  const monthly = span > 50 * 86_400_000;
  return [{ time: first.time, label: label(first.date, true) }, ...middle.map((p) => ({ time: p.time, label: label(p.date, !monthly) })), { time: last.time, label: label(last.date, true) }];
}
