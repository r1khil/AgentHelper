"use client";

import { useEffect } from "react";
import type { PageContext } from "@/lib/agent/page-context";

// What the current page tells Hoot about itself. One page at a time; a page clears its entry when it unmounts,
// and Hoot ignores an entry left for another path, so a stale context never follows the member around.
let current: PageContext | null = null;

/** Publish this page's context while it is mounted. Re-publishes when the value changes. */
export function usePageContext(value: PageContext | null) {
  const key = value ? JSON.stringify(value) : "";
  useEffect(() => {
    if (!key) return;
    const ctx = JSON.parse(key) as PageContext;
    current = ctx;
    return () => {
      if (current === ctx) current = null;
    };
  }, [key]);
}

/** For server-rendered pages: drop it anywhere in the tree. */
export function PageContextPublisher({ value }: { value: PageContext }) {
  usePageContext(value);
  return null;
}

/** The context for the page at `pathname`: a page's own, or just where the member is. */
export function pageContextFor(pathname: string): PageContext {
  if (current && current.path === pathname) return current;
  const title = typeof document !== "undefined" ? document.title.replace(/\s*[·|—-]\s*The Owl.*$/i, "").slice(0, 160) : "";
  return { kind: "page", path: pathname, title: title || pathname };
}

/**
 * What Hoot's corner and palette call the page: its title without the app's name ("AVGO", "Risk", "Healthcare"), or
 * "" when the page has no title of its own.
 */
export function pageLabelFor(pathname: string): string {
  const t = pageContextFor(pathname).title.split(/\s[·|—]\s/)[0]?.trim() ?? "";
  return t && t.length <= 40 && !t.startsWith("/") && !/^the owl/i.test(t) ? t : "";
}
