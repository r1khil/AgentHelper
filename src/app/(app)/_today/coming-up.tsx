import Link from "next/link";
import { agendaDate, daysAway, longDate } from "@/lib/today";
import { Panel, PanelHeader } from "@/components/app/panel";
import type { AgendaItem } from "./types";

/** Earnings dates for the reader's teams (and the Sunday weekly pack for execs), with what's left counted below. */
export function ComingUp({ items, today, moreCount, lastDate, calendarHref }: { items: AgendaItem[]; today: string; moreCount: number; lastDate: string | null; calendarHref: string }) {
  return (
    <Panel data-tour="today-next" aria-label="Coming up" className="flex-1">
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
            <Link href={calendarHref} className="text-[13px] font-semibold text-foreground hover:underline">
              Calendar →
            </Link>
          </>
        }
      />
      {items.length === 0 ? (
        <p className="px-[18px] py-3.5 text-[13.5px] text-muted-foreground">No earnings dates yet. They refresh every morning for each holding.</p>
      ) : (
        <ul className="flex flex-1 flex-col">
          {items.map((i) => (
            <li key={`${i.date}-${i.text}`} className="grid max-h-14 min-h-[42px] flex-1 grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-row px-[18px] text-[13.5px] last:border-b-0">
              <span className="font-mono text-[12.5px] font-semibold">{agendaDate(i.date)}</span>
              <span className="truncate" title={i.text}>
                {i.text}
              </span>
              <span className="text-xs whitespace-nowrap text-muted-foreground">{daysAway(today, i.date)}</span>
            </li>
          ))}
          <li aria-hidden className="flex-1" />
        </ul>
      )}
    </Panel>
  );
}
