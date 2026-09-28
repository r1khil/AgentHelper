"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import { Move } from "@/components/app/move";
import { Pill } from "@/components/app/panel";
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
  owner: string | null;
};

export type HoldingGroup = { id: string; name: string; navPct: number | null; rows: HoldingListRow[] };

/** Streamed quotes by ticker; absent while Yahoo is still answering (the cells show skeletons). */
export type QuoteCells = Record<string, { price?: number; changePct?: number; relativePp?: number }>;

const GRID = "grid grid-cols-[64px_minmax(0,1fr)_72px_64px_84px_76px_76px_104px_176px_112px] items-center gap-3 px-4";

/** The Holdings table: one panel, team group rows that collapse, rows that open the holding. */
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
      <div className="flex min-w-[1100px] flex-col">
        <div role="row" className={cn(GRID, "h-9 shrink-0 border-b text-xs text-muted-foreground")}>
          <span>Ticker</span>
          <span>Company</span>
          <span>5 days</span>
          <span className="text-right">Weight</span>
          <span className="text-right">Price</span>
          <span className="text-right">Day</span>
          <span className="text-right">vs S&amp;P</span>
          <span>Next report</span>
          <span>Needs attention</span>
          <span>Owner</span>
        </div>
        {!any && <div className="px-4 py-3 text-sm text-muted-foreground">{empty ?? "Nothing here."}</div>}
        {groups.map((g) => {
          if (!g.rows.length) return null;
          const open = !collapsed.has(g.id);
          return (
            <div key={g.id} role="rowgroup">
              {grouped && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(g.id)}
                  className="flex h-9 w-full items-center gap-2.5 border-b bg-band px-4 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                >
                  {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                  <span className="text-[13.5px] font-semibold">{g.name}</span>
                  <span className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                    {g.rows.length} holding{g.rows.length === 1 ? "" : "s"}
                    {g.navPct != null && ` · ${g.navPct.toFixed(1)}% of NAV`}
                  </span>
                  <span className="flex-1" />
                  {quotes ? <Move value={teamDay(g.rows, quotes)} unit="%" digits={2} className="text-[13px] font-medium" /> : <Skeleton className="h-4 w-14" />}
                </button>
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
  const shares = r.shares != null ? `${r.shares.toLocaleString("en-US", { maximumFractionDigits: 2 })} shares` : "No shares recorded";
  return (
    <div role="row" className={cn(GRID, "relative h-10 border-b border-row text-sm transition-colors hover:bg-band")}>
      {/* The ticker link stretches over the whole row; the pills sit above it and keep their own links. */}
      <Link href={r.href} title={`${r.ticker} · ${shares}`} className="font-mono text-[13.5px] font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset">
        {r.ticker}
      </Link>
      <span className="truncate text-ink-2">{r.company}</span>
      <Sparkline values={r.spark} />
      <span className="text-right font-mono text-[13px] tabular-nums" title={`${shares}${r.weightPct != null ? ` · ${r.weightPct.toFixed(2)}% of NAV` : ""}`}>
        {r.weightPct != null ? `${r.weightPct.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
      </span>
      {loading ? (
        <>
          <Skeleton className="ml-auto h-4 w-14" />
          <Skeleton className="ml-auto h-4 w-12" />
          <Skeleton className="ml-auto h-4 w-12" />
        </>
      ) : (
        <>
          <span className="text-right font-mono text-[13px] tabular-nums">{q?.price != null ? fmtMoney(q.price) : <span className="text-muted-foreground">—</span>}</span>
          <Move value={q?.changePct} unit="%" digits={2} className="text-right text-[13px]" />
          <Move value={q?.relativePp} unit=" pp" digits={1} className="text-right text-[13px]" />
        </>
      )}
      <span className="truncate text-[13px] text-ink-2">{r.nextReport ?? <span className="text-muted-foreground">—</span>}</span>
      <span className="relative z-[1] flex min-w-0 items-center gap-1.5" title={r.flags.length > 1 ? r.flags.map((f) => f.label).join(" · ") : undefined}>
        {first ? <FlagPill f={first} /> : <span className="text-muted-foreground">—</span>}
        {rest.length > 0 && <span className="font-mono text-[11px] text-muted-foreground">+{rest.length}</span>}
      </span>
      <span className={cn("truncate text-[13.5px]", !r.owner && "text-caution-foreground")}>{r.owner ?? "Unassigned"}</span>
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
