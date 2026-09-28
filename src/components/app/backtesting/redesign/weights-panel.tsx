"use client";

import { useState, type ReactNode } from "react";
import { Calendar, ChevronDown, CircleMinus, Play, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BENCHMARKS, type Position } from "@/lib/backtesting/engine";
import { fmtBp, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useQuickTrade } from "../quick-trade";
import { SaveScenarioFields } from "../saved-scenarios";
import type { BacktestingState, Benchmark } from "../use-backtesting";
import { ADD_HINT, DATES_HINT } from "../workspace";

// The redesign's left panel: the question, where the scenario came from, dates and benchmark, a one-line quick trade,
// and every holding's weight (rows scroll inside the panel), with Run replay and Save in the footer band.

const COLS = "grid grid-cols-[minmax(0,1fr)_72px_92px_70px] gap-2.5";
const field = "h-[34px] rounded-lg bg-card shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_1px_var(--border-strong)]";
const miniSelect =
  "h-7 appearance-none rounded-lg border-0 bg-card pr-5 pl-2 text-body shadow-[0_0_0_1px_var(--border)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const noSpin = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** A weight change in basis points, e.g. "(100 bp)"; a change under half a basis point reads as unchanged. */
function changeBp(v: number) {
  const bp = Math.round(v * 10_000);
  return bp === 0 ? null : fmtBp(bp);
}

