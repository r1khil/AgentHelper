"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { pinChatToHolding } from "@/lib/actions/chats";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A holding a conversation can be filed under. */
export type PinTarget = { ticker: string; company: string; teamSlug: string; team: string };

/**
 * "Pin to a holding": pick a holding, and the conversation is filed under it (listed on the holding's Threads tab, read
 * as its research). A general conversation only; one already pinned has nothing to pin. `look` draws it as a text link,
 * the panel's small grey button, or a quiet header button beside a thread's Share.
 */
export function PinToBoard({ chatId, targets, look = "link", onPinned, className }: { chatId: string; targets: PinTarget[]; look?: "link" | "button" | "header"; onPinned?: () => void; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const f = q.trim().toLowerCase();
  const shown = targets.filter((t) => !f || t.ticker.toLowerCase().includes(f) || t.company.toLowerCase().includes(f));
  if (targets.length === 0) return null;

  const pin = (t: PinTarget) =>
    startTransition(async () => {
      const res = await pinChatToHolding({ chatId, ticker: t.ticker, teamSlug: t.teamSlug });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      onPinned?.();
      // The thread keeps its address; refresh so the header names the holding.
      router.push(res.href);
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          look === "link"
            ? "rounded-sm text-ink-2 hover:text-foreground"
            : look === "header"
              ? buttonVariants({ variant: "ghost" })
              : "h-7 rounded-md bg-secondary px-2.5 text-body text-foreground hover:bg-border",
          "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
          className,
        )}
      >
        {pending ? "Pinning…" : "Pin to a holding"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={look === "header" ? "end" : "start"} className="w-72 max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Find a holding"
            aria-label="Find a holding"
            className="h-7 w-full rounded-md bg-secondary px-2 text-body outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          <DropdownMenuGroup>
            <DropdownMenuLabel>File this conversation under</DropdownMenuLabel>
            {shown.length === 0 && <p className="px-2 py-2 text-body text-muted-foreground">No holding matches.</p>}
            {shown.map((t) => (
              <DropdownMenuItem key={`${t.teamSlug}:${t.ticker}`} onClick={() => pin(t)}>
                <span className="w-12 shrink-0 font-semibold">{t.ticker}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.company}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
