"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { RowLink } from "@/components/app/row-link";
import { Sparkline } from "@/components/app/holdings/sparkline";
import { fixed, fmtChangeMoney, fmtChangePct, fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Delta } from "./figures";

export type PositionLine = { ticker: string; name: string; href: string; shares: number; price: number; dayPct: number | null; dayPnl: number; value: number; weight: number; gain: number; cost: number };
export type PositionGroup = { id: string; name: string; lines: PositionLine[] };

type ColKey = "spark" | "last" | "today" | "value" | "weight" | "gain";
const COLS: { key: ColKey; label: string; width: string; align?: "right"; hint?: string }[] = [
  { key: "spark", label: "Intraday", width: "80px" },
  { key: "last", label: "Last", width: "90px", align: "right" },
  { key: "today", label: "Today", width: "90px", align: "right" },
  { key: "value", label: "Market value", width: "140px", align: "right" },
  { key: "weight", label: "Weight", width: "80px", align: "right" },
  { key: "gain", label: "Total gain", width: "130px", align: "right", hint: "Since the ledger opened, realized and unrealized" },
];

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
 * The fund's positions grouped by team: collapsible team rows with their totals, a row per holding that opens it, and
 * cash last. Group, Expand all, Columns and Export are the table's controls. The intraday lines load after the page.
 */
export function PositionsTable({ groups, cash, asOf }: { groups: PositionGroup[]; cash: { value: number; weightPct: number }; asOf: string }) {
  const [grouped, setGrouped] = useState(true);
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups[0] ? [groups[0].id] : []));
  const [hidden, setHidden] = useState<Set<ColKey>>(() => new Set());
  const [sparks, setSparks] = useState<Record<string, number[]> | "failed" | null>(null);

  const wantSparks = !hidden.has("spark");
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

  const cols = COLS.filter((c) => !hidden.has(c.key));
  const grid = useMemo(() => ({ gridTemplateColumns: ["minmax(0,1.7fr)", ...cols.map((c) => c.width)].join(" ") }), [cols]);
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
    rows.push(["Cash", "", "", "", "", "", fixed(cash.value, 2), fixed(cash.weightPct, 2), ""]);
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `positions-${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        case "value":
          return <span key={c.key} role="cell" className="text-right">{fmtMoney(l.value)}</span>;
        case "weight":
          return <span key={c.key} role="cell" className="text-right">{fmtPct(l.weight)}</span>;
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

  const row = (l: PositionLine, indent: boolean) => (
    <div key={l.ticker} role="row" style={grid} className="relative grid h-10 items-center gap-3 border-b border-row transition-colors hover:bg-band">
      <span role="rowheader" className={cn("min-w-0", indent && "pl-4")}>
        <RowLink cover="stretch" href={l.href} aria-label={`${l.ticker}, ${l.name}`} className="flex min-w-0 flex-col">
          <span className="font-semibold">{l.ticker}</span>
          <span className="truncate text-caption text-muted-foreground">{l.name}</span>
        </RowLink>
      </span>
      {cells(l)}
    </div>
  );

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
              {COLS.map((c) => (
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
              return (
                <div key={g.id} role="rowgroup">
                  <div role="row" style={grid} className="grid h-9 items-center gap-3 border-b font-semibold">
                    <span role="cell">
                      <button type="button" aria-expanded={isOpen} onClick={() => toggle(g.id)} className="flex h-7 items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <ChevronDown aria-hidden className={cn("size-2.5 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} strokeWidth={2.5} />
                        {g.name}
                        <span className="font-medium text-muted-foreground">{g.lines.length}</span>
                      </button>
                    </span>
                    {groupCells(g)}
                  </div>
                  {isOpen && g.lines.map((l) => row(l, true))}
                </div>
              );
            })
          : flat.map((l) => row(l, false))}

        <div role="row" style={grid} className="grid h-9 items-center gap-3 border-b font-semibold">
          <span role="cell" className="pl-4">Cash</span>
          {cols.map((c) => (
            <span key={c.key} role="cell" className="text-right">
              {c.key === "value" ? fmtMoney(cash.value, 0) : c.key === "weight" ? fmtPct(cash.weightPct) : null}
            </span>
          ))}
        </div>
      </div>
      <p className="pt-2 text-caption text-muted-foreground">Total gain counts from the ledger&rsquo;s opening prices on the day it opened; cost from before then isn&rsquo;t in the app.</p>
    </section>
  );
}
