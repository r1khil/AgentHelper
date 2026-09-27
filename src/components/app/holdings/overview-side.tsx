import Link from "next/link";
import { cn } from "@/lib/utils";

export type GlanceRow = { label: string; value: React.ReactNode; action?: React.ReactNode; title?: string };

/** The at-a-glance list: 42px rows, a 108px muted label, the value, and an optional action on the right. */
export function GlancePanel({ rows }: { rows: GlanceRow[] }) {
  return (
    <section className="panel shrink-0 overflow-hidden" aria-label="At a glance">
      <dl>
        {rows.map((r) => (
          <div key={r.label} className="flex h-[42px] items-center gap-2.5 border-b border-row px-4 text-[13.5px] last:border-b-0">
            <dt className="w-[108px] shrink-0 text-muted-foreground">{r.label}</dt>
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
  /** A filing from the last few days: pink tag. */
  hot?: boolean;
  /** Sort key (ms). */
  at: number;
};

/** "Latest": filings, news, Drive files and models in one list, newest first; rows share the panel's height. */
export function LatestPanel({ items, className }: { items: LatestItem[]; className?: string }) {
  return (
    <section className={cn("panel flex min-h-[260px] flex-col overflow-hidden", className)}>
      <div className="flex h-[42px] shrink-0 items-center border-b px-4">
        <h2 className="flex-1 text-[14.5px] font-semibold">Latest</h2>
        <span className="text-[12.5px] whitespace-nowrap text-muted-foreground">Filings, news and Drive</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Nothing filed, reported or uploaded for this holding yet.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col">
          {items.map((it, i) => {
            const body = (
              <>
                <span className={cn("grid h-5 min-w-[50px] shrink-0 place-items-center rounded-full px-1.5 font-mono text-[10.5px] font-medium", it.hot ? "bg-hoot text-hoot-foreground" : "bg-muted text-ink-2")}>{it.kind}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] leading-snug">{it.title}</span>
                  <span className="mt-px block truncate text-xs text-muted-foreground">{it.meta}</span>
                </span>
              </>
            );
            const cls = "flex min-h-[52px] flex-1 items-center gap-2.5 px-4 py-1.5";
            return (
              <li key={i} className="flex flex-1 border-b border-row last:border-b-0">
                {it.href ? (
                  it.external ? (
                    <a href={it.href} target="_blank" rel="noreferrer" className={cn(cls, "w-full transition-colors hover:bg-band")}>
                      {body}
                    </a>
                  ) : (
                    <Link href={it.href} className={cn(cls, "w-full transition-colors hover:bg-band")}>
                      {body}
                    </Link>
                  )
                ) : (
                  <div className={cn(cls, "w-full")}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
