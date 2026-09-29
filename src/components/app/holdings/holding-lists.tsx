import Link from "next/link";
import { cn } from "@/lib/utils";

export type KeyValue = { k: string; v: React.ReactNode; tone?: "up" | "down" | null; title?: string };

/**
 * A titled list of label / value pairs: two columns of 40px rows split by hairlines, the label grey and the value
 * semibold. The holding page's Fund position and Key statistics are two of them side by side.
 */
export function KeyValueSection({ id, title, rows, note, columns = 2 }: { id: string; title: string; rows: KeyValue[]; note?: React.ReactNode; columns?: 1 | 2 }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h2 id={id} className="text-title font-bold tracking-[-0.01em]">
        {title}
      </h2>
      <dl className={cn("mt-2 grid gap-x-6", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {rows.map((r) => (
          <div key={r.k} title={r.title} className="flex h-10 items-center justify-between gap-3 border-b border-row text-body">
            <dt className="text-ink-2">{r.k}</dt>
            <dd className={cn("min-w-0 truncate font-semibold", r.tone === "up" && "text-up", r.tone === "down" && "text-down")}>{r.v}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-2 text-caption text-muted-foreground">{note}</p>}
    </section>
  );
}

export type ResearchRow = { kind: string; title: string; when?: string; href: string; external?: boolean };

/** Where the team's own work on the holding lives: thesis, filing, sell-side calls, model, research board. */
export function ResearchList({ rows }: { rows: ResearchRow[] }) {
  return (
    <section aria-labelledby="research-h" className="min-w-0">
      <h2 id="research-h" className="mb-1.5 text-title font-bold tracking-[-0.01em]">
        Research
      </h2>
      {rows.map((r) => {
        const cls = "grid h-[42px] grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-3 border-b border-row text-body transition-colors hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
        const body = (
          <>
            <span className="text-muted-foreground">{r.kind}</span>
            <span className="truncate font-medium">{r.title}</span>
            <span className="text-caption text-muted-foreground">{r.when}</span>
          </>
        );
        return r.external ? (
          <a key={r.kind} href={r.href} target="_blank" rel="noreferrer" className={cls}>
            {body}
          </a>
        ) : (
          <Link key={r.kind} href={r.href} className={cls}>
            {body}
          </Link>
        );
      })}
    </section>
  );
}
