"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionHead, Signed } from "@/components/app/portfolio/parts";
import type { BacktestResult, Position } from "@/lib/backtesting/engine";
import { fmtChangeBp, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useQuickTrade } from "../quick-trade";
import type { BacktestingState } from "../use-backtesting";
import { ADD_HINT, pct } from "../workspace";

const COLS = "grid grid-cols-[minmax(0,1fr)_70px_80px_90px_120px_30px] gap-x-3";
const noSpin = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const mini = "h-7 appearance-none rounded-md border-0 bg-secondary pr-5 pl-2 text-body text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** "2-year", "6-month" or "40-day": the replay's window in one word, for the return column's heading. */
export function windowWord(from: string, to: string) {
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
  if (days <= 45) return `${days}-day`;
  const months = Math.round(days / 30.44);
  return months < 22 && months !== 12 ? `${months}-month` : `${Math.round(days / 365.25)}-year`;
}

/** Each holding's return over the replay: its daily returns compounded. Null for a holding the run has no days for. */
function holdingReturns(result: BacktestResult | undefined) {
  const out = new Map<string, number>();
  if (!result) return out;
  const growth = new Map<string, number>();
  for (const day of result.days) for (const c of day.contributions) growth.set(c.id, (growth.get(c.id) ?? 1) * (1 + c.return));
  for (const [id, g] of growth) out.set(id, g - 1);
  return out;
}

/** A change in weight in basis points, e.g. "+122 bp"; a change under half a basis point reads as unchanged. */
function changeBp(v: number) {
  const bp = Math.round(v * 10_000);
  return bp === 0 ? null : fmtChangeBp(bp);
}

/**
 * "Weight changes": only the holdings the scenario changes, each with today's weight, the scenario's (an input), the
 * change and what the holding returned over the window. "Add holding" brings in another one to change, or a company we
 * don't hold. A quick trade sits above the table for a change that offsets itself.
 */
