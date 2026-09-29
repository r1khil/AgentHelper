"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { periodOptions, type PeriodKey } from "@/lib/attribution/periods";
import { fmtDate, fmtDayMonth } from "@/lib/format";
import { Segmented, segmentClass } from "@/components/app/panel";

/** "today" is the live session (the Daily numbers); every other key is a closed period, as in the URL (`?period=7d`). */
export type ViewPeriodKey = PeriodKey | "today";
export const TODAY_KEY = "today";

const SEGMENT_LABELS: Record<Exclude<PeriodKey, "itd">, string> = {
  "1d": "1D",
  "7d": "1W",
  "1m": "1M",
  "6m": "6M",
  ytd: "YTD",
  "1y": "1Y",
  custom: "Custom",
};

/**
 * The period buttons under Performance's chart: Today (live), the closed presets, "Since Sep 17" for the whole ledger,
 * and Custom, which opens the from/to form in a popover.
 */
export function PeriodSelector({ basePath, active, from, to, inception, latest }: { basePath: string; active: ViewPeriodKey; from?: string; to?: string; inception: string; latest: string }) {
  const [open, setOpen] = useState(false);
  const options = periodOptions({ inception, latest });
  return (
    <Segmented
      label="Period"
      segments={[
        { key: TODAY_KEY, label: "Today", href: `${basePath}?period=${TODAY_KEY}`, active: active === TODAY_KEY, title: "Live prices for the current session, refreshed as it trades" },
        ...options.map(({ key: k, clamped }) => ({
          key: k,
          label: k === "itd" ? `Since ${fmtDayMonth(inception)}` : SEGMENT_LABELS[k],
          href: `${basePath}?period=${k}`,
          active: active === k,
          title: clamped ? `The ledger starts ${fmtDate(inception)}, so this shows results since then` : undefined,
        })),
      ]}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger aria-current={active === "custom" ? "true" : undefined} className={segmentClass(active === "custom")}>
          {SEGMENT_LABELS.custom}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <form action={basePath} className="flex items-center gap-1.5" onSubmit={() => setOpen(false)}>
            <input type="hidden" name="period" value="custom" />
            <Input type="date" name="from" min={inception} max={latest} defaultValue={active === "custom" ? from : undefined} aria-label="From" className="h-8 w-36 text-body" required />
            <span className="text-body text-muted-foreground">to</span>
            <Input type="date" name="to" min={inception} max={latest} defaultValue={active === "custom" ? to : undefined} aria-label="To" className="h-8 w-36 text-body" />
            <Button type="submit" size="sm" variant={active === "custom" ? "default" : "secondary"}>Apply</Button>
          </form>
          <p className="mt-2 text-caption text-muted-foreground">Measured from the close before the first day. The ledger starts {fmtDate(inception)}.</p>
        </PopoverContent>
      </Popover>
    </Segmented>
  );
}
