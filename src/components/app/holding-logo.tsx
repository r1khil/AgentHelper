"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Public ticker logos (PNG, square-ish, on transparent or white). Tickers the service doesn't know fall back to a letter tile. */
const logoUrl = (ticker: string) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker.toUpperCase().replace(/\./g, "-"))}.png`;

/**
 * A holding's company logo wherever a holding is a row or a header: on a white tile so dark marks read on the dark
 * theme, with the ticker's first letter while it loads or when there's no logo. `size` is the tile in px.
 */
export function HoldingLogo({ ticker, size = 20, className }: { ticker: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const radius = size >= 32 ? 10 : size >= 24 ? 6 : 5;
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={cn("grid shrink-0 place-items-center bg-secondary font-semibold text-ink-2", size >= 32 ? "text-emph" : "text-caption", className)}
        style={{ width: size, height: size, borderRadius: radius }}
      >
        {ticker.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center overflow-hidden bg-white", className)} style={{ width: size, height: size, borderRadius: radius }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a remote logo, sized by its tile; next/image would need the host allowlisted for no gain */}
      <img src={logoUrl(ticker)} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-[78%] object-contain" />
    </span>
  );
}
