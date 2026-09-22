"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { startHootChat } from "@/lib/actions/chats";
import { dismissHootNudge, setHootEnabled } from "@/lib/actions/preferences";
import { BUBBLE_VISIBLE_MS, companionHiddenOn, greeting, pickBubble, restingMood, suggestionsFor, teamSlugFromPath, tickerFromPath, tipFor, type BubbleSession } from "@/lib/hoot/policy";
import type { HootFeed, HootMood, HootNudge } from "@/lib/hoot/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { leaveHootQuestion } from "./handoff";
import { pageContextFor } from "./page-context";
import { pageContextLabel } from "@/lib/agent/page-context";
import { HootPanel } from "./hoot-panel";
import { HootSprite, preloadHoot } from "./hoot-sprite";

const REFRESH_MS = 5 * 60_000;
const SESSION_KEY = "hoot:session";
const GREETED_KEY = "hoot:greeted";
/** Opening these means they're handled; deadlines stay until the work is done or the member dismisses them. */
const DISMISS_ON_OPEN = new Set(["sell_side", "changelog", "weekly", "tip", "proposal"]);
const HOP: Keyframe[] = [
  { transform: "translateY(0) scale(1, 1)" },
  { transform: "translateY(0) scale(1.08, 0.9)", offset: 0.18 },
  { transform: "translateY(-10px) scale(0.95, 1.06)", offset: 0.45 },
  { transform: "translateY(0) scale(1.04, 0.96)", offset: 0.75 },
  { transform: "translateY(0) scale(1, 1)" },
];
const POP: Keyframe[] = [{ transform: "scale(0.94)" }, { transform: "scale(1.03)", offset: 0.6 }, { transform: "scale(1)" }];

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
    // Private mode: bubbles just aren't rate-limited across reloads.
  }
}

/** Someone is typing or in a dialog: never interrupt. */
function memberIsBusy() {
  const el = document.activeElement as HTMLElement | null;
  const typing = !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
  return typing || !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}

/**
 * Hoot, the floating companion in the bottom corner. His face tells you the state of things at a glance
 * (dozing after the close, alert on earnings day, worried about an overdue write-up); a click opens a quick ask
 * to the research agent and everything that needs you. He speaks up on his own rarely: a few times a session at most.
 */
