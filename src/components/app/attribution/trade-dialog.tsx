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

export function TradeDialog({ today, positions }: { today: string; positions: { ticker: string; shares: number }[] }) {
  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const result = await recordTrade(prev, fd);
    if (result.ok) {
      toast.success(result.message ?? "Recorded");
      setOpen(false);
      setTicker("");
    } else {
      toast.error(result.error);
    }
    return result;
  }, null);
  const held = positions.find((p) => p.ticker === ticker.trim().toUpperCase());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus />
        Record trade
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a trade</DialogTitle>
          <DialogDescription>Enter it as executed. Splits and reinvested dividends are applied automatically.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tradeDate">Trade date</Label>
              <Input id="tradeDate" name="tradeDate" type="date" defaultValue={today} max={today} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="side">Side</Label>
              <NativeSelect id="side" name="side" defaultValue="buy">
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="trade-ticker">Ticker</Label>
            <Input id="trade-ticker" name="ticker" placeholder="NVDA" autoCapitalize="characters" value={ticker} onChange={(e) => setTicker(e.target.value)} required />
            <p className="tnum text-xs text-muted-foreground">{held ? `Fund holds ${fmtNumber(held.shares)} shares` : ticker ? "Not currently held" : " "}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="shares">Shares</Label>
              <Input id="shares" name="shares" type="number" inputMode="decimal" step="any" min="0" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="price">Price</Label>
              <Input id="price" name="price" type="number" inputMode="decimal" step="any" min="0" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fees">Fees</Label>
              <Input id="fees" name="fees" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="trade-note">Note (optional)</Label>
            <Input id="trade-note" name="note" maxLength={500} />
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
