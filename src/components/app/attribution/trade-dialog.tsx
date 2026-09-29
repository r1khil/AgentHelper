"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/holdings";
import { recordTrade } from "@/lib/actions/ledger";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtNumber } from "@/lib/format";
import { NativeSelect } from "../native-select";

/** Values the form opens with: a holding's page starts on its ticker, a held-back emailed ticket on its own fields. */
export type TradeDefaults = { ticker?: string; side?: "buy" | "sell"; tradeDate?: string; shares?: number; price?: number; note?: string };

/**
 * The Record trade dialog. `primary` is the page header's action (an ink button, no icon); otherwise it is a small
 * button beside other controls. Pass `open` and `onOpenChange` to open it from somewhere else (the Activity page's
 * review of a held ticket), with `trigger={false}`.
 */
export function TradeDialog({
  today,
  positions,
  primary,
  defaults,
  open: controlledOpen,
  onOpenChange,
  trigger = true,
  title = "Record a trade",
  description = "Enter it as executed. Splits and reinvested dividends are applied automatically.",
}: {
  today: string;
  positions: { ticker: string; shares: number }[];
  primary?: boolean;
  defaults?: TradeDefaults;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
  title?: string;
  description?: string;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (o: boolean) => {
    setInnerOpen(o);
    onOpenChange?.(o);
  };
  const [ticker, setTicker] = useState(defaults?.ticker ?? "");
  const [, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const result = await recordTrade(prev, fd);
    if (result.ok) {
      toast.success(result.message ?? "Recorded");
      setOpen(false);
      setTicker(defaults?.ticker ?? "");
    } else {
      toast.error(result.error);
    }
    return result;
  }, null);
  const held = positions.find((p) => p.ticker === ticker.trim().toUpperCase());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger render={primary ? <Button /> : <Button size="sm" />}>
          {!primary && <Plus />}
          Record trade
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tradeDate">Trade date</Label>
              <Input id="tradeDate" name="tradeDate" type="date" defaultValue={defaults?.tradeDate ?? today} max={today} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="side">Side</Label>
              <NativeSelect id="side" name="side" defaultValue={defaults?.side ?? "buy"}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="trade-ticker">Ticker</Label>
            <Input id="trade-ticker" name="ticker" placeholder="NVDA" autoCapitalize="characters" value={ticker} onChange={(e) => setTicker(e.target.value)} required />
            <p className="tnum text-body text-muted-foreground">{held ? `Fund holds ${fmtNumber(held.shares)} shares` : ticker ? "Not currently held" : " "}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="shares">Shares</Label>
              <Input id="shares" name="shares" type="number" inputMode="decimal" step="any" min="0" defaultValue={defaults?.shares} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="price">Price</Label>
              <Input id="price" name="price" type="number" inputMode="decimal" step="any" min="0" defaultValue={defaults?.price} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fees">Fees</Label>
              <Input id="fees" name="fees" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="trade-note">Note (optional)</Label>
            <Input id="trade-note" name="note" maxLength={500} defaultValue={defaults?.note} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Record"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
