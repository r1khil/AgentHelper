import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/attribution/periods";

const PRESETS: PeriodKey[] = ["1d", "7d", "mtd", "qtd", "ytd", "1y", "itd"];

export function PeriodSelector({ basePath, active, from, to }: { basePath: string; active: PeriodKey; from?: string; to?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex h-8 items-center rounded-lg bg-muted p-[3px] text-sm" role="group" aria-label="Period">
        {PRESETS.map((k) => (
          <Link
            key={k}
            href={`${basePath}?period=${k}`}
            aria-current={active === k ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-0.5 font-medium whitespace-nowrap text-foreground/60 hover:text-foreground",
              active === k && "bg-background text-foreground shadow-sm",
            )}
          >
            {k === "itd" ? "All" : PERIOD_LABELS[k]}
          </Link>
        ))}
      </div>
      <form action={basePath} className="flex items-center gap-1.5">
        <input type="hidden" name="period" value="custom" />
        <Input type="date" name="from" defaultValue={active === "custom" ? from : undefined} aria-label="From" className="h-8 w-36" required />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" name="to" defaultValue={active === "custom" ? to : undefined} aria-label="To" className="h-8 w-36" />
        <Button type="submit" size="sm" variant={active === "custom" ? "default" : "outline"}>Apply</Button>
      </form>
    </div>
  );
}