export function HootCompanion({ firstName }: { firstName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [feed, setFeed] = useState<HootFeed | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  // Tagged with the page it was said on, so it disappears the moment the member navigates.
  const [said, setSaid] = useState<{ nudge: HootNudge; path: string } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [greetingWave, setGreetingWave] = useState(false);
  const body = useRef<HTMLSpanElement>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const loadedAt = useRef(0);
  const pageAt = useRef(0);
  /** At most one bubble per page view, even if the session allowance has room. */
  const pageSpoke = useRef(false);
  const hidden = companionHiddenOn(pathname);

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
    const id = idle(() => {
      void load();
      preloadHoot(["alert", "wave", "concerned", "happy", "sleepy"]);
    });
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

  // A wave hello on the first page of a visit.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(GREETED_KEY)) return;
      sessionStorage.setItem(GREETED_KEY, "1");
    } catch {
      return;
    }
    const on = window.setTimeout(() => setGreetingWave(true), 600);
    const off = window.setTimeout(() => setGreetingWave(false), 3200);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, []);

  const nudges = useMemo(() => (feed?.nudges ?? []).filter((n) => !dismissed.has(n.id)), [feed, dismissed]);
  const seenTips = useMemo(() => [...(feed?.seenTips ?? []), ...dismissed], [feed, dismissed]);

  const persistDismiss = useCallback((id: string) => {
    setDismissed((d) => new Set(d).add(id));
    startTransition(async () => {
      await dismissHootNudge(id);
    });
  }, []);

  const bubble = said && said.path === pathname ? said.nudge : null;
  const setBubble = useCallback((n: HootNudge | null) => setSaid(n ? { nudge: n, path: window.location.pathname } : null), []);

  // New page: maybe say one thing, after the page settles and only if the member isn't busy.
  useEffect(() => {
    pageAt.current = Date.now();
    pageSpoke.current = false;
  }, [pathname]);

  useEffect(() => {
    if (!feed || hidden || open || bubble || pageSpoke.current) return;
    const tip = tipFor(pathname, seenTips);
    const attempt = () => {
      const session = readSession();
      const next = pickBubble({ nudges, tip, session, sinceLoadMs: Date.now() - pageAt.current, typing: memberIsBusy() });
      if (!next) return false;
      writeSession({ count: session.count + 1, shown: [...session.shown, next.id] });
      // A page tip is said once, ever.
      if (next.kind === "tip") persistDismiss(next.id);
      pageSpoke.current = true;
      setBubble(next);
      return true;
    };
    // Re-check every few seconds: the settle delay may not have passed yet, or the member was typing.
    const id = window.setInterval(() => {
      if (attempt()) window.clearInterval(id);
    }, 1500);
    const stop = window.setTimeout(() => window.clearInterval(id), 30_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [feed, nudges, seenTips, pathname, hidden, open, bubble, persistDismiss, setBubble]);

  // Bubbles excuse themselves, unless the member is reading one.
  useEffect(() => {
    if (!bubble || hovered) return;
    const id = window.setTimeout(() => setBubble(null), BUBBLE_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [bubble, hovered, setBubble]);

  // ⌘J / Ctrl+J toggles the panel from anywhere.
  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setBubble(null);
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, setBubble]);

  /** Squash-and-stretch without remounting anything (remounting under the cursor would eat clicks). */
  const play = useCallback((frames: Keyframe[], duration: number) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    body.current?.animate(frames, { duration, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" });
  }, []);

  const ticker = tickerFromPath(pathname);
  const teamSlug = teamSlugFromPath(pathname);

  const resting = feed ? restingMood(feed.marketOpen, nudges) : "idle";
  const mood: HootMood = asking
    ? "thinking"
    : bubble
      ? bubble.mood
      : greetingWave
        ? "wave"
        : open || hovered
          ? resting === "sleepy"
            ? "idle"
            : resting
          : resting;
  // A little pop whenever his expression changes.
  const lastMood = useRef(mood);
  useEffect(() => {
    if (lastMood.current !== mood) play(POP, 260);
    lastMood.current = mood;
  }, [mood, play]);

  const ask = async (text: string) => {
    setAsking(true);
    setAskError(null);
    try {
      // Read at the moment of asking, so it reflects the period or scenario on screen right now.
      const page = pageContextFor(pathname);
      const res = await startHootChat({ teamSlug, ticker });
      if ("error" in res) {
        setAskError(res.error);
        return;
      }
      if (!leaveHootQuestion(res.chatId, text, page)) {
        // Storage blocked: open the chat and let the member paste it.
        toast("Your chat is open. Paste your question to send it.");
      }
      setOpen(false);
      router.push(res.href);
    } catch {
      setAskError("Couldn't open a chat just now. Try again in a moment.");
    } finally {
      setAsking(false);
    }
  };

  const hide = () => {
    setOpen(false);
    startTransition(async () => {
      await setHootEnabled(false);
      router.refresh();
      toast("Hoot is taking a nap", {
        description: "Bring him back any time from the sidebar.",
        action: {
          label: "Undo",
          // Hoot has unmounted by now, so this can't lean on his transition.
          onClick: () => void setHootEnabled(true).then(() => router.refresh()),
        },
      });
    });
  };

  if (hidden) return null;

  const urgent = nudges.filter((n) => n.priority <= 2).length;
  // Pages that describe themselves (attribution, backtesting) are attached to the question; say so in the panel.
  const onScreen = open ? pageContextFor(pathname) : null;
  const seeing = onScreen && onScreen.kind !== "page" ? pageContextLabel(onScreen) : null;
  const label = urgent ? `Hoot: ${urgent} ${urgent === 1 ? "thing needs" : "things need"} you` : "Hoot: ask the research agent";

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-40 flex flex-col items-end gap-2 md:right-5 md:bottom-5" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {bubble && !open && (
        <div
          role="status"
          aria-live="polite"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="hoot-arrive pointer-events-auto relative mr-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 pr-8 text-sm text-popover-foreground shadow-lg"
        >
          <div className="leading-snug font-medium">{bubble.title}</div>
          {bubble.detail && <div className="mt-1 text-xs leading-snug text-muted-foreground">{bubble.detail}</div>}
          {bubble.kind !== "tip" && (
            <Link
              href={bubble.href}
              onClick={() => {
                if (DISMISS_ON_OPEN.has(bubble.kind)) persistDismiss(bubble.id);
                setBubble(null);
              }}
              className="mt-2 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Show me
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              if (bubble.kind !== "tip") persistDismiss(bubble.id);
              setBubble(null);
            }}
            className="absolute top-2 right-2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
          {/* Tail pointing at Hoot. */}
          <span aria-hidden className="absolute -bottom-1.5 right-8 size-3 rotate-45 border-r border-b bg-popover" />
        </div>
      )}

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setBubble(null);
            if (Date.now() - loadedAt.current > 60_000) void load();
          }
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={label}
              onClick={() => play(HOP, 520)}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              className="hoot-arrive group pointer-events-auto relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          }
        >
          {/* Soft floor shadow grounds him on the page. Nothing inside the button takes pointer events, so a
              mood change under the cursor can never swallow the click. */}
          <span aria-hidden className="pointer-events-none absolute inset-x-3 bottom-0.5 h-2 rounded-[50%] bg-black/15 blur-[3px]" />
          <span ref={body} className="pointer-events-none relative block">
            <HootSprite mood={mood} size={64} track bob className="max-md:size-[52px]!" />
          </span>
          {mood === "sleepy" && (
            <span aria-hidden className="hoot-zzz absolute -top-1 right-1 text-[11px] font-semibold text-muted-foreground">
              z
            </span>
          )}
          {urgent > 0 && (
            <span aria-hidden className="absolute top-0.5 right-0.5 grid size-4.5 place-items-center rounded-full bg-down text-[10px] font-semibold text-white ring-2 ring-background">
              {urgent}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent side="top" align="end" sideOffset={10} className="w-[22rem] max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0">
          <HootPanel
            greeting={greeting(new Date(), firstName)}
            suggestions={suggestionsFor(pathname, ticker)}
            scopeHint={ticker ? `${ticker}'s research board` : "your team's agent"}
            seeing={seeing}
            nudges={nudges}
            loading={!feed}
            asking={asking}
            askError={askError}
            onAsk={ask}
            onOpenNudge={(n) => {
              if (DISMISS_ON_OPEN.has(n.kind)) persistDismiss(n.id);
              setOpen(false);
            }}
            onDismiss={(n) => persistDismiss(n.id)}
            onHide={hide}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
