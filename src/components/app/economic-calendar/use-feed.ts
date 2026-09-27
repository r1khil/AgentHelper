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
