"use client";

import Link from "next/link";
import { Activity, ArrowLeftRight, CalendarDays, CalendarRange, EyeOff, FileText, Mic, Search, Sparkles, X } from "lucide-react";
import type { HootNudge, NudgeKind } from "@/lib/hoot/types";
import { hootShortcutLabel, isMac } from "@/lib/hoot/shortcuts";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<NudgeKind, React.ComponentType<{ className?: string }>> = {
  movement: Activity,
  earnings: CalendarDays,
  sell_side: Mic,
  proposal: FileText,
  weekly: CalendarRange,
  changelog: Sparkles,
  tip: Sparkles,
};

/**
 * What opens when you click Hoot: what needs you, a way to ask him something, and sending him away. Asking happens in
 * ⌘K (or on Research), the same as everywhere else, so the panel has no composer or greeting of its own.
 */
export function HootPanel({
  nudges,
  loading,
  onAsk,
  onOpenNudge,
  onDismiss,
  onHide,
  onMove,
  side,
  onClose,
}: {
  nudges: HootNudge[];
  loading: boolean;
  /** Opens ⌘K, where research questions, "take me to …" and "dark mode" all go. */
  onAsk: () => void;
  onOpenNudge: (n: HootNudge) => void;
  onDismiss: (n: HootNudge) => void;
  onHide: () => void;
  /** Send Hoot to the other bottom corner (he can also be dragged there). Absent while he's docked in the menu. */
  onMove?: () => void;
  side: "left" | "right";
  onClose: () => void;
}) {
  return (
    <div className="flex max-h-[min(34rem,calc(100dvh-8rem))] flex-col">
      <div className="flex items-center gap-2 border-b p-2">
        <button
          type="button"
          autoFocus
          onClick={onAsk}
          className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Ask Hoot, or jump to a page</span>
          <kbd className="rounded border bg-muted px-1 font-sans text-[10px]">{isMac() ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      <div className="overflow-y-auto">
        <div className="px-4 pt-3 pb-2">
          <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">For you</div>
          {loading ? (
            <div className="mt-2 space-y-2">
              <div className="h-9 animate-pulse rounded-md bg-muted" />
              <div className="h-9 animate-pulse rounded-md bg-muted" />
            </div>
          ) : nudges.length === 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">You&rsquo;re all caught up. Nothing needs you right now.</div>
          ) : (
            <ul className="mt-1.5 -mx-2">
              {nudges.map((n) => {
                const Icon = KIND_ICON[n.kind];
                return (
                  <li key={n.id} className="group relative">
                    <Link href={n.href} onClick={() => onOpenNudge(n)} className="flex gap-2.5 rounded-md px-2 py-2 pr-8 hover:bg-muted">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", n.priority <= 2 ? "text-down" : "text-muted-foreground")} />
                      <span className="min-w-0">
                        <span className="block text-sm leading-snug font-medium">{n.title}</span>
                        {n.detail && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{n.detail}</span>}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => onDismiss(n)}
                      className="absolute top-1.5 right-1 rounded p-1 text-muted-foreground opacity-60 hover:bg-background hover:text-foreground hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`Dismiss: ${n.title}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <button type="button" onClick={onHide} className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:text-foreground">
            <EyeOff className="size-3.5" /> Hide
          </button>
          {onMove && (
            <button type="button" onClick={onMove} className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:text-foreground" title="You can also drag him">
              <ArrowLeftRight className="size-3.5" /> Move {side === "right" ? "left" : "right"}
            </button>
          )}
        </span>
        <span>
          <kbd className="rounded border bg-muted px-1 font-sans text-[10px]">{hootShortcutLabel()}</kbd> to open
        </span>
      </div>
    </div>
  );
}
