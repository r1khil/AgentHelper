import Link from "next/link";
import type { WeekRelease } from "@/lib/portfolio/week";
import { daysAway, longDate, weekDayLabel } from "@/lib/today";
import type { AgendaItem } from "./types";

type Props = { items: AgendaItem[]; today: string; moreCount: number; lastDate: string | null; calendarHref: string; releasesUnavailable?: boolean };

/**
 * "This week": earnings dates for the reader's teams and the big economic releases in the coming seven days (and the
 * Sunday weekly pack for execs and admins), a day, what, and how far away; reports left beyond the week are counted under it.
 */
export function ComingUp({ items, today, moreCount, lastDate, calendarHref, releasesUnavailable }: Props) {
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
              <span className="text-pretty">
                {i.text}
                {i.when && <span className="text-caption whitespace-nowrap text-muted-foreground"> · {i.when}</span>}
              </span>
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
      {releasesUnavailable && <p className="mt-1.5 text-caption text-caution-foreground">The economic calendar could not be loaded, so releases are missing.</p>}
    </section>
  );
}

/** "This week" once the economic releases have loaded: they join the earnings in date and time order. */
export async function ComingUpWithReleases({ releases, items, ...rest }: Props & { releases: Promise<WeekRelease[] | null> }) {
  const loaded = await releases;
  const merged = [...items, ...(loaded ?? []).map((r) => ({ date: r.date, text: r.text, when: r.when, sort: r.sort }))].sort((a, b) => a.sort.localeCompare(b.sort));
  return <ComingUp {...rest} items={merged} releasesUnavailable={loaded === null} />;
}
