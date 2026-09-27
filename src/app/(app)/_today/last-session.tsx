import Link from "next/link";
import { DateTime } from "luxon";
import { NY } from "@/lib/providers/calendar";
import { sessionStamp, signed } from "@/lib/today";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BriefDialog, Cited } from "./brief-dialog";
import type { Book, Brief, Effects } from "./types";

/** Helped most / Hurt most, per side. */
const MOVERS = 3;

const bps = (x: number) => Math.round(x * 10_000);
const onRail = (v: number | null | undefined) => (v === null || v === undefined || Math.abs(v) < 1e-9 ? "" : v > 0 ? "text-up-on-rail" : "text-down-on-rail");

/** The dark scoreboard: the last session for the book this reader may see. */
export function LastSessionCard({ book }: { book: Book }) {
  if (book.kind === "none") {
    return (
      <section data-tour="today-result" className="shrink-0 rounded-[14px] bg-rail px-5 py-[18px] text-cream">
        <div className="label-mono text-rail-label">Last session</div>
        <p className="mt-3 text-[14px] text-rail-label">{book.message}</p>
      </section>
    );
  }
  const sorted = [...book.holdings].sort((a, b) => b.contribution - a.contribution);
  const helped = sorted.filter((h) => bps(h.contribution) > 0).slice(0, MOVERS);
  const hurt = sorted.filter((h) => bps(h.contribution) < 0).reverse().slice(0, MOVERS);

  return (
    <section data-tour="today-result" aria-label="Last session" className="shrink-0 rounded-[14px] bg-rail px-5 py-[18px] text-cream">
      <div className="flex items-baseline justify-between gap-3 leading-4">
        <span className="label-mono text-rail-label">Last session · {sessionStamp(book.sessionDate)}</span>
        <Link href={book.href} className="text-[13px] font-medium whitespace-nowrap hover:underline">
          Attribution →
        </Link>
      </div>
      <div className="mt-2.5 flex items-baseline gap-3">
        <span className={cn("font-mono text-[44px] leading-none font-medium tracking-[-0.04em] tabular-nums", onRail(book.ret))}>{signed(book.ret, 2, "%")}</span>
        <span className="truncate text-[13px] text-rail-label">{book.label}</span>
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-2.5">
        {book.cells.map((c) => (
          <div key={c.label} className="min-w-0" title={c.label === "vs sectors" || (c.label === "Difference" && book.kind === "team") ? effectsText(book.effects) : undefined}>
            <div className="truncate text-xs text-rail-label">{c.label}</div>
            <div className={cn("font-mono text-[17px] leading-[21px] font-medium tabular-nums", c.tone && onRail(c.value))}>{signed(c.value, c.unit === "%" ? 2 : 0, c.unit)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-5 border-t border-rail-line pt-3">
        <MoverList title="Helped most, bp" rows={helped} />
        <MoverList title="Hurt most, bp" rows={hurt} />
      </div>
    </section>
  );
}

/** Where the gap to the sector benchmark came from, in bp. The Attribution page shows it in full. */
function effectsText(e: Effects | null) {
  return e ? `Against the sector benchmark: allocation ${signed(bps(e.allocation), 0)}, selection ${signed(bps(e.selection), 0)}, interaction ${signed(bps(e.interaction), 0)} bp` : undefined;
}

function MoverList({ title, rows }: { title: string; rows: { ticker: string; contribution: number }[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs text-rail-label">{title}</div>
      {rows.length === 0 ? (
        <div className="flex h-6 items-center font-mono text-[13px] text-rail-foreground">—</div>
      ) : (
        rows.map((r) => (
          <div key={r.ticker} className="flex h-6 items-center font-mono text-[13px]">
            <span className="flex-1 font-semibold">{r.ticker}</span>
            <span className={cn("tabular-nums", onRail(r.contribution))}>{signed(bps(r.contribution), 0)}</span>
          </div>
        ))
      )}
    </div>
  );
}

export function LastSessionSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading the last session" className="h-[274px] shrink-0 rounded-[14px] bg-rail px-5 py-[18px]">
      <Skeleton className="h-3 w-40 bg-rail-2" />
      <Skeleton className="mt-4 h-10 w-44 bg-rail-2" />
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 bg-rail-2" />
        ))}
      </div>
      <Skeleton className="mt-6 h-16 bg-rail-2" />
    </section>
  );
}

/** "Written 6:12 pm Friday". */
function writtenLine(iso: string | null) {
  if (!iso) return null;
  const t = DateTime.fromISO(iso).setZone(NY);
  return `Written ${t.toFormat("h:mm")} ${t.toFormat("a").toLowerCase()} ${t.toFormat("cccc")}`;
}

/** Hoot's evening brief: the lead paragraph with its citations, the rest behind "Read the full brief". */
export function EveningBrief({ brief }: { brief: Brief }) {
  const [lead] = brief.paragraphs;
  const written = writtenLine(brief.writtenAt);
  const hasMore = brief.paragraphs.length > 1 || brief.sources.length > 0;
  return (
    <section aria-label="Hoot's evening brief" className="panel shrink-0 px-[18px] py-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[14.5px] leading-5 font-semibold">Hoot&rsquo;s evening brief</h2>
        <span className="flex-1" />
        {written && <span className="text-[12.5px] whitespace-nowrap text-muted-foreground">{written}</span>}
      </div>
      <p className="mt-2 line-clamp-4 text-[14.5px] leading-[1.55] text-pretty">
        <Cited text={lead} sources={brief.sources} />
      </p>
      {brief.stale && <p className="mt-1.5 text-xs text-muted-foreground">Hoot wrote this from the evening figures, which have since been revised. The Last session figures are current.</p>}
      {hasMore && <BriefDialog brief={brief} written={written} />}
    </section>
  );
}
