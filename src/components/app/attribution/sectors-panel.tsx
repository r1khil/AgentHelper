"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Effects } from "@/lib/attribution/types";
import type { SectorRow } from "@/lib/attribution/attribution";
import { ETF_BY_SECTOR, bucketLabel, type BucketKey } from "@/lib/attribution/sectors";
import { fixed, fmtAccounting, fmtChangePct, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { plainChange } from "@/components/app/portfolio/parts";
import { ReadAs } from "../read-as";
import { EXPLAIN } from "./explainers";
import { BPS_NOTE, bps, pct } from "./format";
import { Tip } from "./info-tip";
import { SectorBreakdownPanel, type BreakdownQuery } from "./sector-breakdown";

// Eight columns at 1440 (the design), tightening a little in a narrower window; a long sector name wraps rather than
// cutting off. Without benchmark weights there is no allocation or selection, so the table drops to four.
const WITH_BENCH = "grid-cols-[minmax(0,1fr)_54px_58px_62px_62px_58px_58px_62px] xl:grid-cols-[minmax(0,1fr)_60px_64px_64px_68px_64px_64px_64px]";
const NO_BENCH = "grid-cols-[minmax(0,1fr)_68px_74px_84px]";
const upDown = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted-foreground");

const ret = (v: number | null) => (v === null ? "—" : fmtChangePct(pct(v)));
/** Basis points of a fraction to one decimal, no unit: the column header says "bp". */
const bp1 = (v: number) => plainChange(fmtAccounting(bps(v), 1), bps(v));

function Figure({ label, explain, value, tone, className }: { label: string; explain?: string; value: string; tone?: number; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-caption text-muted-foreground">{explain ? <Tip label={label}>{explain}</Tip> : label}</div>
      <div className={cn("mt-0.5 text-body font-semibold", tone === undefined ? "text-foreground" : upDown(Number(fixed(tone, 1))))}>{value}</div>
    </div>
  );
}

/** The per-sector effects behind a row, plus (in transparency mode) the daily working. */
function SectorDetail({ row, hasBench, breakdownQuery }: { row: SectorRow; hasBench: boolean; breakdownQuery?: BreakdownQuery }) {
  const etf = row.key !== "cash" && row.key !== "unclassified" ? ETF_BY_SECTOR[row.key] : null;
  const noPick = row.key === "cash";
  return (
    <div className="shrink-0 border-b border-row bg-band px-3 py-3">
      <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
        <Figure label="Benchmark ETF" explain={EXPLAIN.benchReturn} value={etf ?? "—"} />
        <Figure label="Contribution" explain={EXPLAIN.contribution} value={`${bp1(row.contribution)} bp`} tone={row.contribution * 10_000} />
        {hasBench && <Figure label="Allocation" explain={EXPLAIN.allocation} value={`${bp1(row.allocation)} bp`} tone={row.allocation * 10_000} />}
        {hasBench && <Figure label="Selection" explain={EXPLAIN.selection} value={noPick ? "—" : `${bp1(row.selection)} bp`} tone={noPick ? undefined : row.selection * 10_000} />}
        {hasBench && <Figure label="Overlap of the two" explain={EXPLAIN.interaction} value={noPick ? "—" : `${bp1(row.interaction)} bp`} tone={noPick ? undefined : row.interaction * 10_000} />}
        {hasBench && <Figure label="Total effect" explain={EXPLAIN.totalEffect} value={`${bp1(row.total)} bp`} tone={row.total * 10_000} />}
      </div>
      {breakdownQuery && (
        <div className="mt-3 overflow-x-auto border-t pt-3">
          <SectorBreakdownPanel sector={row.key} query={breakdownQuery} />
        </div>
      )}
    </div>
  );
}

/**
 * "By sector": one row per sector, largest effect first, then the total. Weights is the allocation effect, Picks the
 * selection effect with its overlap. A row expands to its contribution and every effect; in transparency mode
 * (`breakdownQuery`) it also loads the daily Brinson-Fachler working and the stored rows. For screen readers it is a
 * table: the sector name is the row header and holds the expand button (stretched over the row), and an open sector
 * adds a row with one spanning cell for its detail.
 */
export function SectorsPanel({
  rows,
  hasBench,
  own = "Fund",
  breakdownQuery,
  totals,
  className,
}: {
  rows: SectorRow[];
  hasBench: boolean;
  own?: string;
  breakdownQuery?: BreakdownQuery;
  /** The bottom line: the portfolio's return, the benchmark's, and the effects that bridge them. */
  totals: { portfolioReturn: number; benchmarkReturn: number | null; effects: Effects | null; activeReturn: number | null };
  className?: string;
}) {
  const [open, setOpen] = useState<Set<BucketKey>>(new Set());
  const toggle = (k: BucketKey) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const sorted = [...rows].sort((a, b) => (hasBench ? Math.abs(b.total) - Math.abs(a.total) : Math.abs(b.contribution) - Math.abs(a.contribution)));
  const cols = hasBench ? WITH_BENCH : NO_BENCH;
  const columns = hasBench ? 8 : 4;
  const num = "text-right";
  const weightSum = rows.reduce((s, r) => s + r.avgPortfolioWeight, 0);
  const benchSum = rows.reduce((s, r) => s + (r.key === "cash" || r.key === "unclassified" ? 0 : r.avgBenchmarkWeight), 0);
  const contributionSum = rows.reduce((s, r) => s + r.contribution, 0);
  const t = totals;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div role="table" aria-label="Attribution by sector" className="flex flex-col text-body">
        <div role="row" className={cn("grid min-h-9 shrink-0 items-center gap-x-2.5 border-b text-caption text-muted-foreground", cols)}>
          <span role="columnheader"><Tip label="Sector" side="bottom">{EXPLAIN.sectors}</Tip></span>
          <span role="columnheader" className="text-right"><Tip label={<ReadAs text={`${own} weight`}>{own} wt</ReadAs>} side="bottom">{EXPLAIN.avgWeight}</Tip></span>
          {hasBench && <span role="columnheader" className="text-right"><Tip label={<ReadAs text="Benchmark weight">Bench wt</ReadAs>} side="bottom">{EXPLAIN.benchWeight}</Tip></span>}
          <span role="columnheader" className="text-right"><Tip label={<ReadAs text={`${own} return`}>{own} ret</ReadAs>} side="bottom">{EXPLAIN.sectorReturn}</Tip></span>
          {hasBench && <span role="columnheader" className="text-right"><Tip label={<ReadAs text="Benchmark return">Bench ret</ReadAs>} side="bottom">{EXPLAIN.benchReturn}</Tip></span>}
          {hasBench && <span role="columnheader" className="text-right"><Tip label={<ReadAs text="Weights, the allocation effect, basis points">Weights</ReadAs>} side="bottom">{EXPLAIN.allocation}</Tip></span>}
          {hasBench && <span role="columnheader" className="text-right"><Tip label={<ReadAs text="Picks, the selection effect including its overlap with weights, basis points">Picks</ReadAs>} side="bottom">{`${EXPLAIN.selection} Includes the overlap of weights and picks.`}</Tip></span>}
          <span role="columnheader" className="text-right">
            {hasBench ? (
              <Tip label={<ReadAs text="Total effect, basis points">Total bp</ReadAs>} side="bottom">{EXPLAIN.totalEffect}</Tip>
            ) : (
              <Tip label={<ReadAs text="Contribution, basis points">Contrib. bp</ReadAs>} side="bottom">{EXPLAIN.contribution}</Tip>
            )}
          </span>
        </div>
        {sorted.length === 0 && (
          <div role="row">
            <div role="cell" aria-colspan={columns} className="py-3 text-muted-foreground">No sectors held in this period.</div>
          </div>
        )}
        {sorted.map((r) => {
          const isOpen = open.has(r.key);
          const figure = hasBench ? r.total : r.contribution;
          const noBench = r.key === "cash" || r.key === "unclassified";
          const picks = r.selection + r.interaction;
          return (
            <Fragment key={r.key}>
              <div
                role="row"
                className={cn(
                  "group/row relative grid min-h-9 items-center gap-x-2.5 border-b border-row py-1 transition-colors hover:bg-band has-[button:focus-visible]:bg-band",
                  cols,
                  isOpen && "bg-band",
                )}
              >
                <ChevronRight
                  className={cn("absolute top-1/2 -left-4 size-3 -translate-y-1/2 text-muted-foreground opacity-0 transition group-hover/row:opacity-100", isOpen && "rotate-90 opacity-100")}
                  aria-hidden
                />
                <span role="rowheader" className="min-w-0">
                  <button type="button" onClick={() => toggle(r.key)} aria-expanded={isOpen} className="max-w-full text-left leading-4 after:absolute after:inset-0 focus-visible:outline-none">
                    {bucketLabel(r.key)}
                  </button>
                </span>
                <span role="cell" className={num}>{fmtPct(pct(r.avgPortfolioWeight), 1)}</span>
                {hasBench && <span role="cell" className={cn(num, "text-muted-foreground")}>{noBench ? "—" : fmtPct(pct(r.avgBenchmarkWeight), 1)}</span>}
                <span role="cell" className={num}>{ret(r.portfolioReturn)}</span>
                {hasBench && <span role="cell" className={cn(num, "text-muted-foreground")}>{ret(r.benchmarkReturn)}</span>}
                {hasBench && <span role="cell" className={cn(num, upDown(Math.round(bps(r.allocation) * 10)))}>{bp1(r.allocation)}</span>}
                {hasBench && <span role="cell" className={cn(num, r.key === "cash" ? "text-muted-foreground" : upDown(Math.round(bps(picks) * 10)))}>{r.key === "cash" ? "—" : bp1(picks)}</span>}
                <span role="cell" className={cn(num, "font-semibold", upDown(Math.round(bps(figure) * 10)))}>{bp1(figure)}</span>
              </div>
              {isOpen && (
                <div role="row">
                  <div role="cell" aria-colspan={columns}>
                    <SectorDetail row={r} hasBench={hasBench} breakdownQuery={breakdownQuery} />
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
        {sorted.length > 0 && (
          <div role="row" className={cn("grid min-h-9 items-center gap-x-2.5 py-1 font-semibold", cols)}>
            <span role="cell">Total</span>
            <span role="cell" className={num}>{fmtPct(pct(weightSum), 1)}</span>
            {hasBench && <span role="cell" className={num}>{fmtPct(pct(benchSum), 1)}</span>}
            <span role="cell" className={num}>{ret(t.portfolioReturn)}</span>
            {hasBench && <span role="cell" className={num}>{ret(t.benchmarkReturn)}</span>}
            {hasBench && <span role="cell" className={cn(num, upDown(Math.round(bps(t.effects?.allocation ?? 0) * 10)))}>{t.effects ? bp1(t.effects.allocation) : "—"}</span>}
            {hasBench && <span role="cell" className={cn(num, upDown(Math.round(bps((t.effects?.selection ?? 0) + (t.effects?.interaction ?? 0)) * 10)))}>{t.effects ? bp1(t.effects.selection + t.effects.interaction) : "—"}</span>}
            <span role="cell" className={cn(num, upDown(Math.round(bps(hasBench ? (t.activeReturn ?? 0) : contributionSum) * 10)))}>
              {hasBench ? (t.activeReturn === null ? "—" : bp1(t.activeReturn)) : bp1(contributionSum)}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-caption text-muted-foreground" title={BPS_NOTE}>
        {hasBench ? "Effects against the sector benchmark, in bp." : "Contribution, in bp."} Select a sector for its {hasBench ? "effects" : "detail"}
        {breakdownQuery ? " and the daily working" : ""}. 100 bp = 1 percentage point.
      </p>
    </div>
  );
}
