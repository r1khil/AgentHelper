"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Position } from "@/lib/backtesting/engine";
import type { Funding, Trade } from "@/lib/backtesting/trade";

const select = "h-9 rounded-md border bg-background px-2.5 text-sm";

/** The quick trade's fields and its apply step, shared by both layouts. */
export function useQuickTrade(positions: Position[], onApply: (trade: Trade) => string | null) {
  const holdings = positions.filter((p) => p.kind !== "cash");
  const hasCash = positions.some((p) => p.kind === "cash");
  const [ticker, setTicker] = useState(holdings[0]?.ticker ?? "");
  const [side, setSide] = useState<"trim" | "add">("trim");
  const [amount, setAmount] = useState("1");
  const [funding, setFunding] = useState<string>(hasCash ? "cash" : "pro_rata");
  const [error, setError] = useState("");

  function apply() {
    const pp = Number(amount);
    if (!Number.isFinite(pp) || pp <= 0) return setError("Enter how many percentage points, such as 1.5.");
    const f: Funding = funding === "cash" ? { kind: "cash" } : funding === "pro_rata" ? { kind: "pro_rata" } : { kind: "ticker", ticker: funding };
    setError(onApply({ ticker, changePp: side === "trim" ? -pp : pp, funding: f }) ?? "");
  }
  return { holdings, hasCash, ticker, setTicker, side, setSide, amount, setAmount, funding, setFunding, error, apply };
}

/**
 * Relative edits for the modified copy: trim or add percentage points to one holding and say where
 * the money comes from or goes. `onApply` returns an error message, or null when the trade applied.
 */
export function QuickTrade({ positions, onApply, disabled }: { positions: Position[]; onApply: (trade: Trade) => string | null; disabled?: boolean }) {
  const { holdings, hasCash, ticker, setTicker, side, setSide, amount, setAmount, funding, setFunding, error, apply } = useQuickTrade(positions, onApply);

  return (
    <div data-tour="bt-quick-trade" className="mt-3 rounded-md border border-dashed p-3">
      <div className="mb-2 text-sm font-medium">
        Quick trade <span className="font-normal text-muted-foreground">· change one holding by percentage points and offset it automatically</span>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <select aria-label="Trade direction" className={select} value={side} onChange={(e) => setSide(e.target.value as "trim" | "add")}>
          <option value="trim">Trim</option>
          <option value="add">Add to</option>
        </select>
        <select aria-label="Holding to trade" className={select} value={ticker} onChange={(e) => setTicker(e.target.value)}>
          {holdings.map((p) => (
            <option key={p.id} value={p.ticker}>{p.ticker}</option>
          ))}
        </select>
        <span className="pb-2 text-muted-foreground">by</span>
        {/* Inside the backtest form: step "any" keeps this field from blocking Run, and Enter applies the trade instead of submitting. */}
        <Input
          aria-label="Percentage points"
          className="w-20 text-right"
          type="number"
          min="0"
          max="100"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
        <span className="pb-2 text-muted-foreground">pp, {side === "trim" ? "proceeds to" : "funded from"}</span>
        <select aria-label="Offset" className={select} value={funding} onChange={(e) => setFunding(e.target.value)}>
          {hasCash && <option value="cash">cash</option>}
          <option value="pro_rata">the other holdings, pro rata</option>
          {holdings.filter((p) => p.ticker !== ticker).map((p) => (
            <option key={p.id} value={p.ticker}>{p.ticker}</option>
          ))}
        </select>
        <Button type="button" variant="outline" disabled={disabled || !ticker} onClick={apply}>Apply</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
