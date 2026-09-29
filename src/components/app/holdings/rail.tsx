import { cn } from "@/lib/utils";

export type RailRow = {
  k: string;
  v: React.ReactNode;
  /** Colours the value: green up, red down, amber for a status that wants a look, grey for none. */
  tone?: "up" | "down" | "caution" | "muted" | null;
  title?: string;
};

/**
 * A card in a page's right-hand rail (the holding's Fund position, Next report, Key statistics): the raised surface,
 * a 13px semibold title, then label / value rows split by row dividers.
 */
export function RailCard({ id, title, aside, rows, note, children, className }: { id: string; title: React.ReactNode; aside?: React.ReactNode; rows?: RailRow[]; note?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-xl bg-surface p-4", className)}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <h2 id={id} className="flex-1 text-body font-semibold">
          {title}
        </h2>
        {aside && <span className="text-caption text-muted-foreground">{aside}</span>}
      </div>
      {rows && <RailRows rows={rows} />}
      {children}
      {note && <p className="mt-2 text-caption text-muted-foreground">{note}</p>}
    </section>
  );
}

export function RailRows({ rows }: { rows: RailRow[] }) {
  return (
    <dl>
      {rows.map((r) => (
        <div key={r.k} title={r.title} className="flex min-h-[34px] items-center justify-between gap-3 border-b border-row py-[7px] text-body last:border-b-0">
          <dt className="shrink-0 text-ink-2">{r.k}</dt>
          <dd
            className={cn(
              // A long value (a team's name, a list of leads) wraps rather than being cut off.
              "min-w-0 text-right leading-5 font-semibold text-balance tabular-nums",
              r.tone === "up" && "text-up",
              r.tone === "down" && "text-down",
              r.tone === "caution" && "text-caution-foreground",
              r.tone === "muted" && "font-normal text-muted-foreground",
            )}
          >
            {r.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
