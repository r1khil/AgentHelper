"use client";

import { useHootCommand } from "@/components/app/hoot/use-hoot-command";
import { hootShortcut, isMac } from "@/lib/hoot/shortcuts";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { startHootChat } from "@/lib/actions/chats";
import { dismissHootNudge, setHootEnabled } from "@/lib/actions/preferences";
import { BUBBLE_VISIBLE_MS, companionHiddenOn, greeting, pickBubble, restingMood, suggestionsFor, teamSlugFromPath, tickerFromPath, tipFor, type BubbleSession } from "@/lib/hoot/policy";
import type { HootFeed, HootMood, HootNudge } from "@/lib/hoot/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { leaveHootQuestion } from "./handoff";
import { pageContextFor } from "./page-context";
import { useHootOnPage, usePageMood } from "./presence";
import { pageContextLabel } from "@/lib/agent/page-context";
import { HootPanel } from "./hoot-panel";
import { HootSprite, preloadHoot, usePrefersReducedMotion } from "./hoot-sprite";
import { useTourActive } from "@/components/app/tour/tour-store";

const REFRESH_MS = 5 * 60_000;
const SESSION_KEY = "hoot:session";
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
// Idle fidgets: small enough to catch the corner of your eye, never enough to pull it away from the page.
const SHUFFLE: Keyframe[] = [{ transform: "rotate(0)" }, { transform: "rotate(-4deg)", offset: 0.25 }, { transform: "rotate(3deg)", offset: 0.6 }, { transform: "rotate(0)" }];
const RUFFLE: Keyframe[] = [{ transform: "scale(1, 1)" }, { transform: "scale(1.06, 0.95)", offset: 0.3 }, { transform: "scale(0.98, 1.02)", offset: 0.6 }, { transform: "scale(1.03, 0.98)", offset: 0.8 }, { transform: "scale(1, 1)" }];
const HOPLET: Keyframe[] = [{ transform: "translateY(0)" }, { transform: "translateY(-4px)", offset: 0.4 }, { transform: "translateY(0)", offset: 0.7 }, { transform: "translateY(-1.5px)", offset: 0.85 }, { transform: "translateY(0)" }];
const NOD: Keyframe[] = [{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(2px) rotate(4deg)", offset: 0.55 }, { transform: "translateY(2px) rotate(4deg)", offset: 0.75 }, { transform: "translateY(0) rotate(0)" }];
const STRETCH: Keyframe[] = [{ transform: "scale(1, 1)" }, { transform: "scale(0.97, 1.05)", offset: 0.45 }, { transform: "scale(0.97, 1.05)", offset: 0.6 }, { transform: "scale(1, 1)" }];
const WIGGLE: Keyframe[] = [{ transform: "rotate(0)" }, { transform: "rotate(-6deg)", offset: 0.2 }, { transform: "rotate(6deg)", offset: 0.45 }, { transform: "rotate(-3deg)", offset: 0.7 }, { transform: "rotate(0)" }];

// With no menu on screen (phones) he floats in a bottom corner instead. Which one is a per-device convenience, so
// localStorage (unavailable storage just means "right").
type Corner = "left" | "right";
const CORNER_KEY = "hoot:corner";
const cornerListeners = new Set<() => void>();
function readCorner(): Corner {
  try {
    return localStorage.getItem(CORNER_KEY) === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}
function saveCorner(side: Corner) {
  try {
    localStorage.setItem(CORNER_KEY, side);
  } catch {
    // Storage blocked: he moves for this page view only.
  }
  for (const l of cornerListeners) l();
}
function useCorner() {
  return useSyncExternalStore(
    (on) => {
      cornerListeners.add(on);
      window.addEventListener("storage", on);
      return () => {
        cornerListeners.delete(on);
        window.removeEventListener("storage", on);
      };
    },
    readCorner,
    () => "right" as Corner,
  );
}

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

function memberIsTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Someone is typing or in a dialog: never interrupt. */
function memberIsBusy() {
  return memberIsTyping() || !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}

/** Where the companion lives on a desktop: at the bottom of the rail, or of the classic sidebar. */
export type HootDock = "rail" | "sidebar";

/**
 * Hoot, the companion. On a desktop he sits at the bottom of the menu (`dock`), so he never covers the page; his
 * speech bubbles and the panel open beside the menu, over the page, and close with a click away or Escape. With no
 * menu on screen (phones) he floats in a bottom corner. His face tells you the state of things at a glance (dozing
 * after the close, alert on earnings day, worried about an overdue write-up); a click opens a quick ask to research
 * and everything that needs you. He speaks up on his own rarely: a few times a session at most.
 */
export function HootCompanion({ firstName, suppressed = false, dock = null }: { firstName: string; suppressed?: boolean; dock?: HootDock | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const runCommand = useHootCommand();
  const [feed, setFeed] = useState<HootFeed | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  // Tagged with the page it was said on, so it disappears the moment the member navigates.
  const [said, setSaid] = useState<{ nudge: HootNudge; path: string } | null>(null);
  const [hovered, setHovered] = useState(false);
  /** A brief expression for a moment (welcome back, something new needs you). */
  const [flash, setFlash] = useState<HootMood | null>(null);
  /** Pointer resting on him: eyes close happily. */
  const [petting, setPetting] = useState(false);
  /** A quick look somewhere (toward the page after navigating), overriding what he's watching. */
  const [glance, setGlance] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const side = useCorner();
  const reduced = usePrefersReducedMotion();
  const body = useRef<HTMLSpanElement>(null);
  const petTimer = useRef<number | undefined>(undefined);
  const flashTimer = useRef<number | undefined>(undefined);
  const lastTouch = useRef(0);
  const dragFrom = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const firstPage = useRef(true);
  const knownUrgent = useRef<Set<string> | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const loadedAt = useRef(0);
  const pageAt = useRef(0);
  /** At most one bubble per page view, even if the session allowance has room. */
  const pageSpoke = useRef(false);
  // During a tour the tour flies its own Hoot, taking off from this spot and landing back on it.
  const touring = useTourActive();
  // One Hoot per screen: he steps aside where the page already shows him, and while ⌘K is open.
  const shownOnPage = useHootOnPage();
  const pageMood = usePageMood();
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
  // And glance over at the new page, like anyone would when the view changes.
  useEffect(() => {
    pageAt.current = Date.now();
    pageSpoke.current = false;
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    // Docked in the menu, the page is always to his right.
    const look = window.setTimeout(() => setGlance({ x: dock || side === "left" ? 0.9 : -0.9, y: -0.3 }), 120);
    const back = window.setTimeout(() => setGlance(null), 1100);
    return () => {
      window.clearTimeout(look);
      window.clearTimeout(back);
    };
  }, [pathname, side, dock]);

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

  // Option/Alt+S and Mac Command+S open Hoot. Keep Command/Ctrl+J as the existing toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = hootShortcut(e, isMac());
      if (!action || touring) return;
      // Option+S types a character (ß on Mac) in text fields; leave it to the field.
      if (action === "open" && e.altKey && memberIsTyping()) return;
      e.preventDefault();
      setBubble(null);
      setOpen((o) => action === "open" || !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [touring, setBubble]);

  /** Squash-and-stretch without remounting anything (remounting under the cursor would eat clicks). */
  const play = useCallback((frames: Keyframe[], duration: number) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    body.current?.animate(frames, { duration, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" });
  }, []);

  const ticker = tickerFromPath(pathname);
  const teamSlug = teamSlugFromPath(pathname);

  const resting = pageMood ?? (feed ? restingMood(feed.marketOpen, nudges) : "idle");
  const awake = resting === "sleepy" ? "idle" : resting;
  const mood: HootMood = drag
    ? "alert"
    : asking
      ? "thinking"
      : bubble
        ? bubble.mood
        : (flash ?? (petting ? "happy" : open || hovered ? awake : resting));

  const showFlash = useCallback((m: HootMood, ms: number) => {
    window.clearTimeout(flashTimer.current);
    setFlash(m);
    flashTimer.current = window.setTimeout(() => setFlash(null), ms);
  }, []);

  // Live values for the timers below, without restarting them on every render.
  const live = useRef({ open, bubble: false, drag: false, mood });
  useEffect(() => {
    live.current = { open, bubble: !!bubble, drag: !!drag, mood };
  });

  // Idle fidgets every 20 to 50 seconds, only while nobody is interacting with him: a shuffle, a feather ruffle,
  // a little bounce, or when he's dozing, a nod or a slow stretch.
  useEffect(() => {
    if (hidden || reduced) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        const l = live.current;
        if (document.visibilityState === "visible" && !l.open && !l.bubble && !l.drag && Date.now() - lastTouch.current > 8000) {
          const r = Math.random();
          if (l.mood === "sleepy") play(r < 0.6 ? NOD : STRETCH, r < 0.6 ? 1600 : 1400);
          else play(r < 0.4 ? SHUFFLE : r < 0.75 ? RUFFLE : HOPLET, r < 0.4 ? 900 : 560);
        }
        schedule();
      }, 20_000 + Math.random() * 30_000);
    };
    schedule();
    return () => clearTimeout(t);
  }, [hidden, reduced, play]);

  // Back after a while away: a wave.
  useEffect(() => {
    let away = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") away = Date.now();
      else if (away && Date.now() - away > 5 * 60_000) showFlash("wave", 2400);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [showFlash]);

  // Something urgent turned up since the last check: perk up and hop once (the bubble rules decide whether he says it).
  useEffect(() => {
    if (!feed) return;
    const ids = new Set(feed.nudges.filter((n) => n.priority <= 2).map((n) => n.id));
    const seen = knownUrgent.current;
    knownUrgent.current = ids;
    if (!seen || ![...ids].some((id) => !seen.has(id))) return;
    const t = window.setTimeout(() => {
      showFlash("alert", 1600);
      play(HOP, 520);
    }, 400);
    return () => window.clearTimeout(t);
  }, [feed, showFlash, play]);

  const cancelPet = () => {
    window.clearTimeout(petTimer.current);
    setPetting(false);
  };

  const moveTo = (next: Corner) => {
    saveCorner(next);
    window.setTimeout(() => play(HOP, 520), 60);
  };
  // A little pop whenever his expression changes.
  const lastMood = useRef(mood);
  useEffect(() => {
    if (lastMood.current !== mood) play(POP, 260);
    lastMood.current = mood;
  }, [mood, play]);

  const ask = async (text: string) => {
    if (runCommand(text)) {
      setAskError(null);
      setOpen(false);
      return;
    }
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
        description: "Bring him back any time: click your initials, then Hoot in the menu.",
        action: {
          label: "Undo",
          // Hoot has unmounted by now, so this can't lean on his transition.
          onClick: () => void setHootEnabled(true).then(() => router.refresh()),
        },
      });
    });
  };

  // The shortcut can bring him up on pages where he normally stays hidden.
  if (touring || (hidden && !open)) return null;

  const urgent = nudges.filter((n) => n.priority <= 2).length;
  // Pages that describe themselves (attribution, backtesting) are attached to the question; say so in the panel.
  const onScreen = open ? pageContextFor(pathname) : null;
  const seeing = onScreen && onScreen.kind !== "page" ? pageContextLabel(onScreen) : null;
  const label = urgent ? `Hoot: ${urgent} ${urgent === 1 ? "thing needs" : "things need"} you` : "Hoot: ask a research question";

  return (
    <div
      className={cn(
        dock
          ? "relative flex flex-col items-center"
          : cn("pointer-events-none fixed bottom-3 z-40 flex flex-col gap-2", side === "right" ? "right-3 items-end" : "left-3 items-start"),
      )}
      style={dock ? undefined : { paddingBottom: "env(safe-area-inset-bottom)", transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined }}
      // A drag ends with a click on the trigger; don't let it open the panel.
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {bubble && !open && !drag && (
        <div
          role="status"
          aria-live="polite"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={cn(
            "hoot-arrive pointer-events-auto w-64 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 pr-8 text-sm text-popover-foreground shadow-lg",
            // Docked, he speaks from beside the menu, over the page's bottom-left corner, for a few seconds at most.
            dock ? "absolute bottom-1 left-full z-10 ml-3" : "relative mx-2",
          )}
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
          <span
            aria-hidden
            className={cn(
              "absolute size-3 rotate-45 bg-popover",
              dock ? "bottom-5 -left-1.5 border-b border-l" : cn("-bottom-1.5 border-r border-b", side === "right" ? "right-8" : "left-8"),
            )}
          />
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
              data-hoot-companion
              aria-label={label}
              onClick={() => play(HOP, 520)}
              onMouseEnter={() => {
                setHovered(true);
                lastTouch.current = Date.now();
                // Rest the pointer on him for a moment and he closes his eyes, pleased.
                window.clearTimeout(petTimer.current);
                petTimer.current = window.setTimeout(() => {
                  setPetting(true);
                  play(WIGGLE, 620);
                }, 1100);
              }}
              onMouseLeave={() => {
                setHovered(false);
                cancelPet();
              }}
              // Floating, drag him to the other bottom corner (a short movement is still a click). Docked, he stays put.
              onPointerDown={(e) => {
                if (dock || e.button !== 0) return;
                cancelPet();
                lastTouch.current = Date.now();
                dragFrom.current = { x: e.clientX, y: e.clientY, moved: false };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = dragFrom.current;
                if (!d) return;
                const dx = e.clientX - d.x;
                const dy = e.clientY - d.y;
                if (!d.moved && Math.hypot(dx, dy) < 8) return;
                d.moved = true;
                setDrag({ dx, dy });
              }}
              onPointerUp={(e) => {
                const d = dragFrom.current;
                dragFrom.current = null;
                if (!d?.moved) return;
                swallowClick.current = true;
                setDrag(null);
                moveTo(e.clientX < window.innerWidth / 2 ? "left" : "right");
              }}
              onPointerCancel={() => {
                dragFrom.current = null;
                setDrag(null);
              }}
              style={dock ? undefined : { touchAction: "none" }}
              className={cn(
                "hoot-arrive group pointer-events-auto relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                drag ? "cursor-grabbing" : "cursor-pointer",
              )}
            />
          }
        >
          {/* Soft floor shadow grounds him on the page. Nothing inside the button takes pointer events, so a
              mood change under the cursor can never swallow the click. */}
          <span aria-hidden className="pointer-events-none absolute inset-x-3 bottom-0.5 h-[7px] rounded-[50%] bg-[rgba(40,25,10,0.2)] blur-[3px]" />
          {/* Perks up a little under the pointer. */}
          <span className="pointer-events-none relative block transition-transform duration-300 ease-out group-hover:-translate-y-0.5">
            <span ref={body} className="relative block">
              <HootSprite mood={mood} size={60} track bob lean gaze={glance ?? undefined} className="max-md:size-[52px]!" />
            </span>
          </span>
          {mood === "sleepy" && (
            <span aria-hidden className={cn("hoot-zzz absolute -top-1 right-1 text-[11px] font-semibold", dock === "rail" ? "text-rail-foreground" : "text-muted-foreground")}>
              z
            </span>
          )}
          {urgent > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute top-0.5 right-0.5 grid size-4.5 place-items-center rounded-full bg-down text-[10px] font-semibold text-white ring-2",
                dock === "rail" ? "ring-rail" : dock === "sidebar" ? "ring-sidebar" : "ring-background",
              )}
            >
              {urgent}
            </span>
          )}
        </PopoverTrigger>
        {/* Docked, the panel opens beside the menu, bottom-aligned with him, and grows upward. */}
        <PopoverContent
          side={dock ? "right" : "top"}
          align={dock || side === "right" ? "end" : "start"}
          sideOffset={dock ? 14 : 10}
          className="w-[22rem] max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0"
        >
          <HootPanel
            greeting={greeting(new Date(), firstName)}
            suggestions={suggestionsFor(pathname, ticker)}
            scopeHint={ticker ? `${ticker} research` : null}
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
            side={side}
            onMove={
              dock
                ? undefined
                : () => {
                    setOpen(false);
                    moveTo(side === "right" ? "left" : "right");
                  }
            }
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
