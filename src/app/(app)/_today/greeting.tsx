"use client";

import { useEffect, useState } from "react";
import { HootFace } from "@/components/app/chat/thread-parts";
import { marketLine } from "@/lib/today";

/** "Tue, Sep 29. Market open, closes in 2h 48m. Prices delayed 15 min", kept current while the page stays open. */
function MarketClock({ initial }: { initial: string }) {
  const [line, setLine] = useState(initial);
  useEffect(() => {
    const id = window.setInterval(() => setLine(marketLine()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return <>{line}</>;
}

/** Home has no page header: a thin right-aligned line gives the date, what the market is doing and how fresh prices are. */
export function HomeTopLine({ line }: { line: string }) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-end px-5 text-body text-muted-foreground" data-tour="today-greeting">
      <span suppressHydrationWarning>
        <MarketClock initial={line} />
      </span>
    </div>
  );
}

/**
 * Hoot's face, "Good afternoon, Rikhil." in serif and, for readers who see a book, one sentence under it on how the
 * book is doing (`lead`, which streams in with the numbers). What needs the reader is the bell's, not Home's.
 */
export function HomeGreeting({ hello, name, lead }: { hello: string; name: string; lead?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <HootFace className="size-14" />
      <h1 className="mt-[18px] text-center font-serif text-hero font-normal tracking-[-0.01em]">
        Good {hello.toLowerCase()}, {name}.
      </h1>
      {lead && <p className="mt-2.5 min-h-6 text-center text-emph text-pretty text-ink-2">{lead}</p>}
    </div>
  );
}
