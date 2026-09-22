"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RangeControlGroup, rangeControlClass } from "@/components/charts/primitives";
import { PERIOD_LABELS, periodOptions, type PeriodKey } from "@/lib/attribution/periods";
import { fmtDate } from "@/lib/format";

/** Segmented period control; "Custom" reveals the date form beneath it. */
export function PeriodSelector({ basePath, active, from, to, inception, latest }: { basePath: string; active: PeriodKey; from?: string; to?: string; inception: string; latest: string }) {
  const [showCustom, setShowCustom] = useState(false);
  const custom = active === "custom" || showCustom;
  const options = periodOptions({ inception, latest });
  const activeClamped = options.find((o) => o.key === active)?.clamped;
  return (
    <div className="grid gap-2">
      <RangeControlGroup label="Period">
        {options.map(({ key: k, clamped }) => (
          <Link
            key={k}
            href={`${basePath}?period=${k}`}
            aria-current={active === k ? "true" : undefined}
            title={clamped ? `The ledger starts ${fmtDate(inception)}, so this shows results since then` : undefined}
            className={rangeControlClass(active === k)}
          >
            {k === "itd" ? "All" : PERIOD_LABELS[k]}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={custom}
          aria-current={active === "custom" ? "true" : undefined}
          onClick={() => setShowCustom((v) => !v)}
          className={`${rangeControlClass(active === "custom")} inline-flex items-center gap-1.5`}
        >
          <CalendarRange className="size-3.5" aria-hidden />
          Custom
        </button>
      </RangeControlGroup>
      {activeClamped && (
        <p className="text-xs text-muted-foreground">
          The ledger starts {fmtDate(inception)}, so {PERIOD_LABELS[active]} shows results since then.
        </p>
      )}
      {custom && (
        <form action={basePath} className="flex max-w-full flex-wrap items-center gap-1.5">
          <input type="hidden" name="period" value="custom" />
          <Input type="date" name="from" min={inception} max={latest} defaultValue={active === "custom" ? from : undefined} aria-label="From" className="h-8 w-36" required />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" name="to" min={inception} max={latest} defaultValue={active === "custom" ? to : undefined} aria-label="To" className="h-8 w-36" />
          <Button type="submit" size="sm" variant={active === "custom" ? "default" : "outline"}>Apply</Button>
        </form>
      )}
    </div>
  );
}
