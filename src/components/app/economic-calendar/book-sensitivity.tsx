"use client";

import { use } from "react";
import Link from "next/link";
import { factorLines, type CalendarFactorContext } from "@/lib/economic-calendar/factor-lines";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import { isReleased } from "@/lib/economic-calendar/view";
import { cn } from "@/lib/utils";

/**
 * One line per rates-, dollar- or oil-moving release this week, with the viewer's book's beta where they may see
 * it, linking to the Exposure page's factor section. Descriptive only; it never suggests a trade. The what's-new
 * tour points at this panel by its aria-label.
 */
export function BookSensitivity({
  context,
  events,
  now,
  onPick,
  className,
}: {
  context: Promise<CalendarFactorContext>;
  events: EconomicEvent[];
  now: number;
  onPick: (e: EconomicEvent) => void;
  /** Markets shows it as a card in the right rail. */
  className?: string;
}) {
  const ctx = use(context);
  const lines = factorLines(events, ctx.exposure);
  if (!lines.length) return null;
  const byId = new Map(events.map((e) => [e.id, e]));
  const caption = ctx.exposure ? `Open one for ${ctx.exposure.subject}'s beta. Past co-movement, not a forecast.` : "Which factors each release tends to move.";
  return (
    <section aria-label="Factor-sensitive releases" className={className}>
      <h2 className="text-body font-semibold">Factor-sensitive releases</h2>
      {/* One line each; the book's exposure for a release is in that release's details (click the line). */}
      <ul className="mt-1 flex flex-col">
        {lines.map((l) => {
          const e = byId.get(l.eventId)!;
          const out = isReleased(e, now);
          return (
            <li key={`${l.ruleKey}-${l.date}`} className="border-t border-row first:border-t-0">
              <button
                type="button"
                onClick={() => onPick(e)}
                title={l.text}
                className={cn("block w-full py-1.5 text-left text-body text-pretty outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring", out ? "text-muted-foreground" : "text-foreground")}
              >
                <span className="font-medium">{l.head}</span>
                {out && <span>, released</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-caption text-muted-foreground">
        {caption}
        {ctx.href && (
          <>
            {" "}
            <Link href={ctx.href} className="whitespace-nowrap text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground">
              Factor exposure →
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

/** The factor line for one release, with the book's exposure, for the release's details. */
export function FactorClause({ context, event }: { context: Promise<CalendarFactorContext>; event: EconomicEvent }) {
  const ctx = use(context);
  const line = factorLines([event], ctx.exposure)[0];
  if (!line) return null;
  return (
    <p className="mt-2.5 text-body text-ink-2">
      {line.text}
      {ctx.exposure && ctx.basis && (
        <span className="block text-muted-foreground">
          {`With ${ctx.exposure.subject}'s factor betas over ${ctx.basis}. Betas with |t| below 2 read "no clear exposure". Past co-movement, not a forecast or a recommendation.`}
        </span>
      )}
    </p>
  );
}
