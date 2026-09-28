"use client";

import { useState, useTransition } from "react";
import { Ellipsis } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * A ledger row's ⋯ menu. Void sits inside it rather than on every row, and asks first, naming the entry.
 * Voided rows stay in the ledger for the record.
 */
export function VoidMenu({ id, entry, action }: { id: string; entry: string; action: (fd: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label={`Actions for ${entry}`} />}>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem variant="destructive" onClick={() => setOpen(true)}>
            Void…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="pr-6 leading-snug">Void {entry}?</DialogTitle>
            <DialogDescription>This removes it from attribution. The row stays in the ledger, marked void.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep
            </Button>
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
    </>
  );
}
