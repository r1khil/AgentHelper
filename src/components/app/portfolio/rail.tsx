import Link from "next/link";
import { HoldingLogo } from "@/components/app/holding-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtChangeBp, fmtChangePct, fmtDateTime, fmtDay } from "@/lib/format";
import type { MarketSnapshot } from "@/lib/market";
import { holdingHref } from "@/lib/scope";
import { cn } from "@/lib/utils";
import type { ScopeBook } from "./book-load";
import { BriefDialog, Cited } from "./brief-dialog";
import type { Book, Effects } from "./rail-load";

// The Positions view's right column: ask Hoot about the book, what is moving it today, and the last session with
// Hoot's evening brief. Cards on the raised surface; everything else on the page sits on hairlines.

const CARD = "rounded-xl bg-surface p-4";
/** Movers listed under "Moving the book today". */
const MOVERS = 5;
/** Helped most and Hurt most, per side. */
const SIDE = 3;

const bps = (x: number) => Math.round(x * 10_000);
const tone = (v: number | null | undefined) => (v === null || v === undefined || Math.abs(v) < 1e-9 ? "text-muted-foreground" : v > 0 ? "text-up" : "text-down");

export type MoverRow = { ticker: string; name: string; /** Percent. */ pct: number; /** What it added to the book, in bp; null for readers without the book. */ bp: number | null; href?: string };

/**
 * "Moving the book today": the holdings that moved the book most, with the day's move and what it added in bp. A
 * reader without the book sees the biggest moves among the team's holdings, with no bp column.
 */
