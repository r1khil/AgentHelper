import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RangeControlGroup, rangeControlClass } from "@/components/charts/primitives";
import { PERIOD_LABELS, availablePeriods, type PeriodKey } from "@/lib/attribution/periods";

export function PeriodSelector({ basePath, active, from, to, inception, latest }: { basePath: string; active: PeriodKey; from?: string; to?: string; inception: string; latest: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RangeControlGroup label="Period">
        {availablePeriods({ inception, latest }).map((k) => (
          <Link
            key={k}
            href={`${basePath}?period=${k}`}
            aria-current={active === k ? "true" : undefined}
            className={rangeControlClass(active === k)}
          >
            {k === "itd" ? "All" : PERIOD_LABELS[k]}
          </Link>
        ))}
      </RangeControlGroup>
      <form action={basePath} className="flex max-w-full flex-wrap items-center gap-1.5">
        <input type="hidden" name="period" value="custom" />
        <Input type="date" name="from" min={inception} max={latest} defaultValue={active === "custom" ? from : undefined} aria-label="From" className="h-8 w-36" required />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" name="to" min={inception} max={latest} defaultValue={active === "custom" ? to : undefined} aria-label="To" className="h-8 w-36" />
        <Button type="submit" size="sm" variant={active === "custom" ? "default" : "outline"}>Apply</Button>
      </form>
    </div>
  );
}
