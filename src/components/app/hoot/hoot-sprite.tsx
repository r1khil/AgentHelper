"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import type { HootMood } from "@/lib/hoot/types";
import eyes from "./eyes.json";

type Gaze = { x: number; y: number };
type PoseMeta = { closed: boolean; eyes?: Record<"L" | "R", { x: number; y: number; travel: number }> };

const POSES = eyes.poses as Record<HootMood, PoseMeta>;
/** Where each mood looks when it isn't following the pointer. */
const FIXED_GAZE: Partial<Record<HootMood, Gaze>> = { thinking: { x: 0.75, y: -0.75 } };

export const hootSrc = (file: string) => `/hoot/${file}.webp`;

const REDUCED = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (on) => {
      const q = window.matchMedia(REDUCED);
      q.addEventListener("change", on);
      return () => q.removeEventListener("change", on);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** Warm the browser cache so a mood change or blink never flashes an empty frame. */
export function preloadHoot(moods: HootMood[]) {
  for (const m of moods) {
    const files = POSES[m]?.closed ? [m] : [m, `${m}-blink`, `${m}-pupils`];
    for (const f of files) {
      const img = new Image();
      img.src = hootSrc(f);
    }
  }
}

/**
 * Hoot, pre-rendered from Blender in layers: the pose, and his pupils on top so they can follow the pointer.
 * Blinks every few seconds. With reduced motion he holds still and looks straight ahead.
 */
export function HootSprite({
  mood,
  size,
  track = false,
  gaze,
  bob = false,
  className,
  label,
}: {
  mood: HootMood;
  /** Rendered width and height in CSS pixels. */
  size: number;
  /** Follow the pointer with his eyes. */
  track?: boolean;
  /** Look this way instead (-1..1 each axis). */
  gaze?: Gaze;
  /** Gentle breathing loop. */
  bob?: boolean;
  className?: string;
  /** Accessible name; decorative (hidden from screen readers) when omitted. */
  label?: string;
}) {
  const pose = POSES[mood] ?? POSES.idle;
  const reduced = usePrefersReducedMotion();
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState<Gaze>({ x: 0, y: 0 });
  const root = useRef<HTMLDivElement>(null);
  const fixed = gaze ?? FIXED_GAZE[mood];
  const following = track && !fixed && !reduced && !pose.closed;

  // Blink at a relaxed, irregular pace; sometimes twice.
  useEffect(() => {
    if (pose.closed || reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setBlink(true);
          timer = setTimeout(() => {
            setBlink(false);
            if (Math.random() < 0.2) {
              timer = setTimeout(() => {
                setBlink(true);
                timer = setTimeout(() => {
                  setBlink(false);
                  schedule();
                }, 110);
              }, 140);
            } else schedule();
          }, 130);
        },
        2600 + Math.random() * 4200,
      );
    };
    schedule();
    return () => {
      clearTimeout(timer);
      setBlink(false);
    };
  }, [pose.closed, reduced, mood]);

  // Follow the pointer: nearer targets need less eye movement. Drift back to centre when the pointer rests.
  useEffect(() => {
    if (!following) return;
    let frame = 0;
    let rest: ReturnType<typeof setTimeout>;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = root.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.48);
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(dist / 260, 1);
        setLook({ x: (dx / dist) * reach, y: (dy / dist) * reach });
      });
      clearTimeout(rest);
      rest = setTimeout(() => setLook({ x: 0, y: 0 }), 6000);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
      clearTimeout(rest);
    };
  }, [following]);

  const g = fixed && !reduced ? fixed : following ? look : { x: 0, y: 0 };
  const travel = pose.eyes ? Math.min(pose.eyes.L.travel, pose.eyes.R.travel) * size : 0;
  const base = pose.closed ? mood : blink ? `${mood}-blink` : mood;

  return (
    <div
      ref={root}
      className={cn("relative shrink-0 select-none", bob && !reduced && "hoot-bob", className)}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Plain <img>: tiny static WebPs that must swap instantly, so no optimizer round-trip. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={hootSrc(base)} alt="" width={size} height={size} draggable={false} className="absolute inset-0 size-full" />
      {!pose.closed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={hootSrc(`${mood}-pupils`)}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className="absolute inset-0 size-full transition-transform duration-150 ease-out"
          style={{ transform: `translate(${(g.x * travel).toFixed(2)}px, ${(g.y * travel).toFixed(2)}px)`, opacity: blink ? 0 : 1 }}
        />
      )}
    </div>
  );
}
