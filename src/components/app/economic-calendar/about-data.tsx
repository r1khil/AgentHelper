"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarFeed } from "@/lib/economic-calendar/types";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LoadError } from "./use-feed";

/**
 * The economic feed's state in one line under the coverage note: live or synthetic, when it last updated, a refresh,
 * and "About this data" (sources and how the figures are read) behind a click.
 */
export function FeedStatus({ feed, error, loading, onRetry }: { feed: CalendarFeed | null; error: LoadError | null; loading: boolean; onRetry: () => void }) {
  const pathname = usePathname();
  if (error?.expired)
    return (
      <p role="alert" className="text-body leading-5 text-caution-foreground">
        {error.message}{" "}
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="font-medium underline underline-offset-2">
          Sign in again
        </Link>
      </p>
    );
  if (!feed)
    return error ? (
      <p role="alert" className="text-body leading-5 text-caution-foreground">
        Economic releases unavailable. {error.message}{" "}
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
          Try again
        </button>
      </p>
    ) : (
      <p className="text-body text-muted-foreground">Loading economic releases…</p>
    );
  const at = fmtTime(feed.fetchedAt);
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body leading-5 text-muted-foreground">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", error || feed.mode === "demo" || feed.stale ? "bg-caution-foreground" : "bg-up")} />
      {error ? (
        <span className="text-caution-foreground" title={error.message}>
          Couldn&apos;t refresh · showing {at} data
        </span>
      ) : (
        <span>
          {feed.mode === "demo" ? "Synthetic preview" : "Live"} · <span className="font-mono">{at}</span>
        </span>
      )}
      <button type="button" aria-label={error ? "Try again" : "Refresh now"} title={error ? "Try again" : "Refresh now"} disabled={loading} onClick={onRetry} className="grid size-5 place-items-center rounded-full hover:bg-muted hover:text-foreground disabled:opacity-50">
        <RefreshCw className={cn("size-3", loading && "animate-spin")} />
      </button>
      <span aria-hidden="true">·</span>
      <AboutData feed={feed} />
    </div>
  );
}

function AboutData({ feed }: { feed: CalendarFeed }) {
  const sources = feed.sources ?? [];
  const credits = sources.length ? sources.map((s) => s.name) : [feed.provider];
  return (
    <Popover>
      <PopoverTrigger id="about-data" className="underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-foreground">
        About this data
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[440px] gap-3 rounded-[14px] bg-card p-4 text-body shadow-lg ring-1 ring-border">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body font-semibold">About this data</span>
          <span className="text-muted-foreground">{feed.provider}</span>
        </div>
        {sources.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-ink-2">
              Sources · {sources.filter((s) => s.status === "ok").length} of {sources.length} connected
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s) => {
                const ok = s.status === "ok";
                return (
                  <a
                    key={s.name}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    title={ok ? `${s.count} records in this range` : `Unavailable: ${s.error ?? "no response"}`}
                    className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption", ok ? "bg-muted text-ink-2 hover:text-foreground" : "bg-caution text-caution-foreground")}
                  >
                    <span aria-hidden="true" className={cn("size-1.5 rounded-full", ok ? "bg-up" : "bg-caution-foreground")} />
                    {s.name}
                    <span className="font-mono">{ok ? s.count : "unavailable"}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}
        <ul className="grid list-disc gap-1.5 pl-4 leading-[18px] text-ink-2">
          <li>All times are Eastern. Click a release to see all of its details.</li>
          <li>Above and below show direction against consensus, not whether a print is good or bad.</li>
          <li>Consensus is the economist survey from the feed in use, filled from FXStreet where the feed has none. Model forecasts are never substituted. A release&apos;s details name its consensus source.</li>
          <li>Kalshi figures are prediction-market prices before a release (the median outcome, or the likeliest for Fed decisions). They are not consensus and never drive the colors.</li>
          <li>Previous includes provider revisions (marked *). A past time alone does not confirm a release.</li>
          <li>Checked every minute; provider caching applies.</li>
          <li>Data: {credits.join(", ")}, and the linked U.S. agencies.</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
