"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { periodOptions, type PeriodKey } from "@/lib/attribution/periods";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Mono segment labels. The URL keys (`?period=7d`, `itd`, …) are unchanged. */
const SEGMENT_LABELS: Record<PeriodKey, string> = {
  "1d": "1D",
  "7d": "1W",
  "1m": "1M",
  "6m": "6M",
  ytd: "YTD",
  "1y": "1Y",
  itd: "SINCE INCEPTION",
  custom: "CUSTOM",
};

const segment = (active: boolean) =>
  cn(
    "flex h-7 items-center rounded-full px-3 font-mono text-xs whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    active ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(60,40,20,.08)]" : "text-muted-foreground hover:text-foreground",
  );

/** Round mono period control. "Custom" opens the from/to form in a popover. */
export function PeriodSelector({ basePath, active, from, to, inception, latest }: { basePath: string; active: PeriodKey; from?: string; to?: string; inception: string; latest: string }) {
  const [open, setOpen] = useState(false);
  const options = periodOptions({ inception, latest });
  return (
    <div role="group" aria-label="Period" className="inline-flex shrink-0 items-center rounded-full bg-muted p-0.5">
      {options.map(({ key: k, clamped }) => (
        <Link
          key={k}
          href={`${basePath}?period=${k}`}
          scroll={false}
          aria-current={active === k ? "true" : undefined}
          title={clamped ? `The ledger starts ${fmtDate(inception)}, so this shows results since then` : undefined}
          className={segment(active === k)}
        >
          {SEGMENT_LABELS[k]}
        </Link>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger aria-current={active === "custom" ? "true" : undefined} className={segment(active === "custom")}>
          {SEGMENT_LABELS.custom}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto rounded-[14px] p-3">
          <form action={basePath} className="flex items-center gap-1.5" onSubmit={() => setOpen(false)}>
            <input type="hidden" name="period" value="custom" />
            <Input type="date" name="from" min={inception} max={latest} defaultValue={active === "custom" ? from : undefined} aria-label="From" className="h-8 w-36 font-mono text-xs" required />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" name="to" min={inception} max={latest} defaultValue={active === "custom" ? to : undefined} aria-label="To" className="h-8 w-36 font-mono text-xs" />
            <Button type="submit" size="sm" variant={active === "custom" ? "default" : "outline"}>Apply</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Measured from the close before the first day. The ledger starts {fmtDate(inception)}.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
