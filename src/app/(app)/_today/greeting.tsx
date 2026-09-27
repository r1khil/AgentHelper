"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import { HootOnPage } from "@/components/app/hoot/presence";
import { marketLine } from "@/lib/today";
import { ListSentence } from "./hoot-list";

/** "MON 28 SEP · MARKET OPENS IN 1H 12M", kept current while the page stays open. */
function MarketClock({ initial }: { initial: string }) {
  const [line, setLine] = useState(initial);
  useEffect(() => {
    const id = window.setInterval(() => setLine(marketLine()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return <>{line}</>;
}

/**
 * The greeting row: waving Hoot (a link to ask him something), the date and market clock, "Morning, Rikhil." and
 * one sentence in Hoot's voice. `lead` is the session half of that sentence; it streams in with the attribution.
 */
export function Greeting({ hello, name, dateLine, lead, askHref }: { hello: string; name: string; dateLine: string; lead?: React.ReactNode; askHref: string }) {
  return (
    <header className="flex h-[84px] shrink-0 items-center gap-4">
      <HootOnPage />
      <Link href={askHref} aria-label="Ask Hoot" title="Ask Hoot" className="shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <HootSprite mood="wave" size={84} track />
      </Link>
      <div className="min-w-0">
        <div className="truncate font-mono text-xs text-muted-foreground">
          <MarketClock initial={dateLine} />
        </div>
        <h1 className="mt-0.5 text-[28px] leading-tight font-semibold tracking-[-0.025em]">
          {hello}, {name}.
        </h1>
        <p className="mt-0.5 truncate text-[15px] text-ink-2">
          {lead}
          <ListSentence />
        </p>
      </div>
    </header>
  );
}
