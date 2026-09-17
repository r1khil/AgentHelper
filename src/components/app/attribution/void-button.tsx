"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Confirm, then run a void action. Voided rows stay in the ledger for the record. */
export function VoidButton({ id, what, action }: { id: string; what: string; action: (fd: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className="text-muted-foreground" />}>Void</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Void this entry?</DialogTitle>
          <DialogDescription>{what} It stays in the ledger marked void, and attribution is recalculated without it.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Keep</Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const fd = new FormData();
                fd.set("id", id);
                try {
                  await action(fd);
                  toast.success("Voided");
                  setOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not void this entry");
                }
              })
            }
          >
            {pending ? "Voiding…" : "Void"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
