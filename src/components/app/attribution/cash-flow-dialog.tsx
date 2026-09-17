"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/holdings";
import { recordCashFlow } from "@/lib/actions/ledger";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "../native-select";

export function CashFlowDialog({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const result = await recordCashFlow(prev, fd);
    if (result.ok) {
      toast.success(result.message ?? "Recorded");
      setOpen(false);
    } else {
      toast.error(result.error);
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus />
        Record cash
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record cash</DialogTitle>
          <DialogDescription>Deposits and withdrawals do not count as performance. Fees and interest do. Dividends reinvest automatically and are not entered here.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="flowDate">Date</Label>
              <Input id="flowDate" name="flowDate" type="date" defaultValue={today} max={today} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="kind">Type</Label>
              <NativeSelect id="kind" name="kind" defaultValue="deposit">
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="fee">Account fee</option>
                <option value="interest">Interest</option>
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input id="amount" name="amount" type="number" inputMode="decimal" step="0.01" min="0" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cash-note">Note (optional)</Label>
            <Input id="cash-note" name="note" maxLength={500} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
