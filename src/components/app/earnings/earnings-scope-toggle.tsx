import Link from "next/link";
import { cn } from "@/lib/utils";
import { CALENDAR_VIEWS, VIEW_LABELS, calendarHref, type CalendarQuery } from "@/lib/earnings-calendar";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";

/** Fund / Sector / Industry switch, plus the industry picker when that view is active. */
export function EarningsScopeToggle({ base, query, industries }: { base: string; query: CalendarQuery; industries: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex h-8 items-center rounded-lg bg-muted p-[3px] text-sm" role="group" aria-label="Scope">
        {CALENDAR_VIEWS.map((v) => (
          <Link
            key={v}
            href={calendarHref(base, { ...query, view: v })}
            aria-current={query.view === v ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-0.5 font-medium whitespace-nowrap text-foreground/60 hover:text-foreground",
              query.view === v && "bg-background text-foreground shadow-sm",
            )}
          >
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </div>
      {query.view === "industry" && (
        <form action={base} className="flex items-center gap-1.5">
          <input type="hidden" name="view" value="industry" />
          <input type="hidden" name="month" value={query.month} />
          {query.day && <input type="hidden" name="day" value={query.day} />}
          <NativeSelect name="industry" defaultValue={query.industry ?? ""} aria-label="Industry" className="h-8 w-60">
            <option value="">Choose an industry</option>
            {industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" size="sm" variant="outline">
            Show
          </Button>
        </form>
      )}
    </div>
  );
}
