"use client";

import { useActionState, useState, useTransition } from "react";
import { WandSparkles } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/holdings";
import { prefillBenchmarkWeights, saveBenchmarkWeights } from "@/lib/actions/ledger";
import { ETF_BY_SECTOR, GICS_SECTORS, SECTOR_LABELS, type GicsSector } from "@/lib/attribution/sectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

type Weights = Record<GicsSector, string>;

export function BenchmarkWeightsForm({ today, initial }: { today: string; initial: Partial<Record<GicsSector, number>> }) {
  const [weights, setWeights] = useState<Weights>(() => Object.fromEntries(GICS_SECTORS.map((s) => [s, initial[s]?.toString() ?? ""])) as Weights);
  const [source, setSource] = useState("");
  const [prefilling, startPrefill] = useTransition();
  const [, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const result = await saveBenchmarkWeights(prev, fd);
    if (result.ok) toast.success(result.message ?? "Saved");
    else toast.error(result.error);
    return result;
  }, null);

  const total = GICS_SECTORS.reduce((s, k) => s + (Number(weights[k]) || 0), 0);
  const balanced = Math.abs(total - 100) <= 0.1;

  return (
    <form action={action} className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="asOf">As of</Label>
          <Input id="asOf" name="asOf" type="date" defaultValue={today} max={today} className="w-40" required />
        </div>
        <div className="grid min-w-48 flex-1 gap-1.5">
          <Label htmlFor="source">Source</Label>
          <Input id="source" name="source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="S&P 500 factsheet, month-end" maxLength={200} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={prefilling}
          onClick={() =>
            startPrefill(async () => {
              const r = await prefillBenchmarkWeights();
              if (!r.ok) return void toast.error(r.error);
              setWeights(Object.fromEntries(GICS_SECTORS.map((s) => [s, r.weights[s].toString()])) as Weights);
              setSource("Yahoo Finance, SPY sector weightings");
              toast.message("Filled from SPY. Check against the S&P factsheet before saving.");
            })
          }
        >
          <WandSparkles />
          {prefilling ? "Fetching…" : "Prefill from SPY"}
        </Button>
      </div>

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {GICS_SECTORS.map((s) => (
          <div key={s} className="flex items-center justify-between gap-3">
            <Label htmlFor={`w_${s}`} className="min-w-0 font-normal">
              <span className="truncate">{SECTOR_LABELS[s]}</span>
              <span className="text-body text-muted-foreground">{ETF_BY_SECTOR[s]}</span>
            </Label>
            <div className="flex items-center gap-1">
              <Input
                id={`w_${s}`}
                name={`w_${s}`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                value={weights[s]}
                onChange={(e) => setWeights((w) => ({ ...w, [s]: e.target.value }))}
                className="tnum h-8 w-24 text-right"
                required
              />
              <span className="text-body text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <span className={cn("tnum text-body", balanced ? "text-muted-foreground" : "text-down")}>
          Total {fmtPct(total)}{!balanced && " · must equal 100%"}
        </span>
        <Button type="submit" size="sm" disabled={pending || !balanced}>{pending ? "Saving…" : "Save weights"}</Button>
      </div>
    </form>
  );
}
