"use client";

import { useEffect, useRef, useState } from "react";
import type { HootMood } from "@/lib/hoot/types";
import { HootSprite, preloadHoot, usePrefersReducedMotion } from "./hoot-sprite";

/** Nothing moved, typed or scrolled for this long: he dozes off. */
const SLEEP_MS = 90_000;
/** A pat makes him happy for this long. */
const PET_MS = 1400;
/** Woken up: wide-eyed for a moment. */
const STARTLE_MS = 900;
/** A question went off but the page didn't move on (an error, say): stop thinking after this. */
const THINK_MS = 8000;

const POP: Keyframe[] = [
  { transform: "translateY(6px) scale(0.86)", opacity: 0 },
  { transform: "translateY(-2px) scale(1.03)", opacity: 1, offset: 0.6 },
  { transform: "translateY(0) scale(1)", opacity: 1 },
];
const HOP: Keyframe[] = [
  { transform: "translateY(0) scale(1, 1)" },
  { transform: "translateY(1px) scale(1.06, 0.93)", offset: 0.15 },
  { transform: "translateY(-9px) scale(0.97, 1.04)", offset: 0.45 },
  { transform: "translateY(0) scale(1.04, 0.96)", offset: 0.75 },
  { transform: "translateY(0) scale(1, 1)" },
];

/**
 * Hoot above Home's greeting, alive: he pops in, breathes, blinks, watches the pointer and reads along as you type
 * (attention.ts), leans toward what he's watching, hops happily when patted, thinks once a question is sent and
 * dozes off when the page has been left alone, waking with a start. The sprite is drawn larger than its 56px slot
 * because the render has room around the body; the slot keeps the greeting where it was. Reduced motion: still owl.
 */
export function HomeHoot() {
  const reduced = usePrefersReducedMotion();
  const [mood, setMood] = useState<HootMood>("idle");
  const hop = useRef<HTMLDivElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);

  const moodFor = (m: HootMood, ms: number) => {
    clearTimeout(reset.current);
    setMood(m);
    reset.current = setTimeout(() => setMood("idle"), ms);
  };

  useEffect(() => {
    preloadHoot(["idle", "happy", "sleepy", "alert", "thinking"]);
    if (!reduced) hop.current?.animate(POP, { duration: 520, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.2)", delay: 120, fill: "backwards" });
    return () => clearTimeout(reset.current);
  }, [reduced]);

  // Doze after a while alone; any sign of life wakes him.
  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    let asleep = false;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState !== "visible") return arm();
        asleep = true;
        clearTimeout(reset.current);
        setMood("sleepy");
      }, SLEEP_MS);
    };
    const onActivity = () => {
      if (asleep) {
        asleep = false;
        moodFor("alert", STARTLE_MS);
        hop.current?.animate(HOP, { duration: 420, easing: "ease-out" });
      }
      arm();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    arm();
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, onActivity);
    };
  }, [reduced]);

  // The ask box sent a question: he gets to work until the thread opens.
  useEffect(() => {
    const onSubmit = () => moodFor("thinking", THINK_MS);
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  const pet = () => {
    if (mood === "thinking") return;
    moodFor("happy", PET_MS);
    if (!reduced) hop.current?.animate(HOP, { duration: 560, easing: "ease-out" });
  };

  return (
    <div className="relative size-14">
      {/* Pointer-only easter egg, so no button or tab stop: the page's one action is the ask box. */}
      <div ref={hop} onClick={pet} className="absolute -inset-3.5 cursor-pointer" style={{ transformOrigin: "50% 85%" }}>
        <HootSprite mood={mood} size={84} track bob lean />
        {mood === "sleepy" && !reduced && (
          <span aria-hidden className="pointer-events-none absolute top-1 right-0 font-serif text-body text-muted-foreground italic">
            <span className="hoot-zzz absolute">z</span>
            <span className="hoot-zzz absolute left-2 -top-1.5 text-caption [animation-delay:1.4s]">z</span>
          </span>
        )}
      </div>
    </div>
  );
}