export function WeightsPanel({
  bt,
  maxDate,
  banner,
  teams,
  saveAudience,
  layoutSwitch,
}: {
  bt: BacktestingState;
  /** The last completed session: the latest end date allowed. */
  maxDate: string;
  banner?: string;
  /** Team names by ticker, shown next to each holding. */
  teams: Record<string, string>;
  saveAudience?: string;
  layoutSwitch: ReactNode;
}) {
  const { positions, weights, scenarioWeights, sum, valid, busy, lookupBusy, opened } = bt;
  // Rows keep a stable order while editing: what the link or saved scenario changed first, then by today's weight,
  // cash last; companies added later go to the end.
  const [order] = useState(() => {
    const rank = (p: Position) => (opened.edited.has(p.id) ? 0 : p.kind === "cash" ? 2 : 1);
    return [...positions].sort((a, b) => rank(a) - rank(b) || b.weight - a.weight).map((p) => p.id);
  });
  const at = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  const rows = [...positions].sort((a, b) => at(a.id) - at(b.id));
  const unchanged = positions.filter((p) => weights[p.id]?.trim() !== "" && Math.abs(scenarioWeights[p.id] - p.weight) < 1e-8).length;

  return (
    <form data-tour="bt-weights" onSubmit={bt.run} className="panel flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <h2 className="flex-1 text-title font-semibold tracking-[-0.015em]">What if the weights were different?</h2>
          {layoutSwitch}
        </div>
        {(banner || opened.problem) && (
          <div className="rounded-[10px] bg-band px-3 py-[9px] text-body leading-[1.45] text-ink-2">
            {banner && <p>{banner}</p>}
            {opened.problem && <p className="text-down">{opened.problem}</p>}
          </div>
        )}
        <div className="grid grid-cols-[1fr_1fr_110px] gap-2">
          <DateField label="Start date" value={bt.from} max={bt.to} onChange={bt.setFrom} />
          <DateField label="End date" value={bt.to} min={bt.from} max={maxDate} onChange={bt.setTo} />
          <label className={cn(field, "relative flex items-center")} title={BENCHMARKS[bt.benchmark]}>
            <span className="sr-only">Benchmark</span>
            <select
              aria-label="Benchmark"
              value={bt.benchmark}
              onChange={(e) => bt.setBenchmark(e.target.value as Benchmark)}
              className="h-full w-full appearance-none rounded-lg border-0 bg-transparent pr-8 pl-2.5 text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {Object.entries(BENCHMARKS).map(([key, label]) => (
                <option key={key} value={key} title={label}>
                  vs {key}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" />
          </label>
        </div>
        <QuickTradeRow positions={positions} onApply={bt.quickTrade} disabled={lookupBusy} />
      </div>

      <div className={cn(COLS, "h-[34px] shrink-0 items-center border-y px-4 text-body text-muted-foreground")} aria-hidden>
        <span>Holding</span>
        <span className="text-right">Today</span>
        <span className="text-right">Scenario</span>
        <span className="text-right">Change</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" role="group" aria-label="Today's and scenario weights">
        {rows.map((p) => {
          const empty = weights[p.id]?.trim() === "";
          const d = scenarioWeights[p.id] - p.weight;
          const edited = bt.edited.has(p.id) && (empty || Math.abs(d) > 1e-8);
          const change = empty ? null : changeBp(d);
          const action =
            p.kind === "scenario"
              ? { label: `Remove ${p.ticker} from the scenario`, icon: <X />, run: () => bt.removeAdded(p.ticker), disabled: lookupBusy }
              : p.kind !== "cash" && scenarioWeights[p.id] > 0
                ? { label: `Drop ${p.ticker} to 0%`, icon: <CircleMinus />, run: () => bt.dropPosition(p.id) }
                : p.kind !== "cash" && p.weight > 0
                  ? { label: `Restore ${p.ticker} to today's weight`, icon: <Undo2 />, run: () => bt.restorePosition(p) }
                  : null;
          return (
            <div
              key={p.id}
              className={cn(COLS, "group h-11 items-center border-b border-row px-4 text-body transition-colors", edited ? "bg-caution/45" : "hover:bg-band")}
            >
              <span className="flex min-w-0 items-center gap-2" title={p.name}>
                <span className="font-mono text-body font-semibold">{p.kind === "cash" ? "Cash" : p.ticker}</span>
                <span className="min-w-0 truncate text-caption text-muted-foreground">
                  {p.kind === "cash" ? "0% return" : p.kind === "scenario" ? "Added to scenario" : (teams[p.ticker] ?? p.name)}
                </span>
                {action && (
                  <button
                    type="button"
                    aria-label={action.label}
                    title={action.label}
                    disabled={action.disabled}
                    onClick={action.run}
                    className="ml-auto grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5"
                  >
                    {action.icon}
                  </button>
                )}
              </span>
              <span className="text-right font-mono text-body text-muted-foreground">{fmtPct(p.weight * 100)}</span>
              <span className="flex justify-end">
                <input
                  aria-label={`${p.ticker} scenario weight`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={weights[p.id]}
                  onChange={(e) => bt.editWeight(p.id, e.target.value)}
                  onBlur={(e) => bt.settleWeight(p.id, e.target.value)}
                  className={cn(
                    noSpin,
                    "h-[26px] w-[66px] rounded-[8px] bg-card px-2 text-right font-mono text-body outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    edited
                      ? "shadow-[0_0_0_1px_color-mix(in_oklch,var(--caution-foreground)_60%,var(--card))]"
                      : "shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--border-strong)]",
                  )}
                />
              </span>
              <span className={cn("text-right font-mono text-body", !change ? "text-muted-foreground" : d > 0 ? "text-up" : "text-down")}>
                {change ?? "—"}
              </span>
            </div>
          );
        })}
        <AddCompany bt={bt} />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t bg-band-2 px-4 py-3">
        <span aria-live="polite" className="min-w-0 flex-1 text-body text-muted-foreground">
          {unchanged} at today&apos;s weights · total{" "}
          <span className={cn("font-mono font-semibold", valid ? "text-foreground" : "text-down")}>
            {Number.isFinite(sum) ? fmtPct(sum) : "—"}
          </span>
          {!valid && <span className="text-down"> · must total 100%</span>}
        </span>
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Reset weights" title="Reset weights" disabled={lookupBusy} onClick={bt.resetWeights}>
          <RotateCcw />
        </Button>
        <Button type="submit" size="lg" data-tour="bt-run" disabled={!valid || busy}>
          <Play className="size-3.5" />
          {busy ? "Replaying…" : "Run replay"}
        </Button>
        {saveAudience && <SaveButton bt={bt} audience={saveAudience} />}
      </div>
    </form>
  );
}

function DateField({ label, value, min, max, onChange }: { label: string; value: string; min?: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className={cn(field, "flex items-center gap-1.5 px-2.5")} title={DATES_HINT}>
      <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        aria-label={label}
        type="date"
        value={value}
        min={min}
        max={max}
        required
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Some browsers only open the picker from a direct gesture; typing still works.
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent font-mono text-body outline-none [&::-webkit-calendar-picker-indicator]:hidden"
      />
    </label>
  );
}

/** Trim or add to one holding by percentage points, offset by cash, the others pro rata, or one named holding. */
function QuickTradeRow({ positions, onApply, disabled }: { positions: Position[]; onApply: (t: Parameters<BacktestingState["quickTrade"]>[0]) => string | null; disabled?: boolean }) {
  const q = useQuickTrade(positions, onApply);
  return (
    <div data-tour="bt-quick-trade" role="group" aria-label="Quick trade">
      <div className="flex flex-wrap items-center gap-1 text-body whitespace-nowrap text-muted-foreground" title="Quick trade: change one holding by percentage points and offset it automatically">
        <MiniSelect label="Trade direction" value={q.side} onChange={(v) => q.setSide(v as "trim" | "add")}>
          <option value="trim">Trim</option>
          <option value="add">Add to</option>
        </MiniSelect>
        <MiniSelect label="Holding to trade" value={q.ticker} onChange={q.setTicker} mono>
          {q.holdings.map((p) => (
            <option key={p.id} value={p.ticker}>
              {p.ticker}
            </option>
          ))}
        </MiniSelect>
        by
        {/* Inside the replay form: step "any" keeps this field from blocking Run, and Enter applies the trade instead of submitting. */}
        <input
          aria-label="Percentage points"
          type="number"
          min="0"
          max="100"
          step="any"
          value={q.amount}
          onChange={(e) => q.setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              q.apply();
            }
          }}
          className={cn(noSpin, "h-7 w-11 rounded-lg bg-card px-2 text-right font-mono text-body text-foreground shadow-[0_0_0_1px_var(--border)] outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        />
        pp {q.side === "trim" ? "into" : "from"}
        <MiniSelect label="Offset" value={q.funding} onChange={q.setFunding}>
          {q.hasCash && <option value="cash">cash</option>}
          <option value="pro_rata" title="The other holdings, pro rata">the rest, pro rata</option>
          {q.holdings
            .filter((p) => p.ticker !== q.ticker)
            .map((p) => (
              <option key={p.id} value={p.ticker}>
                {p.ticker}
              </option>
            ))}
        </MiniSelect>
        <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={disabled || !q.ticker} onClick={q.apply}>
          Apply
        </Button>
      </div>
      {q.error && (
        <p role="alert" className="mt-1.5 text-body text-down">
          {q.error}
        </p>
      )}
    </div>
  );
}

function MiniSelect({ label, value, onChange, mono, children }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; children: ReactNode }) {
  return (
    <span className="relative inline-flex items-center">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(miniSelect, "text-foreground", mono && "font-mono")}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1 size-3 text-muted-foreground" />
    </span>
  );
}

