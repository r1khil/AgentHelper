"use client";

import { useEffect, useState } from "react";
import { HootFace } from "@/components/app/chat/thread-parts";
import { marketLine } from "@/lib/today";
import { NeedsSentence } from "./hoot-list";

/** "Mon, Sep 28 · market closes in 1h 19m", kept current while the page stays open. */
function MarketClock({ initial }: { initial: string }) {
  const [line, setLine] = useState(initial);
  useEffect(() => {
    const id = window.setInterval(() => setLine(marketLine()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  // The clock leads with a capital ("Market closes"); the line reads as one lowercase run after the date.
  return <>{line.replace(" · Market", " · market")}</>;
}

/** Home has no page header: a thin right-aligned line carries the date, the market clock and how fresh prices are. */
export function HomeTopLine({ dateLine }: { dateLine: string }) {
  return (
    <div className="flex h-[52px] shrink-0 items-center justify-end px-10 text-caption text-muted-foreground" data-tour="today-greeting">
      <span suppressHydrationWarning>
        <MarketClock initial={dateLine} /> · prices delayed 15 min
      </span>
    </div>
  );
}

/**
 * Hoot's face, "Good afternoon, Rikhil." in serif and one sentence under it: how the book is doing (`lead`, which
 * streams in with the numbers) and what needs the reader. An analyst's sentence leads with the write-ups they owe.
 */
export function HomeGreeting({ hello, name, lead, analyst }: { hello: string; name: string; lead?: React.ReactNode; analyst: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <HootFace className="size-[52px]" />
      <h1 className="mt-3.5 text-center font-serif text-hero font-normal tracking-[-0.02em]">
        Good {hello.toLowerCase()}, {name}.
      </h1>
      <p className="mt-2.5 text-center text-emph text-pretty text-ink-2">
        {lead}
        <NeedsSentence analyst={analyst} />
      </p>
    </div>
  );
}
