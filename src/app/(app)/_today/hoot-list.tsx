"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { dismissHootNudge } from "@/lib/actions/preferences";
import type { HootFeed, HootNudge } from "@/lib/hoot/types";
import { analystSentence, isOverdue, listNudges, needsSentence, nudgeWhen } from "@/lib/today";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const REFRESH_MS = 5 * 60_000;
/** Rows shown before "Show N more". */
const SHOWN = 5;
/** Opening these is the same as dealing with them, as in Hoot's panel. */
const DISMISS_ON_OPEN = new Set(["sell_side", "changelog", "weekly", "proposal"]);

type Feed = { nudges: HootNudge[]; updatedAt: string; dismiss: (n: HootNudge) => void };
const FeedContext = createContext<Feed | null>(null);

function useFeed() {
  const f = useContext(FeedContext);
  if (!f) throw new Error("Home's list needs <TodayFeed>.");
  return f;
}

/**
 * Hoot's nudges for Home: seeded by the server, re-fetched from /api/hoot every five minutes (and when the tab comes
 * back), shared by the list and the greeting's sentence so both count the same things.
 */
export function TodayFeed({ initial, loadedAt, children }: { initial: HootNudge[]; loadedAt: string; children: React.ReactNode }) {
  const [nudges, setNudges] = useState(() => listNudges(initial));
  const [updatedAt, setUpdatedAt] = useState(loadedAt);
  const gone = useRef(new Set<string>());
  const last = useRef(0);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hoot", { cache: "no-store" });
      if (!res.ok) return;
      const feed = (await res.json()) as HootFeed;
      setNudges(listNudges(feed.nudges).filter((n) => !gone.current.has(n.id)));
      setUpdatedAt(new Date().toISOString());
      last.current = Date.now();
    } catch {
      // Offline: keep what's on screen.
    }
  }, []);

  useEffect(() => {
    last.current = Date.now();
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current >= REFRESH_MS - 1000) void load();
    };
    const tick = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const dismiss = useCallback((n: HootNudge) => {
    gone.current.add(n.id);
    setNudges((list) => list.filter((x) => x.id !== n.id));
    startTransition(async () => {
      const r = await dismissHootNudge(n.id);
      if (!r.ok) {
        gone.current.delete(n.id);
        setNudges((list) => listNudges([...list, n]));
      }
    });
  }, []);

  const value = useMemo(() => ({ nudges, updatedAt, dismiss }), [nudges, updatedAt, dismiss]);
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

/**
 * The line's last sentence: "3 things need you." (a link down to the list), or for an analyst what their team owes
 * ("Your team owes 1 write-up, due 12:00 PM ET Monday."). Follows the list as it refreshes.
 */
export function NeedsSentence({ analyst }: { analyst: boolean }) {
  const { nudges } = useFeed();
  const owed = analyst ? analystSentence(nudges) : null;
  const need = needsSentence(nudges.length);
  if (owed) return <>{owed}</>;
  if (!need) return <>Nothing needs you right now.</>;
  return (
    <a href="#needs" className="font-semibold text-foreground underline-offset-2 hover:underline">
      {need}
    </a>
  );
}

/** The tag word in front of a row: red when overdue, amber when something failed, grey for what's just waiting. */
function tagOf(n: HootNudge): { word: string; className: string } {
  if (isOverdue(n)) return { word: "Overdue", className: "text-down" };
  switch (n.kind) {
    case "sell_side":
      return n.id.endsWith(":error") ? { word: "Failed", className: "text-caution-foreground" } : { word: "Ready", className: "text-muted-foreground" };
    case "movement":
      return { word: "Due", className: "text-muted-foreground" };
    case "earnings":
      return { word: n.id.endsWith(":expectations") ? "Due" : "Soon", className: "text-muted-foreground" };
    case "proposal":
      return { word: "Review", className: "text-muted-foreground" };
    case "weekly":
      return { word: "Weekly", className: "text-muted-foreground" };
    case "changelog":
      return { word: "New", className: "text-muted-foreground" };
    default:
      return { word: "Note", className: "text-muted-foreground" };
  }
}

/** "Needs you": Hoot's list for you, most urgent first: a tag word, the title, and when and why underneath. */
export function NeedsYou() {
  const { nudges, updatedAt, dismiss } = useFeed();
  const [all, setAll] = useState(false);
  const shown = all ? nudges : nudges.slice(0, SHOWN);
  const more = nudges.length - shown.length;

  return (
    <section id="needs" data-tour="today-list" aria-labelledby="h-needs" className="scroll-mt-6">
      <div className="flex items-baseline justify-between border-b pb-1.5">
        <h2 id="h-needs" className="text-body font-bold">
          Needs you
        </h2>
        {nudges.length > 0 && <span className={cn("text-caption", nudges.some(isOverdue) ? "font-semibold text-down" : "text-muted-foreground")}>{nudges.length}</span>}
      </div>
      {nudges.length === 0 ? (
        <p className="py-2.5 text-body text-muted-foreground">Nothing needs you right now. Hoot puts things here as they come up.</p>
      ) : (
        <ul>
          {shown.map((n) => {
            const tag = tagOf(n);
            return (
              <li key={n.id} className="group relative flex items-start gap-1 border-b border-row hover:bg-band has-[a:focus-visible]:bg-band">
                <Link
                  href={n.href}
                  onClick={() => DISMISS_ON_OPEN.has(n.kind) && dismiss(n)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 py-[9px] no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                >
                  <span className="text-body">
                    <b className={cn("mr-1.5 text-caption font-semibold", tag.className)}>{tag.word}</b>
                    <span className="font-medium">{n.title}</span>
                  </span>
                  <span suppressHydrationWarning className="truncate text-caption text-muted-foreground">
                    {/* A title that already says when it's due doesn't say it again underneath. */}
                    {[n.detail, / due /i.test(n.title) ? null : nudgeWhen(n)].filter(Boolean).join(" · ")}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => dismiss(n)}
                  aria-label={`Dismiss: ${n.title}`}
                  title="Dismiss"
                  className="mt-2 grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {nudges.length > SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-1.5 text-caption font-semibold text-foreground hover:underline">
          {all ? "Show fewer" : `Show ${more} more`}
        </button>
      )}
      <p suppressHydrationWarning className="mt-1.5 text-caption text-muted-foreground">
        Updated {fmtTime(updatedAt)} · refreshes every 5 min
      </p>
    </section>
  );
}
