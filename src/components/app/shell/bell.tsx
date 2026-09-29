"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { dismissHootNudge } from "@/lib/actions/preferences";
import type { HootFeed, HootNudge } from "@/lib/hoot/types";
import { isOverdue, listNudges, nudgeWhen } from "@/lib/today";
import { fmtTime, joinSentences } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const REFRESH_MS = 5 * 60_000;
/** Opening these is the same as dealing with them. */
const DISMISS_ON_OPEN = new Set(["sell_side", "changelog", "weekly", "proposal"]);

/** The tag word in front of a row: red when overdue, amber when something failed, grey for what's just waiting. */
export function nudgeTag(n: HootNudge): { word: string; className: string } {
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

/**
 * Hoot's list of what needs you (overdue write-ups, reviews, reports to prepare), fetched from /api/hoot once the page
 * is idle and every five minutes after. Shared by the bell and anything else that counts the same things.
 */
function useNeedsYou() {
  const [nudges, setNudges] = useState<HootNudge[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const gone = useRef(new Set<string>());
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/hoot", { cache: "no-store" });
      if (!res.ok) return;
      const feed = (await res.json()) as HootFeed;
      setNudges(listNudges(feed.nudges).filter((n) => !gone.current.has(n.id)));
      setUpdatedAt(new Date().toISOString());
    } catch {
      // Offline: keep what's there.
    }
  }, []);

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const first = idle(() => void load());
    const tick = window.setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancel(first);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const dismiss = useCallback((n: HootNudge) => {
    gone.current.add(n.id);
    setNudges((list) => list?.filter((x) => x.id !== n.id) ?? null);
    startTransition(async () => {
      const r = await dismissHootNudge(n.id);
      if (!r.ok) {
        gone.current.delete(n.id);
        setNudges((list) => listNudges([...(list ?? []), n]));
      }
    });
  }, []);

  return { nudges, updatedAt, dismiss, reload: load };
}

/**
 * The bell in the sidebar's footer: how many things need you, and the list itself in a popover. What Home's "Needs you"
 * used to show; each holding's page shows its own.
 */
export function Bell() {
  const { nudges, updatedAt, dismiss, reload } = useNeedsYou();
  const [open, setOpen] = useState(false);
  const n = nudges?.length ?? 0;
  const overdue = nudges?.some(isOverdue) ?? false;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void reload();
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            data-tour="bell"
            aria-label={n ? `Needs you: ${n}${overdue ? ", some overdue" : ""}` : "Needs you: nothing"}
            className="relative grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-popup-open:bg-sidebar-accent"
          />
        }
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {n > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute -top-0.5 -right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-caption leading-none font-semibold text-background",
              overdue ? "bg-down" : "bg-caution-foreground",
            )}
          >
            {n > 99 ? "99+" : n}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={10} className="w-[380px] gap-0 p-0">
        <div className="flex h-11 items-center justify-between border-b px-4">
          <span className="text-body font-semibold">Needs you</span>
          {n > 0 && <span className={cn("text-caption", overdue ? "font-semibold text-down" : "text-muted-foreground")}>{n}</span>}
        </div>
        {nudges === null ? (
          <p className="px-4 py-3 text-body text-muted-foreground">Checking…</p>
        ) : n === 0 ? (
          <p className="px-4 py-3 text-body text-muted-foreground">Nothing needs you right now. Hoot puts things here as they come up.</p>
        ) : (
          <ul className="max-h-[420px] overflow-y-auto">
            {nudges.map((item) => {
              const tag = nudgeTag(item);
              return (
                <li key={item.id} className="group relative flex items-start gap-1 border-b border-row last:border-b-0 hover:bg-accent has-[a:focus-visible]:bg-accent">
                  <Link
                    href={item.href}
                    onClick={() => {
                      if (DISMISS_ON_OPEN.has(item.kind)) dismiss(item);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 pl-4 no-underline focus-visible:outline-none"
                  >
                    <span className="text-body">
                      <b className={cn("mr-1.5 text-caption font-semibold", tag.className)}>{tag.word}</b>
                      <span className="font-medium">{item.title}</span>
                    </span>
                    <span suppressHydrationWarning className="truncate text-caption text-muted-foreground">
                      {/* A title that already says when it's due doesn't say it again underneath. */}
                      {joinSentences([item.detail, / due /i.test(item.title) ? null : nudgeWhen(item)])}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismiss(item)}
                    aria-label={`Dismiss: ${item.title}`}
                    title="Dismiss"
                    className="mt-2.5 mr-2 grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {updatedAt && (
          <p suppressHydrationWarning className="border-t px-4 py-2 text-caption text-muted-foreground">
            Updated {fmtTime(updatedAt)}, refreshes every 5 min
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
