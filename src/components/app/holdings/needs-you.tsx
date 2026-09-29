import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NeedRow } from "./attention";

/**
 * What this holding is waiting on, in an amber notice under the ask box: the status word (red once a write-up is a day
 * late, amber otherwise), what it is, and one ink action that opens it. Nothing at all when nothing waits.
 */
export function NeedsYou({ rows }: { rows: NeedRow[] }) {
  if (!rows.length) return null;
  return (
    <section aria-label="Needs you" className="mt-[18px] flex flex-col rounded-xl border border-caution-line bg-caution">
      {rows.map((r) => (
        <div key={r.key} className="flex min-h-[52px] items-center gap-3 border-b border-caution-line py-2 pr-3 pl-4 last:border-b-0">
          <span className={cn("w-[150px] shrink-0 text-body font-semibold", r.tone === "overdue" ? "text-down" : "text-caution-foreground")}>{r.status}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body text-foreground">{r.title}</span>
            {r.detail && <span className="block truncate text-caption text-muted-foreground">{r.detail}</span>}
          </span>
          <Button nativeButton={false} render={<Link href={r.href} />} className="font-semibold">
            {r.action}
          </Button>
        </div>
      ))}
    </section>
  );
}