export function MoversCard({ rows, note }: { rows: MoverRow[]; note?: string }) {
  const withBp = rows.some((r) => r.bp !== null);
  const grid = withBp ? "grid-cols-[minmax(0,1fr)_64px_64px]" : "grid-cols-[minmax(0,1fr)_64px]";
  return (
    <section aria-labelledby="rail-movers" className={CARD}>
      <h2 id="rail-movers" className="mb-1.5 text-body font-semibold">
        {withBp ? "Moving the book today" : "Moving the holdings today"}
      </h2>
      {rows.length === 0 ? (
        <p className="py-2 text-body text-muted-foreground">{note ?? "No moves to show yet."}</p>
      ) : (
        <>
          {rows.map((r) => {
            const cells = (
              <>
                <span className="flex min-w-0 items-center gap-2" title={r.name || undefined}>
                  <HoldingLogo ticker={r.ticker} size={20} />
                  <b className="truncate font-semibold">{r.ticker}</b>
                </span>
                <span className={cn("text-right", tone(r.pct))}>{fmtChangePct(r.pct)}</span>
                {withBp && (
                  <span className={cn("text-right", tone(r.bp))} title="What it added to the book today">
                    {r.bp === null ? "" : fmtChangeBp(r.bp, 1)}
                  </span>
                )}
              </>
            );
            const cls = cn("grid h-9 items-center gap-2 border-b border-row text-body tabular-nums last:border-b-0", grid);
            return r.href ? (
              <Link key={r.ticker} href={r.href} aria-label={r.name ? `${r.ticker}, ${r.name}` : r.ticker} className={cn(cls, "-mx-2 rounded-md px-2 hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}>
                {cells}
              </Link>
            ) : (
              <div key={r.ticker} className={cls}>
                {cells}
              </div>
            );
          })}
          {note && <p className="mt-1.5 text-caption text-muted-foreground">{note}</p>}
        </>
      )}
    </section>
  );
}

/**
 * The book's own movers: each holding's move today and what it added to the fund (or the team's sleeve). Each opens its
 * holding in the scope in view (`teamSlugs` maps a position's team to its slug).
 */
export async function BookMovers({ book, scopeSlug, teamSlugs }: { book: Promise<ScopeBook | null>; scopeSlug: string; teamSlugs: Record<string, string> }) {
  const b = await book;
  const hrefFor = (ticker: string, teamId: string | null) => holdingHref(scopeSlug, teamSlugs[teamId ?? ""] ?? scopeSlug, ticker);
  if (!b) return <MoversCard rows={[]} note="No positions in the ledger yet." />;
  const rows: MoverRow[] = b.positions
    .filter((p) => p.dayPct !== null)
    .map((p) => ({ ticker: p.ticker, name: p.name, pct: p.dayPct!, bp: (b.contributions.get(p.ticker) ?? 0) * 10_000, href: hrefFor(p.ticker, p.teamId) }))
    .sort((x, y) => Math.abs(y.bp ?? 0) - Math.abs(x.bp ?? 0))
    .slice(0, MOVERS);
  const note = b.status === "live" ? "Prices are live during market hours." : b.status === "provisional" ? "Market closed; priced from closing quotes." : undefined;
  return <MoversCard rows={rows} note={note} />;
}

/** For readers without the book: the biggest moves among the team's holdings, from the market quotes. */
export async function MarketMovers({ market, hrefFor, names }: { market: Promise<MarketSnapshot>; hrefFor: Record<string, string>; names: Record<string, string> }) {
  const m = await market;
  const rows: MoverRow[] = Object.entries(m.rows)
    .flatMap(([ticker, r]) => (r.quote?.changePct === undefined ? [] : [{ ticker, name: names[ticker] ?? "", pct: r.quote.changePct, bp: null, href: hrefFor[ticker] }]))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, MOVERS);
  return <MoversCard rows={rows} note={rows.length === 0 ? "Quotes are unavailable right now." : "Prices are live during market hours."} />;
}

/** Where the gap to the sector benchmark came from, in bp. */
function effectsLine(e: Effects | null) {
  if (!e) return null;
  const f = (x: number) => fmtChangeBp(bps(x));
  return `Allocation ${f(e.allocation)}, selection ${f(e.selection)}, interaction ${f(e.interaction)} against the sector benchmark.`;
}

const figure = (value: number | null, unit: "%" | " bp") => (value === null ? "—" : unit === "%" ? fmtChangePct(value) : fmtChangeBp(value));

/**
 * The last closed session: the result against the benchmark, the return beside it, Hoot's words on it in serif (the
 * evening brief's lead for the fund, else his one sentence), who helped and hurt, and the whole brief in a dialog.
 */
export async function LastSessionCard({ book }: { book: Promise<Book> }) {
  const b = await book;
  if (b.kind === "none") {
    return (
      <section aria-labelledby="rail-last" className={CARD}>
        <h2 id="rail-last" className="text-body font-semibold">
          Last session
        </h2>
        <p className="mt-2 text-body text-muted-foreground">{b.message}</p>
      </section>
    );
  }
  const [first, second, third] = b.cells;
  const sorted = [...b.holdings].sort((x, y) => y.contribution - x.contribution);
  const helped = sorted.filter((h) => bps(h.contribution) > 0).slice(0, SIDE);
  const hurt = sorted.filter((h) => bps(h.contribution) < 0).reverse().slice(0, SIDE);
  const lead = b.brief?.paragraphs[0] ?? null;
  const written = b.brief?.writtenAt ? `Written ${fmtDateTime(b.brief.writtenAt)}` : null;
  // With a benchmark the figure is the difference and the line reads "Owl Fund (1.06%) vs S&P 500 (0.77%)"; without
  // one the figure is the return and the line is the benchmark alone.
  const versus = b.hero.unit === " bp" ? `${first.label} ${figure(first.value, first.unit)} vs ${second.label} ${figure(second.value, second.unit)}` : `${first.label} ${figure(first.value, first.unit)}`;
  return (
    <section aria-labelledby="rail-last" className={CARD}>
      <h2 id="rail-last" className="text-body font-semibold">
        <Link href={b.href} className="hover:underline">
          Last session, {fmtDay(b.sessionDate)}
        </Link>
      </h2>
      <div className={cn("figure mt-2 text-display", tone(b.hero.value))}>{figure(b.hero.value, b.hero.unit)}</div>
      <div className="text-caption text-muted-foreground">{versus}</div>
      {third && (
        <div className="text-caption text-muted-foreground" title={effectsLine(b.effects) ?? undefined}>
          {third.label} <span className={cn(third.tone && tone(third.value))}>{figure(third.value, third.unit)}</span>
        </div>
      )}
      {(lead ?? b.sentence) && (
        <p className="mt-2.5 line-clamp-5 font-serif text-emph text-pretty text-ink-2">{lead ? <Cited text={lead} sources={b.brief!.sources} /> : b.sentence}</p>
      )}
      {b.brief?.stale && <p className="mt-1.5 text-caption text-caution-foreground">Hoot wrote this from the evening figures, which have since been revised. The figures above are current.</p>}
      {b.brief && <BriefDialog brief={b.brief} written={written} />}
      <div className="mt-3 grid grid-cols-2 gap-4 border-t pt-2.5">
        <SideList title="Helped most" rows={helped} />
        <SideList title="Hurt most" rows={hurt} />
      </div>
    </section>
  );
}

function SideList({ title, rows }: { title: string; rows: { ticker: string; contribution: number }[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 text-caption text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="flex h-6 items-center text-body text-muted-foreground">—</div>
      ) : (
        rows.map((r) => (
          <div key={r.ticker} className="flex h-6 items-center text-body">
            <span className="flex-1 font-semibold">{r.ticker}</span>
            <span className={cn("tabular-nums", tone(r.contribution))}>{fmtChangeBp(bps(r.contribution))}</span>
          </div>
        ))
      )}
    </div>
  );
}

/** A card's boxes while it loads. */
export function RailCardSkeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <section aria-busy="true" aria-label={label} className={CARD}>
      <Skeleton className="mb-3 h-3.5 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-9 items-center border-b border-row last:border-b-0">
          <Skeleton className="h-3.5 w-full" />
        </div>
      ))}
    </section>
  );
}

