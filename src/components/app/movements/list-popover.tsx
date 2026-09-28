"use client";

import { useState } from "react";
import { ChevronDown, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Below xl the movements list gives its width to the write-up and opens from this button instead. */
export function MovementListPopover({ open: openCount, total, children }: { open: number; total: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" data-tour="movements-list" />}>
        <List />
        Movements
        <span className="font-mono text-caption text-muted-foreground" title={`${openCount} open · ${total - openCount} completed`}>
          {openCount} open
        </span>
        <ChevronDown className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[380px] gap-0 overflow-hidden p-0"
        // Picking a movement navigates; close so the new one is in view.
        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
