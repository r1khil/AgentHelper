"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { flushUsage, track } from "@/lib/usage/client";

type View = { pathname: string; visibleMs: number; since: number | null; vitals: Record<string, number> };

/**
 * Records usage for a signed-in member (see src/lib/usage/events.ts): one page_view per page seen, sent when they
 * leave it with the time it was actually in view and any load metrics measured meanwhile; clicks on elements marked
 * data-track; and uncaught errors. Renders nothing.
 */
export function UsageTracker() {
  const pathname = usePathname();
  const view = useRef<View | null>(null);

  useReportWebVitals((metric) => {
    if (!view.current || !["LCP", "INP", "CLS", "FCP", "TTFB"].includes(metric.name)) return;
    view.current.vitals[metric.name] = metric.name === "CLS" ? Math.round(metric.value * 1000) / 1000 : Math.round(metric.value);
  });

  // A new page closes the previous one's view.
  useEffect(() => {
    const visible = document.visibilityState === "visible";
    view.current = { pathname, visibleMs: 0, since: visible ? Date.now() : null, vitals: {} };
    return () => endView(view.current);
  }, [pathname]);

  useEffect(() => {
    const onVisibility = () => {
      const v = view.current;
      if (!v) return;
      if (document.visibilityState === "hidden") {
        if (v.since !== null) v.visibleMs += Date.now() - v.since;
        v.since = null;
        flushUsage(true);
      } else v.since = Date.now();
    };
    // The tab closing or reloading: send the open view now, since no effect cleanup runs.
    const onPageHide = () => {
      endView(view.current);
      view.current = null;
      flushUsage(true);
    };
    // Back to a page kept in the back/forward cache: it's a new view.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) view.current = { pathname: location.pathname, visibleMs: 0, since: Date.now(), vitals: {} };
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]");
      const label = el?.getAttribute("data-track");
      if (label) track("click", { label: label.slice(0, 80) });
    };
    let errors = 0;
    const onError = (message: string, source?: string) => {
      // A render loop can throw hundreds of times; a few per page load says enough.
      if (++errors > 5) return;
      track("client_error", { message: message.slice(0, 300), ...(source ? { source: source.slice(0, 200) } : {}) });
    };
    const onWindowError = (e: ErrorEvent) => onError(e.message || "Error", e.filename ? `${e.filename}:${e.lineno}` : undefined);
    const onRejection = (e: PromiseRejectionEvent) => onError(e.reason instanceof Error ? e.reason.message : String(e.reason), "unhandledrejection");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

function endView(v: View | null) {
  if (!v) return;
  const ms = v.visibleMs + (v.since !== null ? Date.now() - v.since : 0);
  v.since = null;
  v.visibleMs = 0;
  track("page_view", { ms, ...(Object.keys(v.vitals).length ? { vitals: v.vitals } : {}) }, v.pathname);
}
