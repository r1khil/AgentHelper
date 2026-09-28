"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Activity, CalendarDays, CalendarRange, FileText, Mic, Sparkles, Table2, UserX, X } from "lucide-react";
import { dismissHootNudge } from "@/lib/actions/preferences";
import type { HootFeed, HootNudge } from "@/lib/hoot/types";
import { NY } from "@/lib/providers/calendar";
import { analystSentence, isOverdue, listNudges, listSentence, nudgeAction, nudgeWhen } from "@/lib/today";
import { Panel, PanelHeader, PanelFooter } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
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
  if (!f) throw new Error("Today's Hoot list needs <TodayFeed>.");
  return f;
}

/**
 * Hoot's nudges for Today: seeded by the server, re-fetched from /api/hoot every five minutes (and when the tab
 * comes back), shared by the list and the greeting's sentence so both count the same things.
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
 * "I found four things for you, one of them overdue.", or for an analyst "You owe 1 write-up, due 12:00 ET Monday."
 * Follows the list as it refreshes.
 */
export function ListSentence({ analyst }: { analyst: boolean }) {
  const { nudges } = useFeed();
  return <>{analyst ? analystSentence(nudges) : listSentence(nudges.length, nudges.filter(isOverdue).length)}</>;
}

function iconFor(n: HootNudge) {
  if (n.kind === "proposal" && n.id.startsWith("proposal:model:")) return Table2;
  return { movement: Activity, holdings: UserX, earnings: CalendarDays, sell_side: Mic, proposal: FileText, weekly: CalendarRange, changelog: Sparkles, tip: Sparkles }[n.kind];
}

/** Hoot's list for you: the "For you" feed from his panel, most urgent first. */
export function HootList() {
  const { nudges, updatedAt, dismiss } = useFeed();
  const [all, setAll] = useState(false);
  const shown = all ? nudges : nudges.slice(0, SHOWN);
  const more = nudges.length - shown.length;

  return (
    <Panel data-tour="today-list" aria-label="Hoot's list for you" className="shrink-0">
      <PanelHeader
        title="Hoot's list for you"
        count={nudges.length ? nudges.length : undefined}
        hot
        aside={<span suppressHydrationWarning>Updated {DateTime.fromISO(updatedAt).setZone(NY).toFormat("h:mm")} · refreshes every 5 min</span>}
      />
      {nudges.length === 0 ? (
        <p className="flex h-[58px] items-center px-4 text-[14px] text-muted-foreground">Nothing needs you right now. I&rsquo;ll put things here as they come up.</p>
      ) : (
        <ul className="divide-y divide-row">
          {shown.map((n, i) => {
            const Icon = iconFor(n);
            const urgent = n.priority <= 2;
            return (
              <li key={n.id} className="grid h-[58px] grid-cols-[32px_minmax(0,1fr)_150px_116px_20px] items-center gap-3 px-4">
                <span className={cn("grid size-8 place-items-center rounded-full", urgent ? "bg-hoot text-hoot-foreground" : "bg-muted text-muted-foreground")}>
                  <Icon className="size-[15px]" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold">{n.title}</div>
                  {n.detail && <div className="mt-px truncate text-[12.5px] text-muted-foreground">{n.detail}</div>}
                </div>
                <span suppressHydrationWarning className={cn("truncate font-mono text-xs", urgent ? "text-hoot-foreground" : "text-muted-foreground")}>
                  {nudgeWhen(n)}
                </span>
                <Button
                  nativeButton={false}
                  size="sm"
                  variant={i === 0 ? "default" : "outline"}
                  className="justify-self-end"
                  render={<Link href={n.href} onClick={() => DISMISS_ON_OPEN.has(n.kind) && dismiss(n)} />}
                >
                  {nudgeAction(n)}
                </Button>
                <button
                  type="button"
                  onClick={() => dismiss(n)}
                  aria-label={`Dismiss: ${n.title}`}
                  title="Dismiss"
                  className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {(more > 0 || all) && nudges.length > SHOWN && (
        <PanelFooter className="border-row">
          <button type="button" onClick={() => setAll((a) => !a)} className="font-medium text-foreground hover:underline">
            {all ? "Show fewer" : `Show ${more} more`}
          </button>
        </PanelFooter>
      )}
    </Panel>
  );
}
