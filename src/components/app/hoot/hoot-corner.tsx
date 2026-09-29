"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { X } from "lucide-react";
import { dismissHootNudge } from "@/lib/actions/preferences";
import { BUBBLE_VISIBLE_MS, companionHiddenOn, pickBubble, tipFor, type BubbleSession } from "@/lib/hoot/policy";
import { hootShortcut, isMac, withCommandKey } from "@/lib/hoot/shortcuts";
import type { HootFeed, HootNudge } from "@/lib/hoot/types";
import { cn } from "@/lib/utils";
import { useTourActive } from "@/components/app/tour/tour-store";
import { pageLabelFor } from "./page-context";
import { useHootOnPage } from "./presence";

const REFRESH_MS = 5 * 60_000;
const SESSION_KEY = "hoot:session";
/** Opening these means they're handled; deadlines stay until the work is done or the member dismisses them. */
const DISMISS_ON_OPEN = new Set(["sell_side", "changelog", "weekly", "tip", "proposal"]);

const noSubscribe = () => () => {};

function readSession(): BubbleSession {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "") as BubbleSession;
  } catch {
    return { count: 0, shown: [] };
  }
}

function writeSession(s: BubbleSession) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // Private mode: notes just aren't rate-limited across reloads.
  }
}

/** Someone is typing or in a dialog: never interrupt. */
function memberIsBusy() {
  const el = document.activeElement as HTMLElement | null;
  const typing = !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
  return typing || !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}


/**
 * Hoot in the bottom-right corner of every page that isn't a conversation: his face in a 52px button. Hover says what
 * a question would be about ("Ask Hoot about AVGO ⌘J"); a click opens the ⌘J palette (`onAsk`). Now and then he
 * leaves a note beside the button, a deadline or a first-visit tip, headed "New note" in amber: a few per
 * session at most, never while the member is typing, and gone after a few seconds unless they're reading it.
 */
export function HootCorner({ onAsk, suppressed = false }: { onAsk: () => void; suppressed?: boolean }) {
  const pathname = usePathname();
  const mac = useSyncExternalStore(noSubscribe, isMac, () => true);
  const [feed, setFeed] = useState<HootFeed | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [said, setSaid] = useState<{ nudge: HootNudge; path: string } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [, startTransition] = useTransition();
  const loadedAt = useRef(0);
  const pageAt = useRef(0);
  const pageSpoke = useRef(false);
  const touring = useTourActive();
  const shownOnPage = useHootOnPage();
  const hidden = companionHiddenOn(pathname) || touring || shownOnPage || suppressed;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hoot", { cache: "no-store" });
      if (!res.ok) return;
      setFeed((await res.json()) as HootFeed);
      loadedAt.current = Date.now();
    } catch {
      // Offline or signed out: Hoot just stays quiet.
    }
  }, []);

  // First load once the page has settled, so Hoot never competes with the page for the network.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => void load());
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current > REFRESH_MS) void load();
    };
    document.addEventListener("visibilitychange", refresh);
    const tick = window.setInterval(refresh, REFRESH_MS);
    return () => {
      cancel(id);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(tick);
    };
  }, [load]);

  const nudges = useMemo(() => (feed?.nudges ?? []).filter((n) => !dismissed.has(n.id)), [feed, dismissed]);
  const seenTips = useMemo(() => [...(feed?.seenTips ?? []), ...dismissed], [feed, dismissed]);

  const persistDismiss = useCallback((id: string) => {
    setDismissed((d) => new Set(d).add(id));
    startTransition(async () => {
      await dismissHootNudge(id);
    });
  }, []);

  const note = said && said.path === pathname ? said.nudge : null;
  const setNote = useCallback((n: HootNudge | null) => setSaid(n ? { nudge: n, path: window.location.pathname } : null), []);

  useEffect(() => {
    pageAt.current = Date.now();
    pageSpoke.current = false;
  }, [pathname]);

  // New page: maybe leave one note, after the page settles and only if the member isn't busy.
  useEffect(() => {
    if (!feed || hidden || note || pageSpoke.current) return;
    const tip = tipFor(pathname, seenTips);
    const attempt = () => {
      const session = readSession();
      const next = pickBubble({ nudges, tip, session, sinceLoadMs: Date.now() - pageAt.current, typing: memberIsBusy() });
      if (!next) return false;
      writeSession({ count: session.count + 1, shown: [...session.shown, next.id] });
      // A page tip is said once, ever.
      if (next.kind === "tip") persistDismiss(next.id);
      pageSpoke.current = true;
      setNote(next);
      return true;
    };
    const id = window.setInterval(() => {
      if (attempt()) window.clearInterval(id);
    }, 1500);
    const stop = window.setTimeout(() => window.clearInterval(id), 30_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [feed, nudges, seenTips, pathname, hidden, note, persistDismiss, setNote]);

  // Notes excuse themselves, unless the member is reading one.
  useEffect(() => {
    if (!note || hovered) return;
    const id = window.setTimeout(() => setNote(null), BUBBLE_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [note, hovered, setNote]);

  // Option/Alt+S, the old shortcut, still opens the palette outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hootShortcut(e) || touring || memberIsBusy()) return;
      e.preventDefault();
      setNote(null);
      onAsk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [touring, onAsk, setNote]);

  if (hidden) return null;
  const label = hovered || focused ? pageLabelFor(pathname) || "this page" : null;

  return (
    <div
      data-hoot-corner=""
      className="fixed right-7 bottom-6 z-40 flex items-center justify-end gap-2.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {note ? (
        <div role="status" className="relative flex max-w-[260px] flex-col rounded-lg border border-hoot-panel-ring bg-popover py-2 pr-8 pl-3 text-caption shadow-[0_6px_18px_rgb(10_10_10/0.08)]">
          <span className="font-semibold text-caution-foreground">New note</span>
          <Link
            href={note.href}
            onClick={() => {
              if (DISMISS_ON_OPEN.has(note.kind)) persistDismiss(note.id);
              setNote(null);
            }}
            className="font-semibold text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {note.title}
          </Link>
          {note.detail && <span className="text-ink-2">{withCommandKey(note.detail, mac)}</span>}
          <button
            type="button"
            onClick={() => {
              persistDismiss(note.id);
              setNote(null);
            }}
            aria-label={`Dismiss: ${note.title}`}
            className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        label && (
          <div id="hoot-corner-tip" role="tooltip" className="flex h-9 items-center gap-2.5 rounded-lg bg-primary px-3 text-body text-primary-foreground shadow-[0_6px_18px_rgb(10_10_10/0.18)]">
            <span>Ask Hoot about {label}</span>
            <kbd className="font-mono text-caption opacity-70">{mac ? "⌘J" : "Ctrl J"}</kbd>
          </div>
        )
      )}
      <button
        type="button"
        onClick={() => {
          setNote(null);
          onAsk();
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Ask Hoot"
        aria-describedby={label && !note ? "hoot-corner-tip" : undefined}
        aria-keyshortcuts={mac ? "Meta+J" : "Control+J"}
        data-tour="hoot"
        className={cn(
          "relative grid size-[52px] shrink-0 place-items-center rounded-full border border-hoot-panel-ring bg-popover shadow-[0_4px_14px_rgb(10_10_10/0.10)] transition-[transform,box-shadow] duration-200 ease-out",
          "hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgb(10_10_10/0.16)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hoot/mark.webp" alt="" width={40} height={40} draggable={false} className="size-10 rounded-full" />
      </button>
    </div>
  );
}
