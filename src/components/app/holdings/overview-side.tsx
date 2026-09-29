import Link from "next/link";
import { cn } from "@/lib/utils";

export type GlanceRow = { label: string; value: React.ReactNode; action?: React.ReactNode; title?: string };

/** Who covers the holding and what is next on it: 40px rows split by hairlines, an action on the right where there is one. */
export function GlancePanel({ rows, title = "Coverage" }: { rows: GlanceRow[]; title?: string }) {
  return (
    <section aria-labelledby="coverage-h" className="min-w-0">
      <h2 id="coverage-h" className="text-title font-bold tracking-[-0.01em]">
        {title}
      </h2>
      <dl className="mt-2">
        {rows.map((r) => (
          <div key={r.label} className="flex h-10 items-center gap-2.5 border-b border-row text-body">
            <dt className="w-[108px] shrink-0 text-ink-2">{r.label}</dt>
            <dd className="min-w-0 flex-1 truncate font-medium" title={r.title}>
              {r.value}
            </dd>
            {r.action && <dd className="shrink-0">{r.action}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

export type LatestItem = {
  /** 8-K, 10-Q, NEWS, DRIVE, MODEL… */
  kind: string;
  title: string;
  meta: string;
  href?: string;
  external?: boolean;
  /** A filing from the last few days: the kind reads in ink. */
  hot?: boolean;
  /** Sort key (ms). */
  at: number;
};

/** "Latest": filings, news, Drive files and models in one list, newest first. */
export function LatestPanel({ items, className }: { items: LatestItem[]; className?: string }) {
  return (
    <section aria-labelledby="latest-h" className={cn("min-w-0", className)}>
      <div className="flex items-baseline gap-2">
        <h2 id="latest-h" className="flex-1 text-title font-bold tracking-[-0.01em]">
          Latest
        </h2>
        <span className="text-caption whitespace-nowrap text-muted-foreground">Filings, news and Drive</span>
      </div>
      {items.length === 0 ? (
        <p className="pt-2 text-body text-muted-foreground">Nothing filed, reported or uploaded for this holding yet.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col">
          {items.map((it, i) => {
            const body = (
              <>
                <span className={cn("truncate text-caption font-semibold", it.hot ? "text-foreground" : "text-muted-foreground")}>{it.kind}</span>
                <span className="min-w-0">
                  <span className="block truncate text-body leading-snug font-medium">{it.title}</span>
                  <span className="block truncate text-caption text-muted-foreground">{it.meta}</span>
                </span>
              </>
            );
            const cls = "grid min-h-12 w-full grid-cols-[58px_minmax(0,1fr)] items-center gap-3 border-b border-row py-1.5 transition-colors hover:bg-band";
            return (
              <li key={i} className="flex">
                {it.href ? (
                  it.external ? (
                    <a href={it.href} target="_blank" rel="noreferrer" className={cls}>
                      {body}
                    </a>
                  ) : (
                    <Link href={it.href} className={cls}>
                      {body}
                    </Link>
                  )
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
