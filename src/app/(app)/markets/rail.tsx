import { cn } from "@/lib/utils";

// Markets' right rail: raised cards (the surface fill, 12px corners, 16px in), each a 13px heading over short rows.

export function RailCard({ title, id, note, className, children }: { title: string; id: string; note?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-[12px] bg-surface p-4", className)}>
      <h2 id={id} className="mb-1 text-body font-semibold">
        {title}
      </h2>
      {children}
      {note && <p className="mt-2 text-caption text-muted-foreground">{note}</p>}
    </section>
  );
}

/** One row of a rail card: a label on the left, a figure or word on the right, over a row divider. */
export function RailRow({ label, className, children }: { label: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("relative flex h-[34px] items-center justify-between gap-3 border-b border-row text-body last:border-b-0", className)}>
      <span className="min-w-0 truncate">{label}</span>
      {children}
    </div>
  );
}
