"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { SectorRow } from "@/lib/attribution/attribution";
import { ETF_BY_SECTOR, bucketLabel, type BucketKey } from "@/lib/attribution/sectors";
import { fixed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EXPLAIN } from "./explainers";
import { BPS_NOTE, fmtBpsShort, fmtSigned, fmtWeight } from "./format";
import { Tip } from "./info-tip";
import { INTERACTION_CLASS, InteractionSwitch } from "./interaction-toggle";
import { SectorBreakdownPanel, type BreakdownQuery } from "./sector-breakdown";

const WITH_BENCH = "grid-cols-[minmax(0,1fr)_68px_68px_74px_74px_56px]";
const NO_BENCH = "grid-cols-[minmax(0,1fr)_68px_74px_84px]";
const upDown = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted-foreground");

const ret = (v: number | null) => (v === null ? "—" : fmtSigned(v));
/** Basis points at one decimal, for the expanded detail. */
const bp1 = (v: number) => {
  const n = v * 10_000;
  const s = fixed(n, 1);
  return `${n > 0 && Number(s) !== 0 ? "+" : ""}${s}`;
};

function Figure({ label, explain, value, tone, className }: { label: string; explain?: string; value: string; tone?: number; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11.5px] text-muted-foreground">{explain ? <Tip label={label}>{explain}</Tip> : label}</div>
      <div className={cn("mt-0.5 font-mono text-[13px] font-medium", tone === undefined ? "text-foreground" : upDown(Number(tone.toFixed(1))))}>{value}</div>
    </div>
  );
}

/** The per-sector effects behind a row, plus (in transparency mode) the daily working. */
function SectorDetail({ row, hasBench, breakdownQuery }: { row: SectorRow; hasBench: boolean; breakdownQuery?: BreakdownQuery }) {
  const etf = row.key !== "cash" && row.key !== "unclassified" ? ETF_BY_SECTOR[row.key] : null;
  const noPick = row.key === "cash";
  return (
    <div className="shrink-0 border-b border-row bg-band-2 px-4 py-3">
      <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
        <Figure label="Benchmark ETF" explain={EXPLAIN.benchReturn} value={etf ?? "—"} />
        <Figure label="Contribution" explain={EXPLAIN.contribution} value={`${bp1(row.contribution)} bp`} tone={row.contribution * 10_000} />
        {hasBench && <Figure label="Allocation" explain={EXPLAIN.allocation} value={bp1(row.allocation)} tone={row.allocation * 10_000} />}
        {hasBench && <Figure label="Selection" explain={EXPLAIN.selection} value={noPick ? "—" : bp1(row.selection)} tone={noPick ? undefined : row.selection * 10_000} />}
        {hasBench && <Figure label="Interaction" explain={EXPLAIN.interaction} value={noPick ? "—" : bp1(row.interaction)} tone={noPick ? undefined : row.interaction * 10_000} className={INTERACTION_CLASS} />}
        {hasBench && <Figure label="Total effect" explain={EXPLAIN.totalEffect} value={`${bp1(row.total)} bp`} tone={row.total * 10_000} />}
      </div>
      {breakdownQuery && (
        <div className="mt-3 overflow-x-auto rounded-[10px] bg-card shadow-[0_0_0_1px_var(--border)]">
          <SectorBreakdownPanel sector={row.key} query={breakdownQuery} />
        </div>
      )}
    </div>
  );
}

/**
 * Sectors, one row each, filling the panel. A row expands to its contribution and effects; in transparency
 * mode (`breakdownQuery`) the expansion also loads the daily Brinson-Fachler working and stored rows.
 */
