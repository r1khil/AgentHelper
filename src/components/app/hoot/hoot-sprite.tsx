"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import type { HootMood } from "@/lib/hoot/types";
import { gazeFor, watchAttention } from "./attention";
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
 * Hoot, pre-rendered from Blender in layers: the pose, and his pupils on top so they can follow what you do
 * (typing, clicking, scrolling, the pointer; see attention.ts). Blinks every few seconds, closes his eyes while
 * a password is typed. With reduced motion he holds still and looks straight ahead.
 */
export function HootSprite({
  mood,
  size,
  track = false,
  gaze,
  bob = false,
  lean = false,
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
  /** Lean a little toward whatever he's watching. */
  lean?: boolean;
  className?: string;
  /** Accessible name; decorative (hidden from screen readers) when omitted. */
  label?: string;
}) {
  const pose = POSES[mood] ?? POSES.idle;
  const reduced = usePrefersReducedMotion();
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState<Gaze>({ x: 0, y: 0 });
  const [secret, setSecret] = useState(false);
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

  // Watch what the member is doing. Updates arrive from outside React, a few times a second at most.
  useEffect(() => {
    if (!following) return;
    return watchAttention((a) => {
      setLook(gazeFor(a, root.current?.getBoundingClientRect() ?? null));
      setSecret(a.secret);
    });
  }, [following]);

  const g = fixed && !reduced ? fixed : following ? look : { x: 0, y: 0 };
  const travel = pose.eyes ? Math.min(pose.eyes.L.travel, pose.eyes.R.travel) * size : 0;
  const shut = blink || (following && secret);
  const base = pose.closed ? mood : shut ? `${mood}-blink` : mood;
  const tilt = lean && following ? g.x * 4 : 0;

  return (
    <div
      ref={root}
      // In dark mode a soft light sits behind him (--hoot-halo); on a light page it's nothing.
      className={cn("hoot-halo relative shrink-0 select-none", lean && "transition-transform duration-500 ease-out", className)}
      style={{ width: size, height: size, transform: tilt ? `rotate(${tilt.toFixed(2)}deg)` : undefined, transformOrigin: "50% 90%" }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className={cn("absolute inset-0", bob && !reduced && "hoot-bob")}>
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
            style={{ transform: `translate(${(g.x * travel).toFixed(2)}px, ${(g.y * travel).toFixed(2)}px)`, opacity: shut ? 0 : 1 }}
          />
        )}
      </div>
    </div>
  );
}
