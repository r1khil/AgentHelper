"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addHolding, type ActionResult } from "@/lib/actions/holdings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "./native-select";

type Member = { id: string; fullName: string };

export function AddHoldingDialog({ teamId, members, defaultOwnerId }: { teamId: string; members: Member[]; defaultOwnerId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const result = await addHolding(prev, fd);
    if (result.ok) {
      toast.success(result.message ?? "Added");
      setOpen(false);
    } else {
      toast.error(result.error);
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus className="size-3.5" />
        Add holding
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a holding</DialogTitle>
          <DialogDescription>Company name and SEC filings are looked up from the ticker.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="teamId" value={teamId} />
          <div className="grid gap-1.5">
            <Label htmlFor="ticker">Ticker</Label>
            <Input id="ticker" name="ticker" placeholder="NVDA" autoCapitalize="characters" autoFocus required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ownerId">Owner</Label>
            <NativeSelect id="ownerId" name="ownerId" defaultValue={defaultOwnerId ?? ""}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="thesis">Thesis (optional)</Label>
            <Textarea id="thesis" name="thesis" rows={3} placeholder="Why the team owns it." />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Looking up…" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
