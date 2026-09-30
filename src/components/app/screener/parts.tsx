import { cn } from "@/lib/utils";
import type { ScreenerScope } from "@/app/(app)/screener/load";
import type { ScreenerQuery } from "@/app/(app)/screener/types";

/** One company's Screener page. */
export const companyHref = (ticker: string, tab?: string) => `/screener/${encodeURIComponent(ticker)}${tab ? `?tab=${tab}` : ""}`;

/**
 * A Screener list with its rail: the list in a flexible column and, when there is one, the 300px rail 36px to its
 * right (Markets' layout).
 */
export function ScreenerFrame({ rail, children }: { q?: ScreenerQuery; scope?: ScreenerScope; rail?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-9">
      <div className="min-w-0 flex-1">{children}</div>
      {rail && (
        <aside aria-label="About this list" className="flex w-[300px] shrink-0 flex-col gap-[18px]">
          {rail}
        </aside>
      )}
    </div>
  );
}

/** The sentence a list opens with: what it is and how to read it. */
export function Lede({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn("max-w-[72ch] text-emph text-ink-2", className)}>{children}</p>;
}

export type Tone = "grey" | "ink" | "caution" | "down" | "up";
const TONE: Record<Tone, string> = { grey: "text-muted-foreground", ink: "text-foreground", caution: "text-caution-foreground", down: "text-down", up: "text-up" };

/** A status is a word in 12px semibold, coloured by tone: never a dot or a pill. */
export function StatusWord({ tone = "grey", title, children }: { tone?: Tone; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={cn("text-caption font-semibold whitespace-nowrap", TONE[tone])}>
      {children}
    </span>
  );
}

/** A section of a Screener page: a 17px title with an optional grey aside, then its content. */
export function Section({ id, title, aside, className, children }: { id: string; title: React.ReactNode; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn("mt-9 first:mt-0", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={id} className="text-title font-bold tracking-[-0.01em]">
          {title}
        </h2>
        {aside && <span className="text-body text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
