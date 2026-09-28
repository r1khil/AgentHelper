"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtPct, fmtNumber, ppToBp } from "@/lib/format";
import { Move } from "@/components/app/move";
import { Pill } from "@/components/app/panel";
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
  /** "Nov 18 est.", or null when no report is scheduled. */
  nextReport: string | null;
  flags: AttentionFlag[];
};

export type HoldingGroup = { id: string; name: string; navPct: number | null; rows: HoldingListRow[] };

/** Streamed quotes by ticker; absent while Yahoo is still answering (the cells show skeletons). */
export type QuoteCells = Record<string, { price?: number; changePct?: number; relativePp?: number }>;

// Desktop only. Company takes what is left; the minimum width fits a ~920 px content area (a 1,045 px window less the
// rail and padding) without scrolling sideways.
const GRID = "grid grid-cols-[64px_minmax(0,1fr)_64px_64px_80px_76px_76px_96px_168px] items-center gap-3 px-4";
const COLUMNS = 9;

/**
 * The Holdings table: one panel, team group rows that collapse, rows that open the holding. A grid of divs laid out
 * as a table for screen readers too: header row, one row group per team led by a spanning row with the collapse
 * button, and a row header (the ticker link) on every holding.
 */
export function HoldingsTable({ groups, quotes, grouped = true, empty }: { groups: HoldingGroup[]; quotes?: QuoteCells; grouped?: boolean; empty?: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const any = groups.some((g) => g.rows.length > 0);

  return (
    <section data-tour="holdings-table" className="panel flex flex-col overflow-x-auto overflow-y-hidden">
      <div role="table" aria-label="Holdings" className="flex min-w-[920px] flex-col">
        <div role="rowgroup">
          <div role="row" className={cn(GRID, "h-9 shrink-0 border-b text-body text-muted-foreground")}>
            <span role="columnheader">Ticker</span>
            <span role="columnheader">Company</span>
            <span role="columnheader"><ReadAs text="Last 5 days">5 days</ReadAs></span>
            <span role="columnheader" className="text-right"><ReadAs text="Weight, % of NAV">Weight</ReadAs></span>
            <span role="columnheader" className="text-right">Price</span>
            <span role="columnheader" className="text-right"><ReadAs text="Day change">Day</ReadAs></span>
            <span role="columnheader" className="text-right"><ReadAs text="Day versus S&P 500, basis points">vs S&amp;P</ReadAs></span>
            <span role="columnheader">Next report</span>
            <span role="columnheader">Needs attention</span>
          </div>
        </div>
        {!any && (
          <div role="row">
            <div role="cell" aria-colspan={COLUMNS} className="px-4 py-3 text-body text-muted-foreground">{empty ?? "Nothing here."}</div>
          </div>
        )}
        {groups.map((g) => {
          if (!g.rows.length) return null;
          const open = !collapsed.has(g.id);
          return (
            <div key={g.id} role="rowgroup">
              {grouped && (
                <div role="row">
                  <div role="cell" aria-colspan={COLUMNS}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggle(g.id)}
                      className="flex h-9 w-full items-center gap-2.5 border-b bg-band px-4 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                    >
                      {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                      <span className="text-body font-semibold">{g.name}</span>
                      <span className="text-body whitespace-nowrap text-muted-foreground">
                        {g.rows.length} holding{g.rows.length === 1 ? "" : "s"}
                        {g.navPct != null && ` · ${fmtPct(g.navPct, 1)} of NAV`}
                      </span>
                      <span className="flex-1" />
                      <span className="sr-only">, day</span>
                      {quotes ? <Move value={teamDay(g.rows, quotes)} unit="%" digits={2} className="text-body font-medium" /> : <Skeleton className="h-4 w-14" />}
                    </button>
                  </div>
                </div>
              )}
              {open && g.rows.map((r) => <Row key={r.id} r={r} q={quotes?.[r.ticker]} loading={!quotes} />)}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Row({ r, q, loading }: { r: HoldingListRow; q?: QuoteCells[string]; loading: boolean }) {
  const [first, ...rest] = r.flags;
  const shares = r.shares != null ? `${fmtNumber(r.shares, 2)} shares` : "No shares recorded";
  return (
    <div role="row" className={cn(GRID, "relative h-10 border-b border-row text-body transition-colors hover:bg-band")}>
      {/* The ticker link stretches over the whole row; the pills sit above it and keep their own links. */}
      <span role="rowheader">
        <RowLink cover="stretch" href={r.href} aria-label={tickerName(r.ticker, r.company)} title={`${r.ticker} · ${shares}`} className="font-mono text-body font-semibold">
          {r.ticker}
        </RowLink>
      </span>
      <span role="cell" className="truncate text-ink-2">{r.company}</span>
      <span role="cell" className="flex">
        <Sparkline values={r.spark} />
      </span>
      <span role="cell" className="text-right font-mono text-body tabular-nums" title={`${shares}${r.weightPct != null ? ` · ${fmtPct(r.weightPct)} of NAV` : ""}`}>
        {r.weightPct != null ? fmtPct(r.weightPct, 1) : <span className="text-muted-foreground">—</span>}
      </span>
      {loading ? (
        <>
          <Skeleton role="cell" className="ml-auto h-4 w-14" />
          <Skeleton role="cell" className="ml-auto h-4 w-12" />
          <Skeleton role="cell" className="ml-auto h-4 w-12" />
        </>
      ) : (
        <>
          <span role="cell" className="text-right font-mono text-body tabular-nums">{q?.price != null ? fmtMoney(q.price) : <span className="text-muted-foreground">—</span>}</span>
          <Move role="cell" value={q?.changePct} unit="%" digits={2} align className="text-right text-body" />
          <Move role="cell" value={ppToBp(q?.relativePp)} unit=" bp" digits={0} align className="text-right text-body" />
        </>
      )}
      <span role="cell" className="truncate text-body text-ink-2">{r.nextReport ?? <span className="text-muted-foreground">—</span>}</span>
      <span role="cell" className="relative z-[1] flex min-w-0 items-center gap-1.5" title={r.flags.length > 1 ? r.flags.map((f) => f.label).join(" · ") : undefined}>
        {first ? <FlagPill f={first} /> : <span className="text-muted-foreground">—</span>}
        {rest.length > 0 && (
          <>
            <span aria-hidden className="font-mono text-caption text-muted-foreground">+{rest.length}</span>
            <span className="sr-only">Also: {rest.map((f) => f.label).join(", ")}</span>
          </>
        )}
      </span>
    </div>
  );
}

function FlagPill({ f }: { f: AttentionFlag }) {
  const pill = <Pill tone={f.tone} className="max-w-full truncate">{f.label}</Pill>;
  return f.href ? (
    <Link href={f.href} className="min-w-0 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {pill}
    </Link>
  ) : (
    pill
  );
}

/** A team's day: holdings' moves weighted by their NAV weight, or a plain average when no weights are recorded. */
function teamDay(rows: HoldingListRow[], quotes: QuoteCells) {
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
