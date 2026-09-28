"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Activity, ArrowLeftRight, ArrowUp, CalendarDays, CalendarRange, Eye, EyeOff, FileText, Mic, Sparkles, UserX, X } from "lucide-react";
import type { HootNudge, NudgeKind } from "@/lib/hoot/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isMac } from "@/lib/hoot/shortcuts";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<NudgeKind, React.ComponentType<{ className?: string }>> = {
  movement: Activity,
  holdings: UserX,
  earnings: CalendarDays,
  sell_side: Mic,
  proposal: FileText,
  weekly: CalendarRange,
  changelog: Sparkles,
  tip: Sparkles,
};

export const shortcutLabel = () => (isMac() ? "⌥S / ⌘S" : "Alt S");

/** What opens when you click Hoot: ask him a research question, see what needs you, or send him away. */
export function HootPanel({
  greeting,
  suggestions,
  scopeHint,
  seeing,
  nudges,
  loading,
  asking,
  askError,
  onAsk,
  onOpenNudge,
  onDismiss,
  onHide,
  onMove,
  side,
  onClose,
}: {
  greeting: string;
  suggestions: string[];
  /** Where the question will go when it isn't a general conversation, e.g. "NVDA's research board". */
  scopeHint: string | null;
  /** What on this page goes along with the question, e.g. "Fund attribution · 1D". */
  seeing?: string | null;
  nudges: HootNudge[];
  loading: boolean;
  asking: boolean;
  askError: string | null;
  onAsk: (text: string) => void;
  onOpenNudge: (n: HootNudge) => void;
  onDismiss: (n: HootNudge) => void;
  onHide: () => void;
  /** Send Hoot to the other bottom corner (he can also be dragged there). */
  onMove: () => void;
  side: "left" | "right";
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    if (text.trim() && !asking) onAsk(text.trim());
  };

  return (
    <div className="flex max-h-[min(34rem,calc(100dvh-8rem))] flex-col">
      <div className="flex items-start gap-3 border-b px-4 pt-3.5 pb-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{greeting}</div>
          <div className="text-xs text-muted-foreground">Ask a research question, change the theme, or open a page.</div>
        </div>
        <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      <div className="overflow-y-auto">
        <form
          className="px-4 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="hoot-ask" className="sr-only">
            Ask Hoot
          </label>
          <div className="relative">
            <Textarea
              id="hoot-ask"
              ref={box}
              value={text}
              autoFocus
              rows={2}
              disabled={asking}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Try “turn on light mode” or “take me to holdings”…"
              className="min-h-16 resize-none pr-11 text-sm"
            />
            <Button type="submit" size="icon" className="absolute right-2 bottom-2 size-7" disabled={!text.trim() || asking} aria-label="Ask">
              <ArrowUp className="size-4" />
            </Button>
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            {asking ? "Opening a chat…" : `Research questions open a new ${scopeHint ? `chat on ${scopeHint}` : "conversation"}${seeing ? ", with this page attached" : ""}.`}
          </div>
          {seeing && !asking && (
            <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
              <Eye className="size-3 shrink-0" aria-hidden />
              <span className="truncate">Hoot can see: {seeing}</span>
            </div>
          )}
          {askError && <div className="mt-1.5 text-xs text-destructive">{askError}</div>}
          <div className="mt-2.5 flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setText(s);
                  box.current?.focus();
                }}
                className="rounded-md border px-2.5 py-1.5 text-left text-xs leading-snug text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </form>

        <div className="px-4 pt-4 pb-2">
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
          <button type="button" onClick={onMove} className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:text-foreground" title="You can also drag him">
            <ArrowLeftRight className="size-3.5" /> Move {side === "right" ? "left" : "right"}
          </button>
        </span>
        <span>
          <kbd className="rounded border bg-muted px-1 font-sans text-[10px]">{shortcutLabel()}</kbd> to open
        </span>
      </div>
    </div>
  );
}
