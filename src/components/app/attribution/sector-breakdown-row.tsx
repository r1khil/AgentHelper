"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import type { BucketKey } from "@/lib/attribution/sectors";
import { cn } from "@/lib/utils";
import { SectorBreakdownPanel, type BreakdownQuery } from "./sector-breakdown";

/** A sector row that expands to its transparency breakdown. The cells are rendered by the server table. */
export function SectorBreakdownRow({ sector, query, colSpan, children }: { sector: BucketKey; query: BreakdownQuery; colSpan: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <TableCell className="w-6 px-2">
          <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
        </TableCell>
        {children}
      </TableRow>
      {open && (
        <TableRow className="bg-muted/10 hover:bg-muted/10">
          <TableCell colSpan={colSpan} className="p-0">
            <SectorBreakdownPanel sector={sector} query={query} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
