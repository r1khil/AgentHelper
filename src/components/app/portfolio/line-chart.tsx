"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// The one hairline chart of the Portfolio pages: a line drawn edge to edge over a 220px band, no axes, no grid.
// The stroke is green or red by whether the stretch is up or down; a replayed stretch is dashed grey. Hovering reads
// a point off; a marker (a trade) is a small ink dot on the line.

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
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const all = useMemo(() => lines.flatMap((l) => l.points.map((p) => ({ ...p, line: l }))).sort((a, b) => a.t - b.t), [lines]);
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

  if (!geo) {
    return (
      <div className={cn("grid h-[220px] place-items-center text-body text-muted-foreground", className)} role="status">
        Not enough history to draw a line yet.
      </div>
    );
  }
  const { x, y } = geo;

  const onMove = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const t = geo.t0 + ((e.clientX - r.left) / r.width) * (geo.t1 - geo.t0);
    let best = 0;
    for (let i = 1; i < all.length; i++) if (Math.abs(all[i].t - t) < Math.abs(all[best].t - t)) best = i;
    setHover(best);
  };
  const h = hover === null ? null : all[hover];
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;

  return (
    <div ref={box} className={cn("relative", className)} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg width="100%" height="220" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="block">
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
        {h && <line x1={x(h.t)} y1={0} x2={x(h.t)} y2={H} stroke="var(--series-neutral)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      {markers.map((m, i) => (
        <span
          key={i}
          title={m.label}
          aria-label={m.label}
          role="img"
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: pct(x(m.t), W), top: pct(y(m.v), H) }}
        />
      ))}
      {h && (
        <>
          <span aria-hidden className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground" style={{ left: pct(x(h.t), W), top: pct(y(h.v), H) }} />
          <div
            role="status"
            className={cn(
              "pointer-events-none absolute top-0 z-10 rounded-lg border bg-popover px-2.5 py-1.5 text-caption whitespace-nowrap text-popover-foreground shadow-sm",
              x(h.t) / W > 0.7 ? "-translate-x-full" : "translate-x-2",
            )}
            style={{ left: pct(x(h.t), W) }}
          >
            <div className="font-semibold">{formatY(h.v)}</div>
            <div className="text-muted-foreground">
              {formatX(h.t)}
              {h.line.note ? `, ${h.line.note}` : ""}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
