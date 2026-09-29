import Link from "next/link";
import { sessionStamp } from "@/lib/today";
import { fmtBp, fmtChangeBp, fmtChangePct, fmtDateTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BriefDialog, Cited } from "./brief-dialog";
import type { Book, Brief, Effects } from "./types";

/** Helped most / Hurt most, per side. */
const MOVERS = 3;

const bps = (x: number) => Math.round(x * 10_000);
const tone = (v: number | null | undefined) => (v === null || v === undefined || Math.abs(v) < 1e-9 ? "" : v > 0 ? "text-up" : "text-down");

const HEAD = "flex items-baseline justify-between border-b pb-1.5";

/** The last session for the book this reader may see: the result against the benchmark, the return, and who helped and hurt. */
export function LastSessionCard({ book }: { book: Book }) {
  if (book.kind === "none") {
    return (
      <section data-tour="today-result" aria-labelledby="h-last">
        <div className={HEAD}>
          <h2 id="h-last" className="text-body font-bold">
            Last session
          </h2>
        </div>
        <p className="py-2.5 text-body text-muted-foreground">{book.message}</p>
      </section>
    );
  }
  const sorted = [...book.holdings].sort((a, b) => b.contribution - a.contribution);
  const helped = sorted.filter((h) => bps(h.contribution) > 0).slice(0, MOVERS);
  const hurt = sorted.filter((h) => bps(h.contribution) < 0).reverse().slice(0, MOVERS);
  const heroText = book.hero.unit === "%" ? fmtChangePct(book.hero.value) : fmtChangeBp(book.hero.value);

  return (
    <section data-tour="today-result" aria-labelledby="h-last">
      <div className={HEAD}>
        <h2 id="h-last" className="text-body font-bold">
          Last session <span className="font-medium text-muted-foreground">· {sessionStamp(book.sessionDate)}</span>
        </h2>
        <Link href={book.href} className="text-caption text-ink-2 hover:text-foreground">
          Performance
        </Link>
      </div>
      <div className="mt-3 flex items-baseline gap-3" title={book.kind === "team" && book.hero.unit === " bp" ? effectsText(book.effects) : undefined}>
        <span className={cn("figure text-display", tone(book.hero.value))}>{heroText}</span>
        <span className="min-w-0 truncate text-body text-muted-foreground">{book.hero.label}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-4">
        {book.cells.map((c) => (
          <div key={c.label} className="min-w-0" title={c.label === "vs sectors" ? effectsText(book.effects) : undefined}>
            <div className="truncate text-caption text-muted-foreground">{c.label}</div>
            <div className={cn("figure text-title", c.tone && tone(c.value))}>{c.value === null ? "—" : c.unit === "%" ? fmtChangePct(c.value) : fmtChangeBp(c.value)}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-6 border-t pt-3">
        <MoverList title="Helped most" rows={helped} />
        <MoverList title="Hurt most" rows={hurt} />
      </div>
    </section>
  );
}

/** Where the gap to the sector benchmark came from, in bp. The Performance page shows it in full. */
function effectsText(e: Effects | null) {
  return e ? `Against the sector benchmark: allocation ${fmtBp(bps(e.allocation))}, selection ${fmtBp(bps(e.selection))}, interaction ${fmtBp(bps(e.interaction))}` : undefined;
}

function MoverList({ title, rows }: { title: string; rows: { ticker: string; contribution: number }[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-caption text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="flex h-7 items-center border-b border-row text-body text-muted-foreground">—</div>
      ) : (
        rows.map((r) => (
          <div key={r.ticker} className="flex h-7 items-center border-b border-row text-body">
            <span className="flex-1 font-semibold">{r.ticker}</span>
            <span className={cn("tabular-nums", tone(r.contribution))}>{fmtChangeBp(bps(r.contribution))}</span>
          </div>
        ))
      )}
    </div>
  );
}

/** The card's boxes line for line (header, figure, the 3-up, three movers a side), so the card lands without a shift. */
export function LastSessionSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading the last session">
      <div className={HEAD}>
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="mt-3 flex h-[30px] items-center">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="flex h-[17px] items-center">
              <Skeleton className="h-2.5 w-16" />
            </div>
            <div className="flex h-6 items-center">
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-6 border-t pt-3">
        {[0, 1].map((i) => (
          <div key={i}>
            <div className="mb-1 flex h-[17px] items-center">
              <Skeleton className="h-2.5 w-24" />
            </div>
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex h-7 items-center border-b border-row">
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Written Fri, Sep 25, 6:12 PM ET". */
function writtenLine(iso: string | null) {
  return iso ? `Written ${fmtDateTime(iso)}` : null;
}

/** Hoot's evening brief: the lead paragraph in serif with its citations, the rest behind "Read the evening brief". */
export function EveningBrief({ brief }: { brief: Brief }) {
  const [lead] = brief.paragraphs;
  const written = writtenLine(brief.writtenAt);
  const hasMore = brief.paragraphs.length > 1 || brief.sources.length > 0;
  return (
    <section aria-labelledby="h-brief" data-tour="today-brief">
      <div className={HEAD}>
        <h2 id="h-brief" className="text-body font-bold">
          Hoot&rsquo;s evening brief
        </h2>
        {written && <span className="text-caption text-muted-foreground">{written}</span>}
      </div>
      <p className="hoot-prose mt-3 line-clamp-5 text-pretty">
        <Cited text={lead} sources={brief.sources} />
      </p>
      {brief.stale && <p className="mt-1.5 text-caption text-caution-foreground">Hoot wrote this from the evening figures, which have since been revised. The Last session figures are current.</p>}
      {hasMore && <BriefDialog brief={brief} written={written} />}
    </section>
  );
}
