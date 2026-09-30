"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fixed, fmtPct } from "@/lib/format";
import { setScreenerDiscountRateAction } from "@/lib/actions/screener-discount-rate";

/** Execs and admins: the fund-wide discount rate every reverse DCF uses. */
export function DiscountRateControl({ rate }: { rate: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(Number(fixed(rate * 100, 2))));
  const [pending, start] = useTransition();
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="font-semibold text-foreground hover:underline">
        Change the fund&apos;s rate ({fmtPct(rate * 100, 1)})
      </button>
    );
  return (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setScreenerDiscountRateAction(Number(value));
          if (r.ok) {
            toast.success(`Discount rate set to ${fmtPct(r.rate * 100, 1)} for every company.`);
            setEditing(false);
          } else toast.error(r.error);
        });
      }}
    >
      <label htmlFor="discount-rate" className="text-caption text-muted-foreground">
        Fund-wide discount rate (%)
      </label>
      <Input id="discount-rate" type="number" step="0.25" min="4" max="20" value={value} onChange={(e) => setValue(e.target.value)} className="h-[30px] w-20" />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}
