import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtChangeBp, fmtChangePct } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MoverRow = {
  ticker: string;
  name: string;
  /** Today's move in percent. */
  pct: number;
  /** What it added to the book, in bp; null for readers who don't see position sizes. */
  bp: number | null;
  href?: string;
};

const tone = (v: number) => (Math.abs(v) < 0.005 ? "text-muted-foreground" : v > 0 ? "text-up" : "text-down");

/**
 * "Moving the book today": the five holdings that moved the book most (a reader without the book sees today's biggest
 * moves among their team's holdings, with no basis-point column): ticker and company, the day's move, what it added.
 */
export function Movers({ rows, portfolioHref, note }: { rows: MoverRow[]; portfolioHref: string; note?: string }) {
  const withBp = rows.some((r) => r.bp !== null);
  return (
    <section aria-labelledby="h-move" data-tour="today-movers">
      <div className="flex items-baseline justify-between border-b pb-1.5">
        <h2 id="h-move" className="text-body font-bold">
          {withBp ? "Moving the book today" : "Moving your holdings today"}
        </h2>
        <Link href={portfolioHref} className="text-caption text-ink-2 hover:text-foreground">
          {withBp ? "Portfolio" : "Holdings"}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-2.5 text-body text-muted-foreground">{note ?? "No moves to show yet."}</p>
      ) : (
        rows.map((r) => {
          const cells = (
            <>
              <span className="min-w-0 truncate">
                <b className="font-semibold">{r.ticker}</b> <span className="text-muted-foreground">{r.name}</span>
              </span>
              <span className={cn("text-right font-medium", tone(r.pct))}>{fmtChangePct(r.pct)}</span>
              {withBp && <span className={cn("text-right text-caption", r.bp === null ? "text-muted-foreground" : tone(r.bp))}>{r.bp === null ? "" : fmtChangeBp(r.bp, 1)}</span>}
            </>
          );
          const cls = cn("grid h-[38px] items-center gap-2 border-b border-row text-body no-underline", withBp ? "grid-cols-[minmax(0,1fr)_64px_64px]" : "grid-cols-[minmax(0,1fr)_64px]");
          return r.href ? (
            <Link key={r.ticker} href={r.href} className={cn(cls, "hover:bg-band focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring")}>
              {cells}
            </Link>
          ) : (
            <div key={r.ticker} className={cls}>
              {cells}
            </div>
          );
        })
      )}
      {note && rows.length > 0 && <p className="mt-1.5 text-caption text-muted-foreground">{note}</p>}
    </section>
  );
}

/** The column's boxes while the numbers load: the heading, five 38px rows. */
export function MoversSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading today's moves">
      <div className="flex items-baseline justify-between border-b pb-1.5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-14" />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex h-[38px] items-center border-b border-row">
          <Skeleton className="h-3.5 w-full" />
        </div>
      ))}
    </section>
  );
}
