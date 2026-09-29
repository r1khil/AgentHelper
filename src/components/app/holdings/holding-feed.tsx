import Link from "next/link";
import { cn } from "@/lib/utils";

export type FeedItem = {
  key: string;
  /** "Thread", "Write-up", "Model", "10-Q", "News"… a grey word on the left. */
  kind: string;
  title: React.ReactNode;
  /** The grey line under the title: who, what state, where it came from. */
  sub?: React.ReactNode;
  /** The date or status on the right. */
  when?: React.ReactNode;
  /** Colours `when`: red overdue, amber waiting, grey otherwise. */
  tone?: "overdue" | "caution" | null;
  href?: string;
  external?: boolean;
  /** A tooltip: the full title, a path, a note. */
  hint?: string;
  /** Sort key (ms): newest first on the All tab. */
  at: number;
};

/**
 * The holding page's list: a kind word, the title over a grey line, and the date or status on the right, each row
 * opening its item. The All tab mixes every kind, newest first; each other tab is one kind of it.
 */
export function FeedList({ items, label, empty, className }: { items: FeedItem[]; label: string; empty?: React.ReactNode; className?: string }) {
  if (!items.length) return empty ? <p className={cn("py-4 text-body text-muted-foreground", className)}>{empty}</p> : null;
  return (
    <ul aria-label={label} className={cn("flex flex-col", className)}>
      {items.map((i) => {
        const cls =
          "grid min-h-[54px] grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-row py-2 text-foreground transition-colors hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
        const body = (
          <>
            <span className="truncate text-body text-muted-foreground">{i.kind}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-emph leading-snug">{i.title}</span>
              {i.sub && <span className="truncate text-caption text-muted-foreground">{i.sub}</span>}
            </span>
            <span className={cn("max-w-[190px] truncate text-right text-body", i.tone === "overdue" ? "font-semibold text-down" : i.tone === "caution" ? "text-caution-foreground" : "text-muted-foreground")}>{i.when}</span>
          </>
        );
        return (
          <li key={i.key} className="flex flex-col">
            {!i.href ? (
              <div title={i.hint} className={cn(cls, "hover:bg-transparent")}>
                {body}
              </div>
            ) : i.external ? (
              <a href={i.href} target="_blank" rel="noreferrer" title={i.hint} className={cls}>
                {body}
              </a>
            ) : (
              <Link href={i.href} title={i.hint} className={cls}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A titled part of a tab: a 15px semibold heading, an optional grey note or action on the right, then its rows. */
export function TabSection({ id, title, count, aside, children, className }: { id: string; title: string; count?: number; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("mt-7 min-w-0 first:mt-3", className)}>
      <div className="flex min-h-9 items-center gap-2 border-b pb-1.5">
        <h2 id={id} className="text-emph font-semibold">
          {title}
          {count ? <span className="ml-1.5 text-caption font-semibold text-muted-foreground tabular-nums">{count}</span> : null}
        </h2>
        <span className="flex-1" />
        {aside && <div className="flex items-center gap-2 text-body text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
