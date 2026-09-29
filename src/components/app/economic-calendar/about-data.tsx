"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarFeed } from "@/lib/economic-calendar/types";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LoadError } from "./use-feed";

/**
 * What is wrong with the feed, in words, or nothing: the session expired, the releases couldn't load, the last copy is
 * shown after a failed refresh, or the feed is synthetic. Amber, with the way to try again.
 */
export function FeedNotice({ feed, error, onRetry }: { feed: CalendarFeed | null; error: LoadError | null; onRetry: () => void }) {
  const pathname = usePathname();
  if (error?.expired)
    return (
      <p role="alert" className="text-body text-caution-foreground">
        {error.message}{" "}
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="font-semibold underline underline-offset-2">
          Sign in again
        </Link>
      </p>
    );
  if (!feed && error)
    return (
      <p role="alert" className="text-body text-caution-foreground">
        Economic releases unavailable. {error.message}{" "}
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          Try again
        </button>
      </p>
    );
  if (feed && error)
    return (
      <p role="alert" className="text-body text-caution-foreground" title={error.message}>
        Couldn&apos;t refresh, so this shows the {fmtTime(feed.fetchedAt)} copy.{" "}
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          Try again
        </button>
      </p>
    );
  if (feed && (feed.mode === "demo" || feed.stale))
    return (
      <p className="text-body text-caution-foreground">
        {feed.mode === "demo" ? "Synthetic preview data: dates and values illustrate the interface, not the real schedule." : `Every source failed, so this is the copy from ${fmtTime(feed.fetchedAt)}.`}
      </p>
    );
  return null;
}

/** "About this data": where each source stands and how the figures are read, behind a click. */
export function AboutData({ feed }: { feed: CalendarFeed }) {
  const sources = feed.sources ?? [];
  const credits = sources.length ? sources.map((s) => s.name) : [feed.provider];
  return (
    <Popover>
      <PopoverTrigger id="about-data" className="rounded-sm font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Sources and how figures are read
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[440px] gap-3 bg-popover p-4 text-body shadow-lg ring-1 ring-border">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body font-semibold">About this data</span>
          <span className="text-muted-foreground">{feed.provider}</span>
        </div>
        {sources.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-ink-2">
              Sources · {sources.filter((s) => s.status === "ok").length} of {sources.length} connected
            </p>
            <ul className="flex flex-col">
              {sources.map((s) => {
                const ok = s.status === "ok";
                return (
                  <li key={s.name} className="flex items-baseline justify-between gap-3 border-b border-row py-1 last:border-b-0">
                    <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {s.name}
                    </a>
                    <span className={cn("text-caption", ok ? "text-muted-foreground" : "font-semibold text-caution-foreground")} title={ok ? `${s.count} records in this range` : `Unavailable: ${s.error ?? "no response"}`}>
                      {ok ? `${s.count} records` : "unavailable"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <ul className="grid list-disc gap-1.5 pl-4 text-ink-2">
          <li>All times are Eastern. Click a release to see all of its details.</li>
          <li>Above and below show direction against consensus, not whether a print is good or bad.</li>
          <li>Consensus is the economist survey from the feed in use, filled from FXStreet where the feed has none. Model forecasts are never substituted. A release&apos;s details name its consensus source.</li>
          <li>Kalshi figures are prediction-market prices before a release (the median outcome, or the likeliest for Fed decisions). They are not consensus and never drive the wording of a result.</li>
          <li>Previous includes provider revisions (marked *). A past time alone does not confirm a release.</li>
          <li>Checked every minute; provider caching applies.</li>
          <li>Data: {credits.join(", ")}, and the linked U.S. agencies.</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
