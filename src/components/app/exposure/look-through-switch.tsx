"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * "Look through ETFs": count each ETF in the sector weights whole, in its own sector, or split into the companies it
 * holds. The choice lives in the URL (`?sectors=etf`), so the switch navigates. Off and unavailable while no ETF holdings
 * list is stored.
 */
export function LookThroughSwitch({ on, available, href, note }: { on: boolean; available: boolean; href: string; note: React.ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on && available}
      disabled={!available}
      title={available ? undefined : "No ETF holdings lists are stored yet"}
      onClick={() => router.push(href, { scroll: false })}
      className="mb-1 flex shrink-0 items-center gap-2.5 text-left text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
    >
      <span aria-hidden className={cn("relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors", on && available ? "bg-primary" : "bg-bench-bar")}>
        <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-primary-foreground transition-[left]", on && available ? "left-[14px]" : "left-0.5")} />
      </span>
      <span>
        <b className={cn("block font-semibold", !available && "text-muted-foreground")}>Look through ETFs</b>
        <span className="block text-caption text-muted-foreground">{note}</span>
      </span>
    </button>
  );
}
