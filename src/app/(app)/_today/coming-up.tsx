import Link from "next/link";
import { agendaDate, daysAway, longDate } from "@/lib/today";
import { Panel, PanelHeader } from "@/components/app/panel";
import type { AgendaItem } from "./types";

/** Earnings dates for the reader's teams (and the Sunday weekly pack for execs), with what's left counted below. */
export function ComingUp({ items, today, moreCount, lastDate, calendarHref }: { items: AgendaItem[]; today: string; moreCount: number; lastDate: string | null; calendarHref: string }) {
  return (
    <Panel data-tour="today-next" aria-label="Coming up" variant="plain">
      <PanelHeader
        title="Coming up"
        className="px-[18px]"
        aside={
          <>
            {moreCount > 0 && lastDate && (
              <span title={`${moreCount} more ${moreCount === 1 ? "report" : "reports"} through ${longDate(lastDate)}. Dates marked est. are not confirmed.`}>
                +{moreCount} more through {longDate(lastDate)}
              </span>
            )}
            <Link href={calendarHref} className="text-body font-semibold text-foreground hover:underline">
              Calendar →
            </Link>
          </>
        }
      />
      {items.length === 0 ? (
        <p className="px-[18px] py-3.5 text-body text-muted-foreground">No earnings dates yet. They refresh every morning for each holding.</p>
      ) : (
        <ul className="flex flex-col pb-1">
          {items.map((i) => (
            // A long day (several reports) wraps to a second line rather than cutting off tickers.
            <li key={`${i.date}-${i.text}`} className="grid min-h-[38px] grid-cols-[84px_minmax(0,1fr)_auto] items-baseline gap-2.5 px-[18px] py-[9px] text-body">
              <span className="font-mono text-body font-semibold">{agendaDate(i.date)}</span>
              <span className="text-pretty">{i.text}</span>
              <span className="text-body whitespace-nowrap text-muted-foreground">{daysAway(today, i.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
