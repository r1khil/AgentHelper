"use client";

import { use } from "react";
import Link from "next/link";
import { factorLines, type CalendarFactorContext } from "@/lib/economic-calendar/factor-lines";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import { isReleased } from "@/lib/economic-calendar/view";
import { cn } from "@/lib/utils";

/**
 * One line per rates-, dollar- or oil-moving release this week, with the viewer's book's beta where they may see
 * it, linking to the Exposure page's factor section. Descriptive only; it never suggests a trade.
 */
export function BookSensitivity({
  context,
  events,
  now,
  onPick,
}: {
  context: Promise<CalendarFactorContext>;
  events: EconomicEvent[];
  now: number;
  onPick: (e: EconomicEvent) => void;
}) {
  const ctx = use(context);
  const lines = factorLines(events, ctx.exposure);
  if (!lines.length) return null;
  const byId = new Map(events.map((e) => [e.id, e]));
  const caption =
    ctx.exposure && ctx.basis
      ? `With ${ctx.exposure.subject}'s factor betas over ${ctx.basis}. Betas with |t| below 2 read "no clear exposure". Past co-movement, not a forecast or a recommendation.`
      : "Which factors each release tends to move.";
  return (
    <section aria-label="Factor-sensitive releases" className="mb-5 rounded-xl border bg-card px-4 py-3 lg:pl-[18px]">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-xs leading-4 font-semibold text-foreground/70">Factor-sensitive releases</h2>
        {ctx.href && (
          <Link href={ctx.href} className="text-xs font-medium text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground">
            Factor exposure →
          </Link>
        )}
      </div>
      <ul className="grid gap-0.5">
        {lines.map((l) => {
          const e = byId.get(l.eventId)!;
          const out = isReleased(e, now);
          return (
            <li key={`${l.ruleKey}-${l.date}`}>
              <button
                type="button"
                onClick={() => onPick(e)}
                className={cn(
                  "tnum w-full rounded-sm py-1 text-left text-[13px] leading-5 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
                  out ? "text-muted-foreground" : "text-foreground",
                )}
              >
                <span className="font-medium">{l.head}</span>
                {l.clause && <span className={out ? undefined : "text-foreground/80"}> · {l.clause}</span>}
                {out && <span> · released</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </section>
  );
}
