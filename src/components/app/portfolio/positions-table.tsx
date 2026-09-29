"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { RowLink } from "@/components/app/row-link";
import { Sparkline } from "@/components/app/holdings/sparkline";
import { HoldingLogo } from "@/components/app/holding-logo";
import { fixed, fmtChangeBp, fmtChangeMoney, fmtChangePct, fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AttentionFlag } from "@/components/app/holdings/attention";
import { Delta } from "./figures";

export type PositionLine = { ticker: string; name: string; href: string; shares: number; price: number; dayPct: number | null; dayPnl: number; value: number; weight: number; gain: number; cost: number };
export type PositionGroup = { id: string; name: string; lines: PositionLine[] };

/** What a team's page kept on each holding: its next report and what needs attention, first flag first. */
export type PositionNote = { nextReport: string | null; flags: AttentionFlag[] };
/** A holding the team covers that the ledger doesn't hold: listed so the table is the team's whole list. */
export type UnheldLine = { ticker: string; name: string; href: string };

type ColKey = "spark" | "last" | "today" | "vs" | "value" | "weight" | "gain" | "report";
const COLS: { key: ColKey; label: string; width: string; align?: "right"; hint?: string }[] = [
  { key: "spark", label: "Intraday", width: "72px" },
  { key: "last", label: "Last", width: "76px", align: "right" },
  { key: "today", label: "Today", width: "72px", align: "right" },
  { key: "vs", label: "vs S&P", width: "64px", align: "right", hint: "Today against the S&P 500, basis points" },
  { key: "value", label: "Market value", width: "104px", align: "right" },
  { key: "weight", label: "Weight", width: "60px", align: "right" },
  { key: "gain", label: "Total gain", width: "96px", align: "right", hint: "Since the ledger opened, realized and unrealized" },
  { key: "report", label: "Next report", width: "84px", align: "right" },
];

const FLAG_TONE = { hoot: "text-down", caution: "text-caution-foreground", neutral: "text-ink-2" } as const;

/** The group's biggest move today, e.g. "NVDA +2.10%": what the old Teams panel called its biggest mover. */
function biggestMover(lines: PositionLine[]) {
  const moved = lines.filter((l) => l.dayPct !== null);
  if (!moved.length) return null;
  const top = moved.reduce((a, b) => (Math.abs(b.dayPct!) > Math.abs(a.dayPct!) ? b : a));
  return `${top.ticker} ${fmtChangePct(top.dayPct)}`;
}

