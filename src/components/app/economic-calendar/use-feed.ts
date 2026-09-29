"use client";

import { useEffect, useState } from "react";
import type { CalendarFeed, CalendarRange } from "@/lib/economic-calendar/types";

export type LoadError = { message: string; expired: boolean };

export type FeedSource = {
  /** The synthetic development fixtures from /api/dev/economic-calendar. */
  preview?: boolean;
  /** The live feed through the development endpoint (local verification without app sign-in). */
  livePreview?: boolean;
  /** Fixed feeds, no network: a feed is used when its range matches exactly. */
  fixed?: CalendarFeed[];
};

/**
 * One range of the economic calendar, polled every minute while the tab is visible. Only the first load and an
 * explicit retry show the loading state; silent polls keep the last good copy on screen and report the error beside it.
 */
export function useEconomicFeed(range: CalendarRange | null, source: FeedSource) {
  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const { preview = false, livePreview = false, fixed } = source;
  const from = range?.from ?? null;
  const to = range?.to ?? null;

  useEffect(() => {
    if (!from || !to) return;
    if (fixed) {
      const hit = fixed.find((f) => f.from === from && f.to === to) ?? null;
      queueMicrotask(() => {
        setFeed(hit);
        setError(hit ? null : { message: "No fixture for this range.", expired: false });
        setLoading(false);
      });
      return;
    }
    const controller = new AbortController();
    let busy = false;
    async function load(visible = false) {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      if (visible) setLoading(true);
      try {
        const endpoint = preview || livePreview ? "/api/dev/economic-calendar" : "/api/economic-calendar";
        const params = new URLSearchParams({ from: from!, to: to!, ...(livePreview ? { live: "1" } : {}) });
        const res = await fetch(`${endpoint}?${params}`, { signal: controller.signal, cache: "no-store" });
        if (res.redirected || res.status === 401) {
          if (!controller.signal.aborted) setError({ message: "Your session expired, so the calendar stopped updating.", expired: true });
          return;
        }
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Unable to load the calendar.");
        if (!controller.signal.aborted) {
          setFeed(body);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError({ message: e instanceof Error ? e.message : "Unable to load the calendar.", expired: false });
      } finally {
        busy = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load(true);
    const timer = window.setInterval(() => void load(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [from, to, refresh, preview, livePreview, fixed]);

  // Never show another range's data under the selected dates.
  const current = feed && feed.from === from && feed.to === to ? feed : null;
  return { feed: current, error, loading: loading || (!!from && !current && !error), retry: () => setRefresh((n) => n + 1) };
}

/** The clock the countdowns and the "now" line read, ticking every 30 seconds; null until mounted. */
export function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The feed serves at most 31 days a call; a longer range is asked for in two parts. */
const MAX_DAYS = 31;

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** One feed from two adjoining ones: their releases together, the older fetch time, and the weaker coverage. */
function mergeFeeds(a: CalendarFeed, b: CalendarFeed): CalendarFeed {
  const seen = new Set(a.events.map((e) => e.id));
  const sources = new Map((a.sources ?? []).map((s) => [s.name, { ...s }]));
  for (const s of b.sources ?? []) {
    const had = sources.get(s.name);
    sources.set(s.name, had ? { ...had, count: had.count + s.count, status: had.status === "ok" && s.status === "ok" ? "ok" : "unavailable", error: had.error ?? s.error } : { ...s });
  }
  return {
    ...a,
    to: b.to,
    events: [...a.events, ...b.events.filter((e) => !seen.has(e.id))],
    sources: a.sources || b.sources ? [...sources.values()] : undefined,
    coverage: a.coverage?.status === "partial" ? a.coverage : (b.coverage ?? a.coverage),
    mode: a.mode === "demo" || b.mode === "demo" ? "demo" : "live",
    fetchedAt: a.fetchedAt < b.fetchedAt ? a.fetchedAt : b.fetchedAt,
    stale: a.stale || b.stale,
  };
}

/**
 * useEconomicFeed for a range of any length up to 62 days (Markets' five weeks): split at 31 days, both parts polled,
 * and one feed once both have loaded.
 */
export function useEconomicFeedSpan(range: CalendarRange | null, source: FeedSource) {
  const splitAt = range ? addDays(range.from, MAX_DAYS - 1) : null;
  const first = range && splitAt ? { from: range.from, to: splitAt < range.to ? splitAt : range.to } : null;
  const second = range && splitAt && splitAt < range.to ? { from: addDays(splitAt, 1), to: range.to } : null;
  const a = useEconomicFeed(first, source);
  const b = useEconomicFeed(second, source);
  if (!second) return a;
  const feed = a.feed && b.feed ? mergeFeeds(a.feed, b.feed) : null;
  return {
    feed,
    error: a.error ?? b.error,
    loading: a.loading || b.loading,
    retry: () => {
      a.retry();
      b.retry();
    },
  };
}
