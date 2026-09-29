"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Public ticker logos (PNG, square-ish, on transparent or white). Tickers the service doesn't know fall back to a letter tile. */
const logoUrl = (ticker: string) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker.toUpperCase().replace(/\./g, "-"))}.png`;

/**
 * A holding's company logo wherever a holding is a row or a header: on a white tile so dark marks read on the dark
 * theme. The ticker's first letter shows until the logo arrives, and stays when there's no logo, so a tile is never
 * an empty white square. `size` is the tile in px.
 */
export function HoldingLogo({ ticker, size = 20, className }: { ticker: string; size?: number; className?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const radius = size >= 32 ? 10 : size >= 24 ? 6 : 5;
  const loaded = state === "loaded";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden font-semibold",
        loaded ? "bg-white ring-1 ring-border ring-inset dark:ring-0" : "bg-secondary text-ink-2",
        size >= 32 ? "text-emph" : "text-caption",
        className,
      )}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {!loaded && ticker.slice(0, 1).toUpperCase()}
      {state !== "failed" && (
        // eslint-disable-next-line @next/next/no-img-element -- a remote logo, sized by its tile; next/image would need the host allowlisted for no gain
        <img
          src={logoUrl(ticker)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={cn("absolute inset-[11%] size-[78%] object-contain", !loaded && "opacity-0")}
        />
      )}
    </span>
  );
}
