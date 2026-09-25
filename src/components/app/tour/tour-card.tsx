"use client";

import { forwardRef, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Buttons are data; the tour handles every press in one place (`onAction`). */
export type CardAction = { id: string; label: string; icon?: React.ReactNode; variant?: "default" | "outline" | "ghost" };

export type CardView = {
  /** Changes whenever the card shows something new, so it re-arrives and takes focus. */
  key: string;
  eyebrow?: string;
  title: string;
  body?: string;
  points?: { label: string; text: string }[];
  what?: string;
  how?: string;
  source?: string;
  prompt?: string;
  /** Example questions; pressing one sends the action "example" with the question. */
  examples?: string[];
  /** Right-aligned buttons; the last one is the main action and takes focus. */
  actions: CardAction[];
  /** Small text buttons on the left: Back, Skip this page, End tour. */
  links?: CardAction[];
  footnote?: string;
};

export const TOUR_CARD_WIDTH = 360;

/**
 * Hoot's speech card. Every page section reads the same way: what it is, how it works, and where the data comes
 * from, so a reader learns where to look for each.
 */
export const TourCard = forwardRef<HTMLDivElement, { view: CardView; onAction: (id: string, arg?: string) => void; x: number; y: number; visible: boolean; glide: boolean }>(function TourCard(
  { view, onAction, x, y, visible, glide },
  ref,
) {
  const main = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (visible) main.current?.focus({ preventScroll: true });
  }, [visible, view.key]);

  const titleId = `tour-title-${view.key}`;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-hidden={!visible}
      className={cn(
        "fixed top-0 left-0 z-[930] rounded-2xl border bg-popover p-4 text-popover-foreground shadow-2xl",
        visible ? "tour-card-in" : "pointer-events-none opacity-0",
        glide && "transition-[translate] duration-300 ease-out",
      )}
      style={{ width: TOUR_CARD_WIDTH, maxWidth: "calc(100vw - 2rem)", translate: `${Math.round(x)}px ${Math.round(y)}px` }}
    >
      <div key={view.key}>
        {view.eyebrow && <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{view.eyebrow}</div>}
        <h2 id={titleId} className="text-[15px] leading-snug font-semibold text-balance">
          {view.title}
        </h2>
        {view.body && <p className="mt-1.5 text-sm leading-relaxed">{view.body}</p>}
        {view.points && (
          <dl className="mt-2 grid gap-1.5 text-sm leading-snug">
            {view.points.map((p) => (
              <div key={p.label}>
                <dt className="inline font-medium">{p.label}: </dt>
                <dd className="inline">{p.text}</dd>
              </div>
            ))}
          </dl>
        )}
        {(view.what || view.how || view.source) && (
          <dl className="mt-2.5 grid gap-2 text-sm leading-snug">
            {view.what && <Line label="What it is" text={view.what} />}
            {view.how && <Line label="How it works" text={view.how} />}
            {view.source && <Line label="Where the data comes from" text={view.source} />}
          </dl>
        )}
        {view.examples && (
          <div className="mt-2 flex flex-col items-start gap-1.5">
            {view.examples.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onAction("example", q)}
                className="rounded-lg border bg-background px-2.5 py-1.5 text-left text-xs leading-snug transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {view.prompt && <p className="mt-2.5 rounded-lg bg-muted px-2.5 py-1.5 text-sm font-medium">{view.prompt}</p>}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <div className="mr-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            {view.links?.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onAction(l.id)}
                className="rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {l.label}
              </button>
            ))}
          </div>
          {view.actions.map((a, i) => (
            <Button
              key={a.id}
              ref={i === view.actions.length - 1 ? main : undefined}
              type="button"
              size="sm"
              variant={a.variant ?? (i === view.actions.length - 1 ? "default" : "outline")}
              onClick={() => onAction(a.id)}
            >
              {a.icon}
              {a.label}
            </Button>
          ))}
        </div>
        {view.footnote && <p className="mt-2.5 text-xs text-muted-foreground">{view.footnote}</p>}
      </div>
    </div>
  );
});

function Line({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5">{text}</dd>
    </div>
  );
}
