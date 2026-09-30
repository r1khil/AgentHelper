"use client";

import { useId, useMemo } from "react";
import { SelectionReadout, scrubHelp, scrubStyle, useChartSelection, useScrubBindings } from "@/components/charts/interaction";
import { intervalChange, nearestCoordinate } from "@/lib/charts/interval";
import { fmtChangePct } from "@/lib/format";
import { cn } from "@/lib/utils";

// The one hairline chart of the Portfolio pages: a line drawn edge to edge over a 220px band, no axes, no grid.
// The stroke is green or red by whether the stretch is up or down; a replayed stretch is dashed grey. Hovering reads
// a point off or dragging compares two observations; a marker (a trade) is a small ink dot on the line.

export type ChartLine = {
  /** Time in ms and the value at it, oldest first. */
  points: { t: number; v: number }[];
  tone: "up" | "down" | "neutral";
  dashed?: boolean;
  /** Said in the hover readout for points on this line ("today's weights replayed"). */
  note?: string;
};

export type ChartMarker = { t: number; v: number; label: string };

const W = 600;
const H = 140;
const STROKE: Record<ChartLine["tone"], string> = { up: "var(--up-line)", down: "var(--down-line)", neutral: "var(--series-neutral)" };

export function toneFor(delta: number): ChartLine["tone"] {
  return delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
}

export function LineChart({
  lines,
  markers = [],
  label,
  formatX,
  formatY,
  joinAt,
  className,
}: {
  lines: ChartLine[];
  markers?: ChartMarker[];
  /** What the chart shows, for screen readers. */
  label: string;
  formatX: (t: number) => string;
  formatY: (v: number) => string;
  /** A hairline at this time: where the replay hands over to the ledger. */
  joinAt?: number;
  className?: string;
}) {
  const helpId = useId();
  const { selection, dispatch, bounds } = useChartSelection(lines);
  // Replay and ledger share their join point; inspect the ledger at that boundary.
  const all = useMemo(() => [...new Map(lines.flatMap((line) => line.points
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .map((p) => [p.t, { ...p, line }] as const))).values()].sort((a, b) => a.t - b.t), [lines]);
  const geo = useMemo(() => {
    if (all.length < 2) return null;
    const t0 = all[0].t;
    const t1 = all.at(-1)!.t;
    const values = all.map((p) => p.v);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    // Breathing room so the line never touches the band's edges, and a floor so a flat stretch stays flat.
    const span = Math.max(hi - lo, Math.abs(hi) * 0.004) || 1;
    const pad = span * 0.12;
    const y0 = lo - pad;
    const ySpan = span + pad * 2;
    const x = (t: number) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * W);
    const y = (v: number) => H - ((v - y0) / ySpan) * H;
    return { x, y, t0, t1 };
  }, [all]);

  const bind = useScrubBindings(all.length, selection, dispatch, (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!geo || !rect.width) return null;
    const pixel = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * W;
    return nearestCoordinate(all.map((p) => geo.x(p.t)), pixel);
  });
  if (!geo) {
    return (
      <div className={cn("grid h-[220px] place-items-center text-body text-muted-foreground", className)} role="status">
        Not enough history to draw a line yet.
      </div>
    );
  }
  const { x, y } = geo;

  const h = selection.active === null ? null : all[bounds?.[1] ?? selection.active];
  const start = bounds ? all[bounds[0]] : null;
  const result = start && h ? intervalChange(start.v, h.v, "price") : null;
  const endpoints = bounds ?? (selection.active === null ? [] : [selection.active]);
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;

  return (
    <div className={className}>
    <div className="relative h-[220px]" style={{ touchAction: "pan-y" }}>
      <svg width="100%" height="220" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={label} className="block">
        {joinAt !== undefined && <line x1={x(joinAt)} y1={0} x2={x(joinAt)} y2={H} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {lines.map((l, i) => (
          <polyline
            key={i}
            fill="none"
            stroke={STROKE[l.tone]}
            strokeWidth={l.dashed ? 1.75 : 2.75}
            strokeDasharray={l.dashed ? "4 4" : undefined}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={l.points.map((p) => `${Math.round(x(p.t) * 10) / 10},${Math.round(y(p.v) * 10) / 10}`).join(" ")}
          />
        ))}
        <g pointerEvents="none" aria-hidden="true">
          {bounds && <rect x={x(all[bounds[0]].t)} y={0} width={x(all[bounds[1]].t) - x(all[bounds[0]].t)} height={H} fill="var(--series-1)" opacity={0.09} />}
          {endpoints.map((index) => <g key={index}>
            <line x1={x(all[index].t)} y1={0} x2={x(all[index].t)} y2={H} stroke="var(--series-neutral)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          </g>)}
        </g>
        <rect x={0} y={0} width={W} height={H} fill="transparent" style={scrubStyle} tabIndex={0} role="slider"
          aria-label={`${label} date`} aria-describedby={helpId} aria-valuemin={0} aria-valuemax={all.length - 1}
          aria-valuenow={selection.active ?? all.length - 1}
          aria-valuetext={`${start ? `${formatX(start.t)} to ` : ""}${formatX((h ?? all.at(-1)!).t)}; ${formatY((h ?? all.at(-1)!).v)}${result ? `; change ${formatY(result.change!)}; ${fmtChangePct(result.returnPct)}` : ""}`}
          className="outline-none focus-visible:stroke-ring focus-visible:stroke-2" {...bind} />
      </svg>
      {markers.map((m, i) => (
        <span
          key={i}
          title={m.label}
          aria-label={m.label}
          role="img"
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: pct(x(m.t), W), top: pct(y(m.v), H) }}
        />
      ))}
      {endpoints.map((index) => <span key={index} aria-hidden className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground" style={{ left: pct(x(all[index].t), W), top: pct(y(all[index].v), H) }} />)}
      {h && <SelectionReadout selected={!!bounds} onClear={() => dispatch({ type: "clear" })}
        label={start ? `${formatX(start.t)} – ${formatX(h.t)}` : formatX(h.t)}>
        <div className="font-semibold">{start ? `${formatY(start.v)} → ${formatY(h.v)}` : formatY(h.v)}</div>
        {result && <div className={result.change! < 0 ? "text-down" : "text-up"}>Change {formatY(result.change!)} · {result.returnPct === null ? "Return unavailable" : fmtChangePct(result.returnPct)}</div>}
        {markers.filter((m) => m.t === h.t).map((m, i) => <div key={i} className="font-sans text-caption text-muted-foreground">{m.label}</div>)}
        {(start?.line.note || h.line.note) && <div className="font-sans text-caption text-muted-foreground">
          {start && start.line.note !== h.line.note ? `${start.line.note ?? "Ledger history"} → ${h.line.note ?? "Ledger history"}` : h.line.note}
        </div>}
      </SelectionReadout>}
    </div>
    <p id={helpId} className="mt-2 text-caption text-muted-foreground">{scrubHelp}</p>
    </div>
  );
}
