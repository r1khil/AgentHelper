import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { calendarHref, type CalendarEvent, type CalendarQuery, type MonthGrid } from "@/lib/earnings-calendar";
import { Badge } from "@/components/ui/badge";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MAX_CHIPS = 4;

export function EarningsCalendar({
  base,
  query,
  grid,
  byDate,
  today,
  selected,
  accessibleTeamIds,
}: {
  base: string;
  query: CalendarQuery;
  grid: MonthGrid;
  byDate: Map<string, CalendarEvent[]>;
  today: string;
  selected: string;
  accessibleTeamIds: string[];
}) {
  const accessible = new Set(accessibleTeamIds);
  const navClass = "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link href={calendarHref(base, { ...query, month: grid.prevMonth, day: undefined })} aria-label="Previous month" className={navClass}>
            <ChevronLeft className="size-4" />
          </Link>
          <h2 className="min-w-32 text-center text-sm font-semibold">{grid.label}</h2>
          <Link href={calendarHref(base, { ...query, month: grid.nextMonth, day: undefined })} aria-label="Next month" className={navClass}>
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-primary" /> Holding
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full border border-foreground/60" /> Sector bellwether
          </span>
          <Link href={calendarHref(base, { ...query, month: today.slice(0, 7), day: today })} className="font-medium text-foreground hover:underline">
            Today
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-px overflow-hidden rounded-lg border bg-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {grid.weeks.flat().map((day) => {
          const events = byDate.get(day.date) ?? [];
          const dayHref = calendarHref(base, { ...query, day: day.date });
          const muted = !day.inMonth || !day.trading;
          return (
            <div
              key={day.date}
              className={cn(
                "min-h-24 bg-background p-1.5",
                muted && "bg-muted/40",
                day.date === selected && "bg-accent",
                day.date === today && "ring-1 ring-primary ring-inset",
              )}
            >
              <Link
                href={dayHref}
                aria-label={day.date}
                aria-current={day.date === selected ? "date" : undefined}
                className={cn("tnum inline-flex size-6 items-center justify-center rounded-md text-xs font-medium hover:bg-muted", muted && "text-muted-foreground", day.date === today && "bg-primary text-primary-foreground hover:bg-primary/90")}
              >
                {Number(day.date.slice(8))}
              </Link>
              {events.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {events.slice(0, MAX_CHIPS).map((ev) => (
                    <Chip key={`${ev.kind}:${ev.ticker}`} ev={ev} dayHref={dayHref} linkable={ev.kind === "holding" && !!ev.teamId && accessible.has(ev.teamId)} />
                  ))}
                  {events.length > MAX_CHIPS && (
                    <Link href={dayHref} className="self-center text-xs text-muted-foreground hover:underline">
                      +{events.length - MAX_CHIPS}
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ ev, dayHref, linkable }: { ev: CalendarEvent; dayHref: string; linkable: boolean }) {
  const href = linkable && ev.teamSlug && ev.earningsId ? `/t/${ev.teamSlug}/earnings/${ev.earningsId}` : dayHref;
  const title = ev.kind === "holding" ? `${ev.name}${ev.teamName ? ` · ${ev.teamName}` : ""}` : `${ev.name} · ${ev.etf} constituent`;
  return (
    <Badge variant={ev.kind === "holding" ? "default" : "outline"} render={<Link href={href} title={title} />}>
      {ev.ticker}
    </Badge>
  );
}