/** A group's day: what its positions made today over what they were worth at yesterday's close. */
function groupDay(lines: PositionLine[]) {
  const pnl = lines.reduce((s, l) => s + l.dayPnl, 0);
  const base = lines.reduce((s, l) => s + l.value - l.dayPnl, 0);
  return base > 0 ? (pnl / base) * 100 : null;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/**
 * The fund's positions grouped by team: collapsible team rows with their totals and biggest mover (on a band), a row
 * per holding that opens it, and cash last. Group, Expand all, Columns and Export are the table's controls. The
 * intraday lines load after the page. `spxPct` is the S&P 500's move today, for each row's move against it.
 *
 * A team's own table (one group, no cash) also carries what its page showed: `notes` adds the Next report column and
 * each holding's needs-attention flag under its name, `unheld` lists covered holdings the ledger doesn't hold, and
 * `toolbar` (the filter chips) sits over the table.
 */
export function PositionsTable({
  groups,
  cash,
  asOf,
  spxPct = null,
  intraday = true,
  notes,
  unheld = [],
  toolbar,
  empty = "No positions.",
}: {
  groups: PositionGroup[];
  cash: { value: number; weightPct: number } | null;
  asOf: string;
  spxPct?: number | null;
  /** The intraday lines come from a fund-wide feed (execs and admins); off, the column isn't offered. */
  intraday?: boolean;
  notes?: Record<string, PositionNote>;
  unheld?: UnheldLine[];
  toolbar?: React.ReactNode;
  /** Said when there is nothing to list (a filter that matches nothing). */
  empty?: string;
}) {
  const [grouped, setGrouped] = useState(true);
  // The first team opens (a team's own table is that one); Expand all opens the rest.
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups[0] ? [groups[0].id] : []));
  // The intraday lines start hidden (Columns shows them): beside the rail the table keeps its room for the names.
  const [hidden, setHidden] = useState<Set<ColKey>>(() => new Set(["spark"]));
  const [sparks, setSparks] = useState<Record<string, number[]> | "failed" | null>(null);

  const offered = COLS.filter((c) => (c.key === "spark" ? intraday : c.key === "report" ? !!notes : true));
  const wantSparks = intraday && !hidden.has("spark");
  useEffect(() => {
    if (!wantSparks || sparks !== null) return;
    let live = true;
    fetch("/api/overview/intraday", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ sparks: Record<string, number[]> }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setSparks(d.sparks))
      .catch(() => live && setSparks("failed"));
    return () => {
      live = false;
    };
  }, [wantSparks, sparks]);

  const cols = offered.filter((c) => !hidden.has(c.key));
  const grid = { gridTemplateColumns: ["minmax(0,1fr)", ...cols.map((c) => c.width)].join(" ") };
  const count = groups.reduce((s, g) => s + g.lines.length, 0);
  const allOpen = groups.every((g) => open.has(g.id));
  const flat = useMemo(() => groups.flatMap((g) => g.lines).sort((a, b) => b.value - a.value), [groups]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = () => {
    const rows = [["Team", "Ticker", "Name", "Shares", "Last", "Today %", "Market value", "Weight %", "Total gain"]];
    for (const g of groups) for (const l of g.lines) rows.push([g.name, l.ticker, l.name, fixed(l.shares, 4), fixed(l.price, 2), l.dayPct === null ? "" : fixed(l.dayPct, 2), fixed(l.value, 2), fixed(l.weight, 2), fixed(l.gain, 2)]);
    if (cash) rows.push(["Cash", "", "", "", "", "", fixed(cash.value, 2), fixed(cash.weightPct, 2), ""]);
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `positions-${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // A move against the S&P 500's, in bp: grey, as a relative figure.
  const versus = (pct: number | null) => <span className="text-muted-foreground">{pct === null || spxPct === null ? "—" : fmtChangeBp((pct - spxPct) * 100)}</span>;

  const sparkCell = (ticker: string) => {
    if (sparks === null) return <Skeleton className="h-4 w-16" />;
    const v = sparks === "failed" ? [] : (sparks[ticker] ?? []);
    return <Sparkline values={v} period="Intraday" />;
  };

  const cells = (l: PositionLine) =>
    cols.map((c) => {
      switch (c.key) {
        case "spark":
          return <span key={c.key} role="cell">{sparkCell(l.ticker)}</span>;
        case "last":
          return <span key={c.key} role="cell" className="text-right">{fmtMoney(l.price)}</span>;
        case "today":
          return <span key={c.key} role="cell" className="text-right">{l.dayPct === null ? <span className="text-muted-foreground">—</span> : <Delta text={fmtChangePct(l.dayPct)} weight="medium" align />}</span>;
        case "vs":
          return <span key={c.key} role="cell" className="text-right">{versus(l.dayPct)}</span>;
        case "value":
          return <span key={c.key} role="cell" className="text-right">{fmtMoney(l.value)}</span>;
        case "weight":
          return <span key={c.key} role="cell" className="text-right">{fmtPct(l.weight)}</span>;
        case "report":
          return <span key={c.key} role="cell" className="truncate text-right text-ink-2">{notes?.[l.ticker]?.nextReport ?? <span className="text-muted-foreground">—</span>}</span>;
        default:
          return <span key={c.key} role="cell" className="text-right"><Delta text={fmtChangeMoney(l.gain)} weight="normal" align /></span>;
      }
    });

  const groupCells = (g: PositionGroup) => {
    const mv = g.lines.reduce((s, l) => s + l.value, 0);
    const day = groupDay(g.lines);
    const gain = g.lines.reduce((s, l) => s + l.gain, 0);
    const weight = g.lines.reduce((s, l) => s + l.weight, 0);
    return cols.map((c) => {
      switch (c.key) {
        case "today":
          return <span key={c.key} role="cell" className="text-right">{day === null ? null : <Delta text={fmtChangePct(day)} weight="semibold" align />}</span>;
        case "vs":
          return <span key={c.key} role="cell" className="text-right">{versus(day)}</span>;
        case "value":
          return <span key={c.key} role="cell" className="text-right">{fmtMoney(mv, 0)}</span>;
        case "weight":
          return <span key={c.key} role="cell" className="text-right">{fmtPct(weight)}</span>;
        case "gain":
          return <span key={c.key} role="cell" className="text-right"><Delta text={fmtChangeMoney(gain, 0)} weight="semibold" align /></span>;
        default:
          return <span key={c.key} role="cell" />;
      }
    });
  };

  const nameCell = (l: { ticker: string; name: string; href: string }, indent: boolean) => {
    const [flag, ...more] = notes?.[l.ticker]?.flags ?? [];
    return (
      // A two-column grid so the link stays the row header's own child (screen readers read it as the row's name).
      <span role="rowheader" className={cn("grid min-w-0 grid-cols-[20px_minmax(0,1fr)] items-center gap-x-2.5", indent && "pl-[18px]")}>
        <HoldingLogo ticker={l.ticker} size={20} className={flag ? "row-span-2" : undefined} />
        <RowLink cover="stretch" href={l.href} aria-label={`${l.ticker}, ${l.name}`} className="flex min-w-0 items-baseline gap-2">
          <span className="font-semibold">{l.ticker}</span>
          <span className="truncate text-caption text-muted-foreground">{l.name}</span>
        </RowLink>
        {flag && (
          // Above the row's stretched link, so it opens the thing that needs attention.
          <span className="relative z-[1] col-start-2 truncate text-caption" title={[flag, ...more].map((f) => f.label).join(", ")}>
            {flag.href ? (
              <Link href={flag.href} className={cn("font-semibold hover:underline", FLAG_TONE[flag.tone])}>
                {flag.label}
              </Link>
            ) : (
              <span className={cn("font-semibold", FLAG_TONE[flag.tone])}>{flag.label}</span>
            )}
            {flag.detail && <span className="text-muted-foreground">, {flag.detail}</span>}
            {more.length > 0 && <span className="text-muted-foreground">, {more.length} more</span>}
          </span>
        )}
      </span>
    );
  };

  const row = (l: PositionLine, indent: boolean) => (
    <div key={l.ticker} role="row" style={grid} className="relative grid min-h-10 items-center gap-3 border-b border-row py-1 transition-colors hover:bg-band">
      {nameCell(l, indent)}
      {cells(l)}
    </div>
  );

  // A covered holding with no position: its report and flags, "Not held" where the value goes.
  const unheldRow = (l: UnheldLine) => (
    <div key={`unheld-${l.ticker}`} role="row" style={grid} className="relative grid min-h-10 items-center gap-3 border-b border-row py-1 transition-colors hover:bg-band">
      {nameCell(l, grouped)}
      {cols.map((c) => (
        <span key={c.key} role="cell" className={cn("text-right", c.key === "report" ? "truncate text-ink-2" : "text-muted-foreground")}>
          {c.key === "value" ? "Not held" : c.key === "report" ? (notes?.[l.ticker]?.nextReport ?? "—") : c.key === "spark" ? null : "—"}
        </span>
      ))}
    </div>
  );
  const nothing = groups.every((g) => g.lines.length === 0) && unheld.length === 0;

  return (
    <section aria-labelledby="positions-h" className="flex flex-col">
      <div className="mt-6 flex items-center gap-2">
        <h2 id="positions-h" className="flex-1 text-title font-bold tracking-[-0.01em]">
          Positions <span className="font-medium text-muted-foreground">{count}</span>
        </h2>
        <Button size="sm" variant="secondary" aria-pressed={grouped} onClick={() => setGrouped((g) => !g)}>
          Group: {grouped ? "Team" : "None"}
        </Button>
        {grouped && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.id)))}>
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="secondary" />}>
            Columns
            <ChevronDown aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Show</DropdownMenuLabel>
              {offered.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!hidden.has(c.key)}
                  onCheckedChange={(on) =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (on) next.delete(c.key);
                      else next.add(c.key);
                      return next;
                    })
                  }
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          Export
        </Button>
      </div>

      {toolbar}
      <div role="table" aria-label="Positions" className="mt-2.5 text-body">
        <div role="row" style={grid} className="grid h-8 items-center gap-3 border-b text-caption text-muted-foreground">
          <span role="columnheader">Name</span>
          {cols.map((c) => (
            <span key={c.key} role="columnheader" title={c.hint} className={c.align === "right" ? "text-right" : undefined}>
              {c.label}
            </span>
          ))}
        </div>

        {grouped
          ? groups.map((g) => {
              const isOpen = open.has(g.id);
              const mover = biggestMover(g.lines);
              return (
                <div key={g.id} role="rowgroup">
                  <div role="row" style={grid} className="grid min-h-11 items-center gap-3 border-b bg-band py-1 font-semibold">
                    <span role="cell" className="min-w-0">
                      <button type="button" aria-expanded={isOpen} onClick={() => toggle(g.id)} title={g.name} className="flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <ChevronDown aria-hidden className={cn("size-2.5 shrink-0 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} strokeWidth={2.5} />
                        <span className="truncate">{g.name}</span>
                        <span className="font-medium text-muted-foreground">{g.lines.length}</span>
                      </button>
                      {mover && (
                        <span className="block truncate pl-4 text-caption font-normal text-muted-foreground">
                          <span className="sr-only">Biggest mover today </span>
                          {mover}
                        </span>
                      )}
                    </span>
                    {groupCells(g)}
                  </div>
                  {isOpen && g.lines.map((l) => row(l, true))}
                </div>
              );
            })
          : flat.map((l) => row(l, false))}
        {unheld.map(unheldRow)}
        {nothing && (
          <div role="row">
            <div role="cell" aria-colspan={cols.length + 1} className="py-3 text-body text-muted-foreground">
              {empty}
            </div>
          </div>
        )}

        {cash && (
          <div role="row" style={grid} className="grid h-11 items-center gap-3 border-b font-semibold">
            <span role="cell">Cash</span>
            {cols.map((c) => (
              <span key={c.key} role="cell" className="text-right">
                {c.key === "value" ? fmtMoney(cash.value, 0) : c.key === "weight" ? fmtPct(cash.weightPct) : null}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="pt-2 text-caption text-muted-foreground">Total gain counts from the ledger&rsquo;s opening prices on the day it opened; cost from before then isn&rsquo;t in the app.</p>
    </section>
  );
}
