import { cn } from "@/lib/utils";

/*
 * A card in a page's right-hand rail (Markets' Today and Prep packs, a holding's Fund position and Next report): the
 * raised surface, 12px corners, 16px in, a 13px semibold title, then label / value rows split by row dividers. One
 * look for every rail in the app.
 */

export function RailCard({ id, title, aside, note, className, children }: { id: string; title: React.ReactNode; /** Grey, right of the title: a link or a count. */ aside?: React.ReactNode; note?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-[12px] bg-surface p-4", className)}>
      <div className="mb-1 flex items-baseline gap-2">
        <h2 id={id} className="flex-1 text-body font-semibold">
          {title}
        </h2>
        {aside && <span className="text-caption text-muted-foreground">{aside}</span>}
      </div>
      {children}
      {note && <p className="mt-2 text-caption text-muted-foreground">{note}</p>}
    </section>
  );
}

/**
 * One row of a rail card: a label on the left, a figure or word on the right, over a row divider. 34px for a line; a
 * long value (a team's name, a list of leads) wraps and the row grows rather than cutting it off.
 */
export function RailRow({ label, title, className, children }: { label: React.ReactNode; title?: string; className?: string; children?: React.ReactNode }) {
  return (
    <div title={title} className={cn("relative flex min-h-[34px] items-center justify-between gap-3 border-b border-row py-[7px] text-body leading-5 last:border-b-0", className)}>
      <span className="min-w-0 truncate">{label}</span>
      {children}
    </div>
  );
}
