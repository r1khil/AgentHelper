import Link from "next/link";
import { daysAway, longDate, weekDayLabel } from "@/lib/today";
import type { AgendaItem } from "./types";

/**
 * "This week": earnings dates for the reader's teams in the coming seven days (and the Sunday weekly pack for execs and
 * admins), a day, what, and how far away; what's left beyond the week is counted under it.
 */
export function ComingUp({ items, today, moreCount, lastDate, calendarHref }: { items: AgendaItem[]; today: string; moreCount: number; lastDate: string | null; calendarHref: string }) {
  return (
    <section aria-labelledby="h-week" data-tour="today-next">
      <div className="flex items-baseline justify-between border-b pb-1.5">
        <h2 id="h-week" className="text-body font-bold">
          This week
        </h2>
        <Link href={calendarHref} className="text-caption text-ink-2 hover:text-foreground">
          Calendar
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="py-2.5 text-body text-muted-foreground">Nothing scheduled in the next seven days.</p>
      ) : (
        <ul>
          {items.map((i) => (
            // A long day (several reports) wraps to a second line rather than cutting off tickers.
            <li key={`${i.date}-${i.text}`} className="grid min-h-[38px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2 border-b border-row py-1.5 text-body">
              <span className="text-caption text-muted-foreground">{weekDayLabel(today, i.date)}</span>
              <span className="text-pretty">{i.text}</span>
              <span className="text-caption whitespace-nowrap text-muted-foreground">{daysAway(today, i.date)}</span>
            </li>
          ))}
        </ul>
      )}
      {moreCount > 0 && lastDate && (
        <p className="mt-1.5 text-caption text-muted-foreground" title="Dates marked est. are not confirmed.">
          +{moreCount} more {moreCount === 1 ? "report" : "reports"} through {longDate(lastDate)}
        </p>
      )}
    </section>
  );
}
