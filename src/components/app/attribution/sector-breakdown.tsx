"use client";

import { useEffect, useId, useState } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttributionBreakdown, SectorBreakdown, SectorDayBreakdown, SectorRow } from "@/lib/attribution/attribution";
import type { SectorLineage } from "@/lib/attribution/lineage";
import { bucketLabel, type BucketKey } from "@/lib/attribution/sectors";
import { fixed, fmtBp, fmtDate, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Move } from "../move";
import { EXPLAIN } from "./explainers";
import { ReadAs } from "../read-as";
import { Explained } from "./info-tip";

export type BreakdownQuery = { basePath: string; team?: string; period: string; from?: string; to?: string };

type Payload = {
  period: { start: string; end: string };
  row: SectorRow | null;
  breakdown: SectorBreakdown | null;
  linking: AttributionBreakdown["linking"];
  lineage: SectorLineage;
};

const DEFAULT_ROWS = 20;
// The working keeps a true minus on operands, since parentheses in a formula group terms; results use accounting style.
const w = (v: number) => `${fixed(v * 100, 2)}%`;
const r = (v: number) => `${fixed(v * 100, 3)}%`;
const bps = (v: number, d = 2) => `${fixed(v * 10_000, d)} bp`;
const f = (v: number, d = 4) => fixed(v, d);
const PRICED: Record<string, { label: string; warn: boolean }> = {
  close: { label: "close", warn: false },
  carried: { label: "carried forward", warn: true },
  trade: { label: "trade price", warn: true },
};