export function SectorsPanel({ rows, hasBench, own = "Fund", breakdownQuery, className }: { rows: SectorRow[]; hasBench: boolean; own?: string; breakdownQuery?: BreakdownQuery; className?: string }) {
  const [open, setOpen] = useState<Set<BucketKey>>(new Set());
  const toggle = (k: BucketKey) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const sorted = [...rows].sort((a, b) => (hasBench ? b.total - a.total : b.contribution - a.contribution));
  const cols = hasBench ? WITH_BENCH : NO_BENCH;
  const num = "text-right font-mono text-[12.5px]";

  return (
    <section className={cn("panel flex min-w-0 flex-col overflow-hidden", className)} aria-label="Sectors">
      <div className={cn("grid h-9 shrink-0 items-center gap-2.5 border-b px-4 text-xs text-muted-foreground", cols)}>
        <span><Tip label="Sector" side="bottom">{EXPLAIN.sectors}</Tip></span>
        <span className="text-right"><Tip label={`${own} wt`} side="bottom">{EXPLAIN.avgWeight}</Tip></span>
        {hasBench && <span className="text-right"><Tip label="Bench wt" side="bottom">{EXPLAIN.benchWeight}</Tip></span>}
        <span className="text-right"><Tip label={`${own} ret`} side="bottom">{EXPLAIN.sectorReturn}</Tip></span>
        {hasBench && <span className="text-right"><Tip label="Bench ret" side="bottom">{EXPLAIN.benchReturn}</Tip></span>}
        <span className="text-right">{hasBench ? <Tip label="Total" side="bottom">{EXPLAIN.totalEffect}</Tip> : <Tip label="Contrib." side="bottom">{EXPLAIN.contribution}</Tip>}</span>
      </div>
      {sorted.length === 0 && <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">No sectors held in this period.</div>}
      {sorted.map((r) => {
        const isOpen = open.has(r.key);
        const figure = hasBench ? r.total : r.contribution;
        const bpShown = Math.round(figure * 10_000);
        return (
          <Fragment key={r.key}>
            <button
              type="button"
              onClick={() => toggle(r.key)}
              aria-expanded={isOpen}
              className={cn(
                "group/row relative grid max-h-16 min-h-10 flex-1 items-center gap-2.5 border-b border-row px-4 text-left text-[13.5px] transition-colors hover:bg-band focus-visible:bg-band focus-visible:outline-none",
                cols,
                isOpen && "flex-none bg-band",
              )}
            >
              <ChevronRight
                className={cn("absolute top-1/2 left-1 size-3 -translate-y-1/2 text-muted-foreground opacity-0 transition group-hover/row:opacity-100", isOpen && "rotate-90 opacity-100")}
                aria-hidden
              />
              <span className="truncate">{bucketLabel(r.key)}</span>
              <span className={num}>{fmtWeight(r.avgPortfolioWeight)}</span>
              {hasBench && <span className={cn(num, "text-muted-foreground")}>{r.key === "cash" || r.key === "unclassified" ? "—" : fmtWeight(r.avgBenchmarkWeight)}</span>}
              <span className={num}>{ret(r.portfolioReturn)}</span>
              {hasBench && <span className={cn(num, "text-muted-foreground")}>{ret(r.benchmarkReturn)}</span>}
              <span className={cn(num, "font-semibold", upDown(bpShown))}>{fmtBpsShort(figure)}</span>
            </button>
            {isOpen && <SectorDetail row={r} hasBench={hasBench} breakdownQuery={breakdownQuery} />}
          </Fragment>
        );
      })}
      <div className="mt-auto flex min-h-10 shrink-0 items-center gap-3 bg-band-2 px-4 text-[12.5px] text-muted-foreground">
        <span className="truncate">
          {hasBench ? "Total effect vs sector benchmark, bp." : "Contribution, bp."} Select a sector for its {hasBench ? "effects" : "detail"}
          {breakdownQuery ? " and the daily working" : ""}.
        </span>
        <span className="flex-1" />
        <span className="hidden truncate xl:inline" title={BPS_NOTE}>100 bp = 1 pp</span>
        {hasBench && <InteractionSwitch />}
      </div>
    </section>
  );
}
