"use client";

import { usageRoute, type UsageEventInput, type UsageEventName } from "./events";

/**
 * The browser side of usage tracking: events queue here and go to /api/usage every few seconds, or with sendBeacon as
 * the tab is hidden or closed. Nothing here throws or blocks the page.
 */
const FLUSH_MS = 10_000;
const FLUSH_AT = 20;

let queue: UsageEventInput[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sessionId: string | null = null;

function session(): string {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem("owl-usage-session");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem("owl-usage-session", sessionId);
    }
  } catch {
    sessionId ??= Math.random().toString(36).slice(2);
  }
  return sessionId;
}

/** Records one event about the page in view. Props: ids, counts and labels only, never text a member typed. */
export function track(name: UsageEventName, props?: Record<string, unknown>, pathname = typeof location === "undefined" ? "/" : location.pathname) {
  if (typeof window === "undefined") return;
  const { route, team } = usageRoute(pathname);
  queue.push({ name, at: new Date().toISOString(), route, team, props });
  if (queue.length >= FLUSH_AT) flushUsage();
  else timer ??= setTimeout(() => flushUsage(), FLUSH_MS);
}

/** Sends what's queued. `beacon` for a tab going away, where a fetch may be cut off. */
export function flushUsage(beacon = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const body = JSON.stringify({ sessionId: session(), events: queue });
  queue = [];
  try {
    if (beacon && navigator.sendBeacon?.("/api/usage", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/usage", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {
    // Usage is best effort.
  }
}