/** Fetches and renders the transparency breakdown for one sector row. Mounted only while the row is expanded. */
export function SectorBreakdownPanel({ sector, query }: { sector: BucketKey; query: BreakdownQuery }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ sector, period: query.period });
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.team) params.set("team", query.team);
    fetch(`/api/attribution/breakdown?${params}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()) as Payload;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load the breakdown"));
    return () => {
      cancelled = true;
    };
  }, [sector, query.period, query.from, query.to, query.team]);

  if (error) return <div className="px-2 py-3 text-body text-destructive">{error}</div>;
  if (!data) {
    return (
      <div className="grid gap-2 px-2 py-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  const { breakdown, row, linking, lineage } = data;
  if (!breakdown || !row) return <div className="px-2 py-3 text-body text-muted-foreground">No days in this period for {bucketLabel(sector)}.</div>;
  const hasBench = breakdown.days.some((d) => d.bench);
  return (
    <div className="grid gap-5 px-2 py-3 text-body">
      {hasBench && <FormulaBlock row={row} days={breakdown.days} />}
      {hasBench && linking.K !== null && <CarinoBlock linking={linking} />}
      <DayTable days={breakdown.days} hasBench={hasBench} />
      <LineageBlock lineage={lineage} sector={sector} />
    </div>
  );
}

function Block({ title, explain, children }: { title: string; explain: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h4 className="text-caption font-semibold text-muted-foreground">
        <Explained label={title}>{explain}</Explained>
      </h4>
      {children}
    </section>
  );
}

/** The three Brinson-Fachler formulas with the period totals, and one worked day with the numbers substituted. */
function FormulaBlock({ row, days }: { row: SectorRow; days: SectorDayBreakdown[] }) {
  const example = days.filter((d) => d.bench).reduce<SectorDayBreakdown | null>((best, d) => {
    const t = Math.abs(d.bench!.scaled.allocation + d.bench!.scaled.selection + d.bench!.scaled.interaction);
    const bt = best ? Math.abs(best.bench!.scaled.allocation + best.bench!.scaled.selection + best.bench!.scaled.interaction) : -1;
    return t > bt ? d : best;
  }, null);
  const b = example?.bench;
  return (
    <Block title="Formula with numbers" explain={EXPLAIN.rawEffect}>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="font-medium">Allocation</dt>
        <dd className="tnum">
          Σ<sub>t</sub> coef<sub>t</sub> · (wp<sub>t</sub> − wb<sub>t</sub>)(rb<sub>t</sub> − Rb<sub>t</sub>) = <Move value={row.allocation * 10_000} unit=" bp" digits={1} />
        </dd>
        <dt className="font-medium">Selection</dt>
        <dd className="tnum">
          Σ<sub>t</sub> coef<sub>t</sub> · wb<sub>t</sub> (rp<sub>t</sub> − rb<sub>t</sub>) = <Move value={row.selection * 10_000} unit=" bp" digits={1} />
        </dd>
        <dt className="font-medium">Interaction</dt>
        <dd className="tnum">
          Σ<sub>t</sub> coef<sub>t</sub> · (wp<sub>t</sub> − wb<sub>t</sub>)(rp<sub>t</sub> − rb<sub>t</sub>) = <Move value={row.interaction * 10_000} unit=" bp" digits={1} />
        </dd>
      </dl>
      {example && b && (
        <div className="mt-1 rounded-md border bg-muted/30 px-2.5 py-2">
          <div className="mb-1 text-muted-foreground">
            Largest day, {fmtDate(example.date)}: wp {w(example.wp)}, wb {w(b.wb)}, rp {r(example.rp)}, rb {r(b.rb)}, Rb {r(b.Rb)}, coef {f(b.coef, 5)}
            {b.borrowed === "rb" && " · rb borrowed from rp (not in the benchmark)"}
            {b.borrowed === "rp" && " · rp borrowed from rb (not held)"}
          </div>
          <ul className="grid gap-0.5 tnum">
            <li>
              ({w(example.wp)} − {w(b.wb)}) × ({r(b.rb)} − {r(b.Rb)}) = {bps(b.raw.allocation)} × {f(b.coef, 5)} = <Move value={b.scaled.allocation * 10_000} unit=" bp" digits={2} />
            </li>
            <li>
              {w(b.wb)} × ({r(example.rp)} − {r(b.rb)}) = {bps(b.raw.selection)} × {f(b.coef, 5)} = <Move value={b.scaled.selection * 10_000} unit=" bp" digits={2} />
            </li>
            <li>
              ({w(example.wp)} − {w(b.wb)}) × ({r(example.rp)} − {r(b.rb)}) = {bps(b.raw.interaction)} × {f(b.coef, 5)} = <Move value={b.scaled.interaction * 10_000} unit=" bp" digits={2} />
            </li>
          </ul>
        </div>
      )}
    </Block>
  );
}

function CarinoBlock({ linking }: { linking: AttributionBreakdown["linking"] }) {
  const linked = linking.days.reduce((s, d) => s + (d.coef ?? 0) * (d.rp - (d.rb ?? 0)), 0);
  return (
    <Block title="Carino linking" explain={EXPLAIN.coef}>
      <p className="tnum">
        K = [ln(1 + Rp) − ln(1 + Rb)] / (Rp − Rb) = [ln(1 + {r(linking.Rp)}) − ln(1 + {r(linking.Rb!)})] / ({r(linking.Rp)} − {r(linking.Rb!)}) = {f(linking.K!, 6)}
      </p>
      <p className="text-muted-foreground">
        Each day&apos;s coefficient is k<sub>t</sub> / K with k<sub>t</sub> from that day&apos;s rp and rb. Check: Σ coef<sub>t</sub> (rp<sub>t</sub> − rb<sub>t</sub>) ={" "}
        <span className="tnum">{fmtBp(linked * 10_000, 2)}</span>, the period&apos;s active return.
      </p>
    </Block>
  );
}

/** Exported for the table-structure test. */
export function DayTable({ days, hasBench }: { days: SectorDayBreakdown[]; hasBench: boolean }) {
  const [all, setAll] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const shown = all ? days : days.slice(-DEFAULT_ROWS);
  const flagsOf = (d: SectorDayBreakdown) => {
    const out: string[] = [];
    for (const p of d.positions) if (p.priced && p.priced !== "close") out.push(`${p.ticker} ${PRICED[p.priced].label}`);
    if (d.bench?.borrowed === "rb") out.push("rb borrowed");
    if (d.bench?.borrowed === "rp") out.push("rp borrowed");
    return out;
  };
  return (
    <Block title={`Per day (${days.length})`} explain={EXPLAIN.scaledEffect}>
      <div className="overflow-x-auto rounded-md border">
        <Table className="text-caption" aria-label="Per day">
          <TableHeader>
            <TableRow>
              <TableHead className="w-6">
                <span className="sr-only">Positions</span>
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right"><Explained align="right" label="wp" readAs="Fund sector weight">{EXPLAIN.wp}</Explained></TableHead>
              {hasBench && <TableHead className="text-right"><Explained align="right" label="wb" readAs="Benchmark sector weight">{EXPLAIN.wb}</Explained></TableHead>}
              <TableHead className="text-right"><Explained align="right" label="rp" readAs="Fund sector return">{EXPLAIN.rp}</Explained></TableHead>
              {hasBench && <TableHead className="text-right"><Explained align="right" label="rb" readAs="Benchmark sector return">{EXPLAIN.rb}</Explained></TableHead>}
              {hasBench && <TableHead className="text-right"><Explained align="right" label="Rb" readAs="Benchmark total return">{EXPLAIN.Rb}</Explained></TableHead>}
              {hasBench && <TableHead className="text-right"><Explained align="right" label="Raw alloc" readAs="Raw allocation">{EXPLAIN.rawEffect}</Explained></TableHead>}
              {hasBench && <TableHead className="text-right"><ReadAs text="Raw selection">Raw sel</ReadAs></TableHead>}
              {hasBench && <TableHead className="text-right"><ReadAs text="Raw interaction">Raw inter</ReadAs></TableHead>}
              {hasBench && <TableHead className="text-right"><Explained align="right" label="coef" readAs="Carino coefficient">{EXPLAIN.coef}</Explained></TableHead>}
              {hasBench && <TableHead className="text-right"><Explained align="right" label="Alloc" readAs="Allocation">{EXPLAIN.scaledEffect}</Explained></TableHead>}
              {hasBench && <TableHead className="text-right"><ReadAs text="Selection">Sel</ReadAs></TableHead>}
              {hasBench && <TableHead className="text-right"><ReadAs text="Interaction">Inter</ReadAs></TableHead>}
              <TableHead className="text-right"><Explained align="right" label="growth">{EXPLAIN.growth}</Explained></TableHead>
              <TableHead className="text-right"><Explained align="right" label="Contribution">{EXPLAIN.contribution}</Explained></TableHead>
              <TableHead><Explained label="Flags">{EXPLAIN.priced}</Explained></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((d) => {
              const flags = flagsOf(d);
              const open = openDay === d.date;
              const cols = hasBench ? 17 : 7;
              return (
                <DayRows key={d.date} d={d} flags={flags} open={open} hasBench={hasBench} cols={cols} onToggle={() => setOpenDay(open ? null : d.date)} />
              );
            })}
          </TableBody>
        </Table>
      </div>
      {days.length > DEFAULT_ROWS && (
        <button type="button" className="justify-self-start text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setAll((v) => !v)}>
          {all ? `Show last ${DEFAULT_ROWS}` : `Show all ${days.length} days`}
        </button>
      )}
    </Block>
  );
}

function DayRows({ d, flags, open, hasBench, cols, onToggle }: { d: SectorDayBreakdown; flags: string[]; open: boolean; hasBench: boolean; cols: number; onToggle: () => void }) {
  const b = d.bench;
  const canOpen = d.positions.length > 0;
  const detailId = useId();
  return (
    <>
      {/* The whole row opens on a click; the button is the way in from the keyboard and names what it opens. */}
      <TableRow className={cn(canOpen && "cursor-pointer")} onClick={canOpen ? onToggle : undefined}>
        <TableCell className="px-1">
          {canOpen && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              aria-label={`Positions on ${fmtDate(d.date)}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronRight aria-hidden className={cn("size-3 transition-transform", open && "rotate-90")} />
            </button>
          )}
        </TableCell>
        <TableCell className="tnum whitespace-nowrap">{fmtDate(d.date)}</TableCell>
        <TableCell className="tnum text-right">{w(d.wp)}</TableCell>
        {hasBench && <TableCell className="tnum text-right">{b ? w(b.wb) : "—"}</TableCell>}
        <TableCell className="text-right"><Move value={d.rp * 100} unit="%" digits={3} align /></TableCell>
        {hasBench && <TableCell className="text-right">{b ? <Move value={b.rb * 100} unit="%" digits={3} align /> : "—"}</TableCell>}
        {hasBench && <TableCell className="text-right">{b ? <Move value={b.Rb * 100} unit="%" digits={3} align /> : "—"}</TableCell>}
        {hasBench && <TableCell className="text-right">{b ? <Move value={b.raw.allocation * 100} digits={4} align /> : "—"}</TableCell>}
        {hasBench && <TableCell className="text-right">{b ? <Move value={b.raw.selection * 100} digits={4} align /> : "—"}</TableCell>}
        {hasBench && <TableCell className="text-right">{b ? <Move value={b.raw.interaction * 100} digits={4} align /> : "—"}</TableCell>}
        {hasBench && <TableCell className="tnum text-right">{b ? f(b.coef, 5) : "—"}</TableCell>}
        {hasBench && <TableCell className="text-right">{b ? <Move value={b.scaled.allocation * 100} digits={4} align /> : "—"}</TableCell>}
        {hasBench && <TableCell className="text-right">{b ? <Move value={b.scaled.selection * 100} digits={4} align /> : "—"}</TableCell>}
        {hasBench && <TableCell className="text-right">{b ? <Move value={b.scaled.interaction * 100} digits={4} align /> : "—"}</TableCell>}
        <TableCell className="tnum text-right">{f(d.growth, 5)}</TableCell>
        <TableCell className="text-right"><Move value={d.contributionScaled * 100} digits={4} align /></TableCell>
        <TableCell className="whitespace-nowrap">
          {flags.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1 text-warning-foreground">
              <TriangleAlert className="size-2.5" /> {flags.join(", ")}
            </span>
          )}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow id={detailId} className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={cols} className="py-1.5">
            <table className="ml-6 text-caption" aria-label={`Positions on ${fmtDate(d.date)}`}>
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="pr-4 text-left font-medium">Holding</th>
                  <th scope="col" className="pr-4 text-right font-medium">weight</th>
                  <th scope="col" className="pr-4 text-right font-medium">return</th>
                  <th scope="col" className="pr-4 text-right font-medium">contribution</th>
                  <th scope="col" className="pr-4 text-right font-medium">P&amp;L $</th>
                  <th scope="col" className="text-left font-medium">priced by</th>
                </tr>
              </thead>
              <tbody>
                {d.positions.map((p) => (
                  <tr key={p.ticker}>
                    <td className="pr-4 font-medium">{p.ticker}</td>
                    <td className="tnum pr-4 text-right">{w(p.weight)}</td>
                    <td className="pr-4 text-right"><Move value={p.ret * 100} unit="%" digits={3} align /></td>
                    <td className="pr-4 text-right"><Move value={p.contribution * 100} digits={4} align /></td>
                    <td className="tnum pr-4 text-right">{fmtMoney(p.pnl)}</td>
                    <td className={cn(p.priced && PRICED[p.priced].warn && "text-warning-foreground")}>{p.priced ? PRICED[p.priced].label : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function LineageBlock({ lineage, sector }: { lineage: SectorLineage; sector: BucketKey }) {
  return (
    <Block title="Data lineage" explain={EXPLAIN.lineage}>
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_1fr]">
        <dt className="font-medium">daily_closes</dt>
        <dd>
          {lineage.closes.length === 0 ? (
            <span className="text-muted-foreground">no holdings in {bucketLabel(sector)} this period</span>
          ) : (
            <ul className="grid gap-0.5">
              {lineage.closes.map((c) => (
                <li key={c.ticker} className="tnum">
                  <span className="font-medium">{c.ticker}</span> {c.rows} rows{c.from ? `, ${fmtDate(c.from)} to ${fmtDate(c.to)}` : ""}
                  {c.missingDays.length > 0 && <span className="text-warning-foreground"> · no close on {c.missingDays.map(fmtDate).join(", ")}</span>}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt className="font-medium">security_events</dt>
        <dd>
          {lineage.events.length === 0 ? (
            <span className="text-muted-foreground">none in the period</span>
          ) : (
            <ul className="grid gap-0.5">
              {lineage.events.map((e) => (
                <li key={`${e.ticker}-${e.date}-${e.kind}`} className="tnum">
                  <span className="font-medium">{e.ticker}</span> {e.kind} {fmtDate(e.date)} {e.kind === "dividend" ? `$${e.amount}` : `${e.ratio}:1`}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt className="font-medium">sector ETF</dt>
        <dd className="tnum">
          {lineage.benchmark ? (
            <>
              <span className="font-medium">{lineage.benchmark.etf}</span> {lineage.benchmark.rows} closes{lineage.benchmark.from ? `, ${fmtDate(lineage.benchmark.from)} to ${fmtDate(lineage.benchmark.to)}` : ""}
              {lineage.benchmark.staleDays.length > 0 && <span className="text-warning-foreground"> · carried forward on {lineage.benchmark.staleDays.map(fmtDate).join(", ")}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">none: {bucketLabel(sector)} has no benchmark, so its whole effect is allocation</span>
          )}
        </dd>
        <dt className="font-medium">benchmark_sector_weights</dt>
        <dd>
          {lineage.weightSets.length === 0 ? (
            <span className="text-muted-foreground">no weight sets saved</span>
          ) : (
            <ul className="grid gap-0.5">
              {lineage.weightSets.map((s) => (
                <li key={s.asOf} className={cn("tnum", !s.appliedFrom && "text-muted-foreground")}>
                  as of {fmtDate(s.asOf)}
                  {s.weight !== null && `: ${s.weight}%`}
                  {s.appliedFrom ? ` · in effect ${fmtDate(s.appliedFrom)} to ${fmtDate(s.appliedTo)} (drifted daily)` : " · not used in this period"}
                </li>
              ))}
            </ul>
          )}
        </dd>
        {lineage.flags.length > 0 && (
          <>
            <dt className="font-medium text-warning-foreground">flags</dt>
            <dd className="text-warning-foreground">
              {Object.entries(
                lineage.flags.reduce<Record<string, number>>((acc, fl) => {
                  const k = fl.kind === "stale" ? "close carried forward" : fl.kind === "unpriced" ? "valued at trade price" : fl.kind === "etf-stale" ? "ETF close carried forward" : "day before the first weight set";
                  acc[k] = (acc[k] ?? 0) + 1;
                  return acc;
                }, {}),
              )
                .map(([k, n]) => `${k} × ${n}`)
                .join(" · ")}
            </dd>
          </>
        )}
      </dl>
    </Block>
  );
}
