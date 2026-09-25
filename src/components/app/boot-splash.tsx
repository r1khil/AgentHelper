"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Long enough for one full wave, so a quick load doesn't just flash Hoot. Counted from navigation start. */
const MIN_MS = 900;
/** Never hold the page back past this, even if an image or a stream stalls. */
const MAX_MS = 10_000;
const FILL_MS = 250;
const FADE_MS = 450;

/**
 * Full-page loading screen on a fresh load or refresh: Hoot waving over a progress bar, fading out once the
 * browser has the whole page (streamed sections, scripts, images). It lives in the root layout, which stays
 * mounted through client navigation, so moving between pages never shows it again.
 *
 * Everything before hydration is CSS: the wave loop and the bar's trickle run from the server HTML, so the
 * screen is alive while the JavaScript is still downloading. After that this component runs the bar home.
 */
export function BootSplash() {
  const [phase, setPhase] = useState<"loading" | "fading" | "gone">("loading");
  const fill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: number[] = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.push(
        window.setTimeout(
          () => {
            // Carry the bar on from wherever the trickle got to, then fade the screen.
            const bar = fill.current;
            if (bar) {
              const from = getComputedStyle(bar).transform;
              for (const a of bar.getAnimations()) a.cancel();
              bar.animate([{ transform: from === "none" ? "scaleX(0)" : from }, { transform: "scaleX(1)" }], {
                duration: FILL_MS,
                easing: "ease-out",
                fill: "forwards",
              });
            }
            timers.push(window.setTimeout(() => setPhase("fading"), FILL_MS));
            timers.push(window.setTimeout(() => setPhase("gone"), FILL_MS + FADE_MS));
          },
          Math.max(0, MIN_MS - performance.now()),
        ),
      );
    };
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
    timers.push(window.setTimeout(finish, Math.max(0, MAX_MS - performance.now())));
    return () => {
      window.removeEventListener("load", finish);
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div
      role="status"
      aria-label="Loading The Owl's Nest"
      className={cn(
        "fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-7 bg-background transition-opacity ease-out",
        phase === "fading" && "pointer-events-none opacity-0",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* One frame of the strip at a time. The frames leave room on the right for his wing, so nudge him over to
          put his body, not the frame, in the middle. */}
      <div className="relative size-40 translate-x-[13%] overflow-hidden" aria-hidden>
        {/* Plain <img>: it has to be in the first bytes of the page, with no optimizer round-trip. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hoot/wave-loop.webp"
          alt=""
          width={1920}
          height={160}
          fetchPriority="high"
          draggable={false}
          className="hoot-wave-loop absolute top-0 left-0 h-full w-[1200%] max-w-none select-none"
        />
      </div>
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Loading">
        <div ref={fill} className="boot-trickle h-full w-full rounded-full bg-primary" />
      </div>
    </div>
  );
}
