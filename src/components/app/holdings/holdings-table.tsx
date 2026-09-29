import Link from "next/link";
import { cn } from "@/lib/utils";
import { fmtChangeBp, fmtChangePct, fmtMoney, fmtNumber, fmtPct, ppToBp } from "@/lib/format";
import { Delta } from "@/components/app/portfolio/figures";
import { ReadAs, tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "./sparkline";
import type { AttentionFlag } from "./attention";

export type HoldingListRow = {
  id: string;
  ticker: string;
  company: string;
  href: string;
  weightPct: number | null;
  shares: number | null;
  /** Last few stored closes, oldest first. */
  spark: number[];
  /** "Nov 18 (est.)", or null when no report is scheduled. */
  nextReport: string | null;
  flags: AttentionFlag[];
};

/** Streamed quotes by ticker; absent while Yahoo is still answering (the cells show skeletons). */
export type QuoteCells = Record<string, { price?: number; changePct?: number; relativePp?: number }>;

// Desktop only. Holding takes what is left; the number columns are as wide as their figures and the attention column
// keeps room for a label over a line of why.
const GRID = "grid grid-cols-[minmax(0,1.3fr)_80px_80px_80px_80px_70px_110px_minmax(0,1.4fr)] items-center gap-3";
const GRID_NO_WEIGHT = "grid grid-cols-[minmax(0,1.3fr)_80px_80px_80px_80px_110px_minmax(0,1.4fr)] items-center gap-3";

const FLAG_TONE = { hoot: "text-down", caution: "text-caution-foreground", neutral: "text-foreground" } as const;

/**
 * A team's holdings: one row each, opening the holding. A grid of divs laid out as a table for screen readers too:
 * a header row, and a row header (the ticker link) on every holding. The quotes stream in; until then the price and
 * moves are skeletons.
 */
export function HoldingsTable({ rows, quotes, label = "Holdings", empty, showWeight = true }: { rows: HoldingListRow[]; quotes?: QuoteCells; label?: string; empty?: React.ReactNode; /** Position sizes are for the team's leads, execs and admins (docs/PRODUCT.md, Access). */ showWeight?: boolean }) {
  const grid = showWeight ? GRID : GRID_NO_WEIGHT;
  return (
    <div role="table" aria-label={label} data-tour="holdings-table" className="mt-2.5 text-body">
      <div role="row" className={cn(grid, "h-8 border-b text-caption text-muted-foreground")}>
        <span role="columnheader">Holding</span>
        <span role="columnheader"><ReadAs text="Last 5 days">5 days</ReadAs></span>
        <span role="columnheader" className="text-right">Price</span>
        <span role="columnheader" className="text-right"><ReadAs text="Day change">Today</ReadAs></span>
        <span role="columnheader" className="text-right"><ReadAs text="Day versus S&P 500, basis points">vs S&amp;P</ReadAs></span>
        {showWeight && <span role="columnheader" className="text-right"><ReadAs text="Weight, % of NAV">Weight</ReadAs></span>}
        <span role="columnheader">Next report</span>
        <span role="columnheader">Needs attention</span>
      </div>
      {rows.length === 0 && (
        <div role="row">
          <div role="cell" aria-colspan={showWeight ? 8 : 7} className="py-3 text-body text-muted-foreground">{empty ?? "Nothing here."}</div>
        </div>
      )}
      {rows.map((r) => (
        <Row key={r.id} r={r} q={quotes?.[r.ticker]} loading={!quotes} showWeight={showWeight} grid={grid} />
      ))}
    </div>
  );
}

function Row({ r, q, loading, showWeight, grid }: { r: HoldingListRow; q?: QuoteCells[string]; loading: boolean; showWeight: boolean; grid: string }) {
  const [first, ...rest] = r.flags;
  const shares = !showWeight ? null : r.shares != null ? `${fmtNumber(r.shares, 2)} shares` : "No shares recorded";
  const bp = ppToBp(q?.relativePp);
  return (
    <div role="row" className={cn(grid, "relative h-12 border-b border-row transition-colors hover:bg-band")}>
      {/* The ticker link stretches over the whole row; the attention link sits above it and keeps its own. */}
      <span role="rowheader" className="min-w-0">
        <RowLink cover="stretch" href={r.href} aria-label={tickerName(r.ticker, r.company)} title={shares ? `${r.ticker} · ${shares}` : r.ticker} className="flex min-w-0 flex-col">
          <span className="font-semibold">{r.ticker}</span>
          <span className="truncate text-caption text-muted-foreground">{r.company}</span>
        </RowLink>
      </span>
      <span role="cell">
        <Sparkline values={r.spark} />
      </span>
      {loading ? (
        <>
          <span role="cell" className="flex justify-end"><Skeleton className="h-4 w-14" /></span>
          <span role="cell" className="flex justify-end"><Skeleton className="h-4 w-12" /></span>
          <span role="cell" className="flex justify-end"><Skeleton className="h-4 w-12" /></span>
        </>
      ) : (
        <>
          <span role="cell" className="text-right">{q?.price != null ? fmtMoney(q.price) : <span className="text-muted-foreground">—</span>}</span>
          <span role="cell" className="text-right">{q?.changePct != null ? <Delta text={fmtChangePct(q.changePct)} weight="medium" align /> : <span className="text-muted-foreground">—</span>}</span>
          <span role="cell" className="text-right">{bp != null ? <Delta text={fmtChangeBp(bp)} weight="normal" align /> : <span className="text-muted-foreground">—</span>}</span>
        </>
      )}
      {showWeight && <span role="cell" className="text-right">{r.weightPct != null ? fmtPct(r.weightPct) : <span className="text-muted-foreground">—</span>}</span>}
      <span role="cell" className="truncate text-ink-2">{r.nextReport ?? <span className="text-muted-foreground">—</span>}</span>
      <span role="cell" className="relative z-[1] flex min-w-0 flex-col" title={r.flags.length > 1 ? r.flags.map((f) => f.label).join(" · ") : undefined}>
        {first ? (
          <>
            <FlagLabel f={first} />
            {(first.detail || rest.length > 0) && (
              <span className="truncate text-caption text-muted-foreground">
                {first.detail}
                {first.detail && rest.length > 0 ? " · " : ""}
                {rest.length > 0 && <span aria-hidden>+{rest.length} more</span>}
                {rest.length > 0 && <span className="sr-only">Also: {rest.map((f) => f.label).join(", ")}</span>}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    </div>
  );
}

function FlagLabel({ f }: { f: AttentionFlag }) {
  const label = <span className={cn("truncate font-semibold", FLAG_TONE[f.tone])}>{f.label}</span>;
  return f.href ? (
    <Link href={f.href} className="min-w-0 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring">
      {label}
    </Link>
  ) : (
    label
  );
}

/** A team's day: holdings' moves weighted by their NAV weight, or a plain average when no weights are recorded. */
export function teamDay(rows: HoldingListRow[], quotes: QuoteCells) {
  let wsum = 0;
  let acc = 0;
  let n = 0;
  let plain = 0;
  for (const r of rows) {
    const c = quotes[r.ticker]?.changePct;
    if (c == null || !Number.isFinite(c)) continue;
    n++;
    plain += c;
    if (r.weightPct != null && r.weightPct > 0) {
      wsum += r.weightPct;
      acc += r.weightPct * c;
    }
  }
  if (wsum > 0) return acc / wsum;
  return n ? plain / n : null;
}