export function WeightChanges({ bt, result, years, teams }: { bt: BacktestingState; result?: BacktestResult; years: string; teams: Record<string, string> }) {
  const { positions, weights, scenarioWeights, sum, valid, lookupBusy, opened } = bt;
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  // Rows keep a stable order while editing: what the link or saved scenario changed first, then by today's weight.
  const [order] = useState(() => {
    const rank = (p: Position) => (opened.edited.has(p.id) ? 0 : p.kind === "cash" ? 2 : 1);
    return [...positions].sort((a, b) => rank(a) - rank(b) || b.weight - a.weight).map((p) => p.id);
  });
  const at = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  const returns = useMemo(() => holdingReturns(result), [result]);
  const changed = (p: Position) => weights[p.id]?.trim() === "" || Math.abs(scenarioWeights[p.id] - p.weight) > 1e-8;
  const shown = positions.filter((p) => pinned.has(p.id) || bt.edited.has(p.id) || p.kind === "scenario" || changed(p)).sort((a, b) => at(a.id) - at(b.id));
  const hidden = positions.filter((p) => !shown.includes(p) && p.kind !== "cash");
  const net = Number.isFinite(sum) ? Math.round((sum - 100) * 100) : null;

  function remove(p: Position) {
    setPinned((s) => {
      const n = new Set(s);
      n.delete(p.id);
      return n;
    });
    if (p.kind === "scenario") bt.removeAdded(p.ticker);
    else bt.restorePosition(p);
  }

  return (
    <section data-tour="bt-weights" aria-labelledby="bt-changes-h" className="min-w-0">
      <SectionHead
        id="bt-changes-h"
        title="Weight changes"
        aside={
          <>
            <span aria-live="polite" className={valid ? undefined : "font-semibold text-caution-foreground"}>
              {valid ? `Net ${net === null ? "—" : fmtChangeBp(net)}, weights still add to 100%` : `Weights total ${Number.isFinite(sum) ? fmtPct(sum) : "—"}, must total 100%`}
            </span>
            <AddHolding bt={bt} hidden={hidden} onPick={(id) => setPinned((s) => new Set(s).add(id))} />
          </>
        }
      />
      <QuickTradeRow positions={positions} onApply={bt.quickTrade} disabled={lookupBusy} />
      <div role="table" aria-label="Weight changes" className="mt-2.5 text-body">
        <div role="row" className={cn(COLS, "min-h-[34px] items-center border-b text-caption text-muted-foreground")}>
          <span role="columnheader">Holding</span>
          <span role="columnheader" className="text-right">Today</span>
          <span role="columnheader" className="text-right">Modified</span>
          <span role="columnheader" className="text-right">Change</span>
          <span role="columnheader" className="text-right">Its {years} return</span>
          <span role="columnheader" className="sr-only">Remove</span>
        </div>
        {shown.length === 0 && (
          <div role="row">
            <div role="cell" aria-colspan={6} className="min-h-11 py-3 text-muted-foreground">
              Nothing changed yet. Every weight is today&apos;s. Use the quick trade above, or add a holding to change.
            </div>
          </div>
        )}
        {shown.map((p) => {
          const empty = weights[p.id]?.trim() === "";
          const d = scenarioWeights[p.id] - p.weight;
          const change = empty ? null : changeBp(d);
          const r = returns.get(p.id);
          return (
            <div key={p.id} role="row" className={cn(COLS, "min-h-11 items-center border-b border-row")}>
              <span role="rowheader" className="min-w-0" title={p.name}>
                <b className="font-semibold">{p.kind === "cash" ? "Cash" : p.ticker}</b>{" "}
                <span className="text-muted-foreground">{p.kind === "cash" ? "0% return" : p.kind === "scenario" ? `${p.name}, added to the scenario` : (teams[p.ticker] ?? p.name)}</span>
              </span>
              <span role="cell" className="text-right text-muted-foreground">{fmtPct(p.weight * 100)}</span>
              <span role="cell" className="text-right">
                <input
                  aria-label={`Modified weight for ${p.ticker}, percent`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={weights[p.id]}
                  onChange={(e) => bt.editWeight(p.id, e.target.value)}
                  onBlur={(e) => bt.settleWeight(p.id, e.target.value)}
                  className={cn(noSpin, "h-7 w-16 border-0 border-b border-foreground bg-transparent px-0.5 text-right text-body font-semibold outline-none focus-visible:bg-secondary")}
                />
              </span>
              <span role="cell" className="text-right">{change ? <Signed text={change} className="font-semibold" /> : <span className="text-muted-foreground">—</span>}</span>
              <span role="cell" className="text-right text-ink-2">{r === undefined ? "—" : pct(r)}</span>
              <span role="cell" className="text-right">
                {p.kind !== "cash" && (
                  <button
                    type="button"
                    aria-label={p.kind === "scenario" ? `Remove ${p.ticker} from the scenario` : `Put ${p.ticker} back to today's weight`}
                    title={p.kind === "scenario" ? `Remove ${p.ticker} from the scenario` : `Put ${p.ticker} back to today's weight`}
                    disabled={lookupBusy}
                    onClick={() => remove(p)}
                    className="inline-grid size-[26px] place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Trim or add to one holding by percentage points, offset by cash, the others pro rata, or one named holding. */
function QuickTradeRow({ positions, onApply, disabled }: { positions: Position[]; onApply: (t: Parameters<BacktestingState["quickTrade"]>[0]) => string | null; disabled?: boolean }) {
  const q = useQuickTrade(positions, onApply);
  return (
    <div data-tour="bt-quick-trade" role="group" aria-label="Quick trade" className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5 text-body whitespace-nowrap text-muted-foreground" title="Quick trade: change one holding by percentage points and offset it automatically">
        Quick trade
        <MiniSelect label="Trade direction" value={q.side} onChange={(v) => q.setSide(v as "trim" | "add")}>
          <option value="trim">Trim</option>
          <option value="add">Add to</option>
        </MiniSelect>
        <MiniSelect label="Holding to trade" value={q.ticker} onChange={q.setTicker}>
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
          className={cn(noSpin, "h-7 w-12 rounded-md bg-secondary px-2 text-right text-body text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}
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
        <Button type="button" variant="secondary" size="sm" disabled={disabled || !q.ticker} onClick={q.apply}>
          Apply
        </Button>
      </div>
      {q.error && (
        <p role="alert" className="mt-1.5 text-body">
          <b className="font-semibold text-caution-foreground">Check</b> <span className="text-ink-3">{q.error}</span>
        </p>
      )}
    </div>
  );
}

function MiniSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex items-center">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={mini}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3 text-muted-foreground" aria-hidden />
    </span>
  );
}

/** "Add holding": change a holding that isn't in the table yet, or bring in a company we don't hold, starting at 0%. */
function AddHolding({ bt, hidden, onPick }: { bt: BacktestingState; hidden: Position[]; onPick: (id: string) => void }) {
  const [pick, setPick] = useState("");
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="secondary" size="sm" />}>
        <Plus aria-hidden />
        Add holding
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] gap-3 p-3">
        {hidden.length > 0 && (
          <div className="grid gap-1.5">
            <label htmlFor="bt-pick" className="text-caption text-muted-foreground">
              A holding to change
            </label>
            <div className="flex items-center gap-2">
              <span className="relative inline-flex flex-1 items-center">
                <select id="bt-pick" value={pick} onChange={(e) => setPick(e.target.value)} className={cn(mini, "w-full")}>
                  <option value="">Choose a holding</option>
                  {hidden.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ticker}, {fmtPct(p.weight * 100)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 size-3 text-muted-foreground" aria-hidden />
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!pick}
                onClick={() => {
                  onPick(pick);
                  setPick("");
                }}
              >
                Add
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-1.5">
          <label htmlFor="bt-ticker" className="text-caption text-muted-foreground">
            A company we don&apos;t hold
          </label>
          <div className="flex items-center gap-2">
            <input
              id="bt-ticker"
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
              className="h-7 w-28 rounded-md bg-secondary px-2.5 text-body uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <Button type="button" variant="secondary" size="sm" disabled={bt.lookupBusy} onClick={() => void bt.addCompany()}>
              {bt.lookupBusy ? "Looking up…" : "Add company"}
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">{ADD_HINT}</p>
          {bt.lookupError && (
            <p role="alert" className="text-body">
              <b className="font-semibold text-caution-foreground">Check</b> <span className="text-ink-3">{bt.lookupError}</span>
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
