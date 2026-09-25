"use client";

import { useEffect, useRef } from "react";
import { padded, type Box } from "./placement";

const MOVE_MS = 460;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Box, b: Box, t: number): Box => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), width: lerp(a.width, b.width, t), height: lerp(a.height, b.height, t) });
const dot = (b: Box): Box => ({ x: b.x + b.width / 2, y: b.y + b.height / 2, width: 0, height: 0 });

function holePath(b: Box, radius: number) {
  const r = Math.min(radius, b.width / 2, b.height / 2);
  const { x, y, width: w, height: h } = b;
  return `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
}

/**
 * Dims the whole app except one rounded window over `target`, which glides from part to part and follows it
 * while the page scrolls. The dim layer swallows clicks; the window lets them through, so the highlighted menu
 * item or button still works. With no target the whole screen dims.
 */
export function Spotlight({
  target,
  visible,
  pad = 8,
  radius = 12,
  reduced,
  onBlockedClick,
}: {
  target: Element | null;
  visible: boolean;
  pad?: number;
  radius?: number;
  reduced: boolean;
  /** A click on the dimmed part (Hoot gives a little shrug toward his card). */
  onBlockedClick?: () => void;
}) {
  const scrim = useRef<SVGPathElement>(null);
  const lift = useRef<SVGPathElement>(null);
  const ring = useRef<SVGPathElement>(null);
  const live = useRef({ target, pad, radius, reduced });
  useEffect(() => {
    live.current = { target, pad, radius, reduced };
  });

  useEffect(() => {
    let frame = 0;
    let shown: Box | null = null;
    let from: Box | null = null;
    let fromAt = 0;
    let lastTarget: Element | null = null;

    const tick = (now: number) => {
      const { target: el, pad: p, radius: r, reduced: still } = live.current;
      const view = { width: window.innerWidth, height: window.innerHeight };
      const want = el && el.isConnected ? padded(rectOf(el), p, view) : null;
      if (el !== lastTarget) {
        lastTarget = el;
        from = shown ?? (want ? dot(want) : null);
        fromAt = now;
      }
      const t = still ? 1 : Math.min(1, (now - fromAt) / MOVE_MS);
      if (want) shown = from && t < 1 ? mix(from, want, ease(t)) : want;
      else if (shown && from && t < 1) shown = mix(from, dot(from), ease(t));
      else shown = null;

      const outer = `M0,0H${view.width}V${view.height}H0Z`;
      const hole = shown && shown.width > 0.5 && shown.height > 0.5 ? holePath(shown, r) : "";
      scrim.current?.setAttribute("d", hole ? `${outer}${hole}` : outer);
      lift.current?.setAttribute("d", hole);
      ring.current?.setAttribute("d", hole);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg
      aria-hidden
      className="tour-fade-in pointer-events-none fixed inset-0 z-[900] h-full w-full transition-opacity duration-300 ease-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <path
        ref={scrim}
        fillRule="evenodd"
        className={visible ? "pointer-events-auto" : undefined}
        style={{ fill: "var(--tour-scrim)" }}
        onClick={onBlockedClick}
      />
      {/* The window reads a touch lighter than the page around it, which matters most in dark mode. */}
      <path ref={lift} style={{ fill: "var(--tour-lift)" }} />
      <path ref={ring} fill="none" strokeWidth={2} style={{ stroke: "var(--tour-ring)", filter: "drop-shadow(0 0 10px var(--tour-glow))" }} />
    </svg>
  );
}

export function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