/** The last row of the weights list: bring in a company we don't hold, starting at 0%. */
function AddCompany({ bt }: { bt: BacktestingState }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <input
          aria-label="Ticker to add"
          placeholder="Ticker"
          maxLength={10}
          value={bt.tickerInput}
          disabled={bt.lookupBusy}
          onChange={(e) => bt.changeTickerInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void bt.addCompany();
            }
          }}
          className="h-7 w-24 rounded-lg bg-card px-2.5 font-mono text-body uppercase shadow-[0_0_0_1px_var(--border)] outline-none placeholder:normal-case placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="button" variant="outline" size="sm" disabled={bt.lookupBusy} onClick={() => void bt.addCompany()}>
          <Plus />
          {bt.lookupBusy ? "Looking up…" : "Add company"}
        </Button>
      </div>
      <p className="mt-1.5 text-caption text-muted-foreground">{ADD_HINT}</p>
      {bt.lookupError && (
        <p role="alert" className="mt-1.5 text-body text-down">
          {bt.lookupError}
        </p>
      )}
    </div>
  );
}

/** Save opens a small form: a name, an optional note, then a link to share. */
function SaveButton({ bt, audience }: { bt: BacktestingState; audience: string }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="outline" size="lg" data-tour="bt-save" />}>Save</PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[380px] gap-3 rounded-[14px] p-4 [&_input]:max-w-none">
        <SaveScenarioFields onSave={bt.save} disabled={!bt.valid} audience={audience} />
      </PopoverContent>
    </Popover>
  );
}
