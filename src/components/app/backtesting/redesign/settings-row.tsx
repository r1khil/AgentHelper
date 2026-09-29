"use client";

import { ChevronDown, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BENCHMARKS } from "@/lib/backtesting/engine";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SaveScenarioFields } from "../saved-scenarios";
import type { BacktestingState, Benchmark } from "../use-backtesting";
import { DATES_HINT, METHOD_LINE } from "../workspace";

const chip = "flex h-[30px] items-center gap-1.5 rounded-md bg-secondary px-2.5 text-body whitespace-nowrap text-foreground";

/**
 * The replay's settings inline under the big number: which scenario, the window, how it is rebalanced and what it is
 * compared to, then Reset, Run replay and Save. The window and the benchmark change in place; rebalancing is fixed by
 * the engine (every day), shown so the replay says what it did.
 */
export function SettingsRow({ bt, maxDate, scenarioName, saveAudience }: { bt: BacktestingState; maxDate: string; scenarioName: string; saveAudience?: string }) {
  const { valid, busy, lookupBusy } = bt;
  return (
    <div className="mt-[18px] flex flex-wrap items-center gap-2">
      <span className={chip} title="The weights in the table below, against today's weights">
        <span className="text-muted-foreground">Scenario</span>
        <b className="max-w-72 truncate font-semibold">{scenarioName}</b>
      </span>
      <Popover>
        <PopoverTrigger className={cn(chip, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")} title={DATES_HINT}>
          <span className="text-muted-foreground">Window</span>
          <b className="font-semibold">
            {fmtDate(bt.from)} – {fmtDate(bt.to)}
          </b>
          <ChevronDown className="size-2.5" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto gap-2 p-3">
          <div className="flex items-center gap-2">
            <Input aria-label="Start date" type="date" value={bt.from} max={bt.to} required onChange={(e) => bt.setFrom(e.target.value)} className="h-8 w-40 text-body" />
            <span className="text-body text-muted-foreground">to</span>
            <Input aria-label="End date" type="date" value={bt.to} min={bt.from} max={maxDate} required onChange={(e) => bt.setTo(e.target.value)} className="h-8 w-40 text-body" />
          </div>
          <p className="max-w-[26rem] text-caption text-muted-foreground">{DATES_HINT}</p>
        </PopoverContent>
      </Popover>
      <span className={chip} title={METHOD_LINE}>
        <span className="text-muted-foreground">Rebalancing</span>
        <b className="font-semibold">Daily</b>
      </span>
      <label className={cn(chip, "relative pr-6 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring")} title={BENCHMARKS[bt.benchmark]}>
        <span className="text-muted-foreground">Compare to</span>
        <select
          aria-label="Benchmark"
          value={bt.benchmark}
          onChange={(e) => bt.setBenchmark(e.target.value as Benchmark)}
          className="appearance-none border-0 bg-transparent font-semibold outline-none"
        >
          {Object.entries(BENCHMARKS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 size-2.5" aria-hidden />
      </label>
      <span className="flex-1" />
      <Button type="button" variant="secondary" disabled={lookupBusy} onClick={bt.resetWeights}>
        <RotateCcw aria-hidden />
        Reset
      </Button>
      {saveAudience && (
        <Popover>
          <PopoverTrigger render={<Button type="button" variant="secondary" data-tour="bt-save" />}>Save scenario</PopoverTrigger>
          <PopoverContent align="end" className="w-[380px] gap-3 p-4 [&_input]:max-w-none">
            <SaveScenarioFields onSave={bt.save} disabled={!bt.valid} audience={saveAudience} />
          </PopoverContent>
        </Popover>
      )}
      <Button type="submit" data-tour="bt-run" disabled={!valid || busy}>
        <Play aria-hidden />
        {busy ? "Replaying…" : "Run replay"}
      </Button>
    </div>
  );
}
