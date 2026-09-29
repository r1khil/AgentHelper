"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A row of a `role="table"` grid (the caller draws the table and its header row) that opens to more: the name in the first cell is a button (stretched over the whole row) and an open row
 * adds one more row with a single spanning cell for `detail`. For screen readers it stays a table: the name is the row
 * header, `cells` are the row's other cells (each a `role="cell"` in the caller's grid, `span - 1` of them). A link to
 * `#id` opens the row.
 */
export function ExpandRow({
  id,
  grid,
  span,
  name,
  cells,
  detail,
  className,
}: {
  id?: string;
  /** The row's grid classes. */
  grid: string;
  /** How many columns the table has, for the detail cell. */
  span: number;
  name: React.ReactNode;
  cells: React.ReactNode;
  detail: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!id) return;
    const check = () => {
      if (decodeURIComponent(window.location.hash.slice(1)) === id) {
        setOpen(true);
        document.getElementById(id)?.scrollIntoView({ block: "start" });
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [id]);

  return (
    <>
      <div
        id={id}
        role="row"
        className={cn("group/row relative grid min-h-11 scroll-mt-4 items-center gap-x-3 border-b border-row py-1 transition-colors hover:bg-band has-[button:focus-visible]:bg-band", grid, open && "bg-band", className)}
      >
        <ChevronRight
          className={cn("absolute top-1/2 -left-4 size-3 -translate-y-1/2 text-muted-foreground opacity-0 transition group-hover/row:opacity-100", open && "rotate-90 opacity-100")}
          aria-hidden
        />
        <span role="rowheader" className="min-w-0">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="max-w-full text-left font-semibold after:absolute after:inset-0 focus-visible:outline-none">
            {name}
          </button>
        </span>
        {cells}
      </div>
      {open && (
        <div role="row">
          <div role="cell" aria-colspan={span} className="border-b border-row bg-band px-3 py-4">
            {detail}
          </div>
        </div>
      )}
    </>
  );
}
