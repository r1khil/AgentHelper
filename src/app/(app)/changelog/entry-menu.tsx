"use client";

import { useTransition } from "react";
import { Ellipsis } from "lucide-react";
import { toast } from "sonner";
import { regenerateEntry } from "@/lib/actions/changelog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** An entry's ⋯ menu (admins only). Regenerate sits inside it rather than on every row. */
export function EntryMenu({ prNumber, headline }: { prNumber: number; headline: string }) {
  const [pending, start] = useTransition();
  const regenerate = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("prNumber", String(prNumber));
      const id = toast.loading(`Rewriting the summary of #${prNumber}…`);
      try {
        await regenerateEntry(fd);
        toast.success(`Rewrote the summary of #${prNumber}`, { id });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not regenerate this summary", { id });
      }
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label={`Actions for #${prNumber}: ${headline}`} />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem disabled={pending} onClick={regenerate}>
          {pending ? "Regenerating…" : "Regenerate summary"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
