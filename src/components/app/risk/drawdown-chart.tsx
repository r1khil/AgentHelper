"use client";

import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { exactDate, tone } from "@/components/charts/primitives";
import { EdgeTick } from "@/components/app/portfolio/lines-chart";
import { useId } from "react";
import { RechartsScrubber, SelectionReadout, scrubHelp, useChartSelection } from "@/components/charts/interaction";
import { intervalChange } from "@/lib/charts/interval";
import { fmtAccounting, fmtDate, fmtPct } from "@/lib/format";

/** `fund` and `market` are drawdowns in percent (0 or negative). */
export type DrawdownPoint = { date: string; fund: number; market?: number };

/**
 * Drawdown from the previous high, the one chart with a fill: the decline as a light red area under a line at the
 * peak (0%). With `market` the S&P 500's is drawn dotted-grey beside it. The x axis names five dates and the worst
 * day, with its depth.
 */
export function DrawdownChart({ data, fundLabel, marketLabel = "S&P 500 (SPY)", height = 150, worstDate }: { data: DrawdownPoint[]; fundLabel: string; marketLabel?: string; height?: number; worstDate?: string | null }) {
  const helpId = useId();
  const { selection, dispatch, bounds } = useChartSelection(data[0]?.date, data.length);
  if (data.length < 2) return <div className="text-body text-muted-foreground">Needs at least two trading days.</div>;
  const hasMarket = data.some((d) => d.market !== undefined);
  const lows = data.flatMap((d) => [d.fund, d.market ?? 0]);
  const low = Math.min(-1, ...lows);
  const worst = data.reduce((w, d) => (d.fund < w.fund ? d : w), data[0]);
  const worstAt = worstDate ?? worst.date;
  // Five dates across the window; the one nearest the worst day is that day, named.
  const pick = [0, 0.25, 0.5, 0.75, 1].map((f) => data[Math.round(f * (data.length - 1))].date);
  const worstIdx = data.findIndex((d) => d.date === worstAt);
  const nearest = pick.reduce((best, d, i) => (Math.abs(data.findIndex((x) => x.date === d) - worstIdx) < Math.abs(data.findIndex((x) => x.date === pick[best]) - worstIdx) ? i : best), 0);
  const ticks = pick.map((d, i) => (i === nearest && i > 0 && i < pick.length - 1 ? worstAt : d));
  const label = (d: string) => (d === worstAt && d !== data[0].date && d !== data.at(-1)!.date ? `${fmtDate(d)}, worst ${fmtPct(worst.fund)}` : fmtDate(d));
  const lines = [{ key: "fund", label: fundLabel, color: "var(--down-line)" }, ...(hasMarket ? [{ key: "market", label: marketLabel, color: "var(--series-neutral)" }] : [])];
  const selected = data[bounds?.[1] ?? selection.active ?? data.length - 1];
  const first = bounds ? data[bounds[0]] : null;
  return (
    <div>
    <div className="relative w-full" style={{ height, touchAction: "pan-y" }} role="group" aria-label={`${fundLabel} drawdown from the previous high; the worst was ${fmtPct(worst.fund)} on ${fmtDate(worstAt)}`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }} accessibilityLayer={false}>
          <XAxis dataKey="date" ticks={ticks} interval={0} tick={<EdgeTick format={label} />} tickLine={false} axisLine={false} padding={{ left: 0, right: 0 }} />
          <YAxis hide domain={[low, 0]} />
          <ReferenceLine y={0} stroke="var(--bench-bar)" />
          <Area type="linear" dataKey="fund" stroke="var(--down-line)" fill="var(--down-fill)" fillOpacity={1} strokeWidth={2} strokeLinejoin="round" baseValue={0} isAnimationActive={false} activeDot={false} />
          {hasMarket && <Line type="linear" dataKey="market" stroke="var(--series-neutral)" strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" dot={false} isAnimationActive={false} activeDot={false} />}
          <RechartsScrubber rows={data} xKey="date" lines={lines} selection={selection} dispatch={dispatch} label={`${fundLabel} drawdown`} helpId={helpId}
            valueText={selected ? `${first ? `${exactDate(first.date)} to ` : ""}${exactDate(selected.date)}; ${lines.map((l) => `${l.label}: ${fmtPct(selected[l.key as keyof typeof selected] as number)}`).join("; ")}` : "No observations"} />
        </ComposedChart>
      </ResponsiveContainer>
      {selected && selection.active !== null && <SelectionReadout selected={!!bounds} onClear={() => dispatch({ type: "clear" })}
        label={first ? `${exactDate(first.date)} – ${exactDate(selected.date)}` : exactDate(selected.date)}>
        {lines.map((l) => {
          const a = first?.[l.key as keyof typeof first];
          const b = selected[l.key as keyof typeof selected];
          const result = first ? intervalChange(a, b, "level") : null;
          return <div key={l.key}>
            <div className="flex flex-wrap justify-between gap-x-4"><span>{l.label}</span><span>{first ? `${fmtPct(a as number)} → ` : ""}{fmtPct(b as number)}</span></div>
            {result && <div className={tone(result.change)}>Change in drawdown {result.change === null ? "Unavailable" : fmtAccounting(result.change, 2)} percentage points</div>}
          </div>;
        })}
      </SelectionReadout>}
    </div>
    <p id={helpId} className="mt-2 text-caption text-muted-foreground">{scrubHelp}</p>
    </div>
  );
}
