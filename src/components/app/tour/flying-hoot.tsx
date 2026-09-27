"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { HootMood } from "@/lib/hoot/types";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";

/** Drawn at this size and scaled down when perched, so he stays crisp in the middle of the screen. */
export const TOUR_HOOT_BASE = 112;

export type HootSpot = { x: number; y: number; size: number };
export type FlyingHootHandle = { hop: () => void; shrug: () => void };

const HOPLET: Keyframe[] = [{ transform: "translateY(0)" }, { transform: "translateY(-7px)", offset: 0.4 }, { transform: "translateY(0)", offset: 0.7 }, { transform: "translateY(-2px)", offset: 0.85 }, { transform: "translateY(0)" }];
const SHRUG: Keyframe[] = [{ transform: "rotate(0)" }, { transform: "rotate(-7deg)", offset: 0.25 }, { transform: "rotate(6deg)", offset: 0.6 }, { transform: "rotate(0)" }];

const place = (s: HootSpot) => `translate(${s.x}px, ${s.y}px) scale(${s.size / TOUR_HOOT_BASE})`;

/**
 * The tour's Hoot. He flies between spots on a gentle arc, leaning into the turn, and lands with a little hop.
 * A new spot mid-flight takes off from wherever he is. With reduced motion he simply appears at each spot.
 */
export const FlyingHoot = forwardRef<FlyingHootHandle, {
  from: HootSpot;
  to: HootSpot;
  mood: HootMood;
  gaze?: { x: number; y: number };
  reduced: boolean;
  visible: boolean;
  onLanded: () => void;
}>(function FlyingHoot({ from, to, mood, gaze, reduced, visible, onLanded }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const at = useRef<HootSpot>(from);
  const landed = useRef(onLanded);
  useEffect(() => {
    landed.current = onLanded;
  });

  useImperativeHandle(ref, () => ({
    hop: () => {
      if (!reduced) body.current?.animate(HOPLET, { duration: 520, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" });
    },
    shrug: () => {
      if (!reduced) body.current?.animate(SHRUG, { duration: 700, easing: "ease-in-out" });
    },
  }), [reduced]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // Take off from wherever he is right now, even mid-flight.
    const r = el.getBoundingClientRect();
    const start: HootSpot = el.getAnimations().length ? { x: r.left, y: r.top, size: r.width } : at.current;
    for (const a of el.getAnimations()) a.cancel();
    const end = to;
    at.current = end;
    el.style.transform = place(end);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (reduced || (dist < 3 && Math.abs(end.size - start.size) < 1)) {
      landed.current();
      return;
    }
    // A quadratic arc that lifts above both ends; longer trips lift higher and take longer.
    const lift = Math.min(150, 30 + dist * 0.22);
    const cx = (start.x + end.x) / 2;
    const cy = Math.min(start.y, end.y) - lift;
    const frames: Keyframe[] = [];
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (1 - t) ** 2 * start.x + 2 * (1 - t) * t * cx + t ** 2 * end.x;
      const y = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * cy + t ** 2 * end.y;
      const size = start.size + (end.size - start.size) * t;
      const lean = dist ? (dx / dist) * 9 * Math.sin(Math.PI * t) : 0;
      frames.push({ transform: `${place({ x, y, size })} rotate(${lean.toFixed(2)}deg)` });
    }
    const flight = el.animate(frames, { duration: Math.min(1250, 520 + dist * 0.55), easing: "cubic-bezier(0.45, 0, 0.25, 1)" });
    flight.onfinish = () => landed.current();
  }, [to, reduced]);

  return (
    <div
      ref={wrap}
      data-tour-hoot
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[920] origin-top-left transition-opacity duration-200"
      style={{ transform: place(from), opacity: visible ? 1 : 0, width: TOUR_HOOT_BASE, height: TOUR_HOOT_BASE }}
    >
      <span className="absolute inset-2 rounded-full blur-xl" style={{ background: "var(--tour-halo)" }} />
      {/* Soft floor shadow so he reads as perched, not pasted on. */}
      <span className="absolute inset-x-6 bottom-1 h-3 rounded-[50%] bg-black/25 blur-[4px]" />
      <div ref={body} className="relative">
        <HootSprite mood={mood} size={TOUR_HOOT_BASE} gaze={gaze} bob />
      </div>
    </div>
  );
});
