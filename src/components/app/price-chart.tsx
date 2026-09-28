"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { ChartTooltip, TimeRangeSelector, axisWidth, chartGrid, chartTick, exactDate, tone } from "@/components/charts/primitives";
import { niceScale } from "@/lib/charts/ticks";
import { fmtCurrency, fmtPct } from "@/lib/format";
import { availableRanges, normalizeObservations, performance, selectRange, type Observation, type TimeRange } from "@/lib/charts/series";
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
  const last = points.at(-1);
  const ticks = useMemo(() => pickTicks(points.map((p) => ({ time: p.time, date: p.date }))), [points]);
  const axis = useMemo(() => priceAxis(plotted, points[0]?.values.holding, currency), [plotted, points, currency]);

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
        <button type="button" onClick={() => setDetailed((d) => !d)} className="text-body text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-pressed={detailed}>
          {detailed ? "Simple view" : "Compare dates"}
        </button>
        {!detailed && options.length > 1 && (
          <TimeRangeSelector ranges={options} value={range} onChange={setRange} />
        )}
      </div>
      {detailed ? (
        <div className="mt-3">
          <PerformanceChart
            data={observations}
            label={`${ticker} versus S&P 500`}
            series={[
              { key: "holding", label: ticker, color: HOLDING, unit: currency },
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
        <div className="mt-2.5 h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={plotted} margin={{ top: 6, right: 4, bottom: 0, left: axis ? 0 : 4 }} accessibilityLayer={false}>
              {/* Gridlines only at the labelled prices, not the plot's unlabelled top and bottom edges. */}
              <CartesianGrid vertical={false} stroke={chartGrid} syncWithTicks={!!axis} />
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
              {axis ? (
                <YAxis ticks={axis.ticks} domain={axis.domain} interval={0} tickFormatter={axis.format} tick={chartTick} tickLine={false} axisLine={false} width={axis.width} />
              ) : (
                <YAxis hide domain={["auto", "auto"]} />
              )}
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as (typeof plotted)[number] | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <ChartTooltip label={exactDate(p.date)}>
                      <div className="flex justify-between gap-4">
                        <span>{ticker}</span>
                        <span>
                          {p.price != null ? `${fmtCurrency(p.price, currency)} · ` : ""}
                          <span className={tone(p.holding ?? null)}>{fmtPct(p.holding)}</span>
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span>S&amp;P 500</span>
                        <span className={tone(p.benchmark ?? null)}>{fmtPct(p.benchmark)}</span>
                      </div>
                    </ChartTooltip>
                  );
                }}
              />
              <Line type="linear" dataKey="benchmark" stroke={BENCH} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />
              <Line type="linear" dataKey="holding" stroke={HOLDING} strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
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

/**
 * The value axis in the holding's price. Both lines are drawn rebased to 0% at the range's first close, so a price is
 * the holding's first close times (1 + return); the ticks are round prices (three or four) placed at their returns. The
 * S&P 500 line shares the scale as the index rebased to that same starting price.
 */
function priceAxis(plotted: { holding: number | null | undefined; benchmark: number | null | undefined }[], base: number | null | undefined, currency?: string) {
  if (base == null || !(base > 0)) return null;
  const prices = plotted.flatMap((p) => [p.holding, p.benchmark]).filter((r): r is number => r != null && Number.isFinite(r)).map((r) => base * (1 + r / 100));
  if (!prices.length) return null;
  const s = niceScale(Math.min(...prices), Math.max(...prices));
  if (!s) return null;
  const toReturn = (price: number) => (price / base - 1) * 100;
  const label = (price: number) => fmtCurrency(price, currency, { digits: s.digits });
  return { ticks: s.ticks.map(toReturn), domain: s.domain.map(toReturn) as [number, number], format: (r: number) => label(base * (1 + r / 100)), width: axisWidth(s.ticks.map(label)) };
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
