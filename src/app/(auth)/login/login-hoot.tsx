"use client";

import { useSyncExternalStore } from "react";
import { HootHero } from "@/components/app/hoot/hoot-hero";

const WIDE = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Hoot on the sign-in pane. The 3D canvas takes a fixed pixel size (a CSS transform would throw off its own
 * measuring), so pick the size from the window: large in the side pane, smaller in the band a narrow window gets.
 */
export function LoginHoot() {
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => true);
  const size = wide ? 260 : 140;
  return <HootHero key={size} size={size} className="hoot-halo" />;
}
