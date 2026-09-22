import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttributionResult } from "@/lib/attribution/attribution";
import { ETF_BY_SECTOR, bucketLabel } from "@/lib/attribution/sectors";
import { cn } from "@/lib/utils";
import { Move } from "../move";
import { DivergingBar, MagnitudeBar } from "./bars";
import { EXPLAIN } from "./explainers";
import { bps, fmtWeight, pct } from "./format";
import { Explained } from "./info-tip";
import { InteractionToggle } from "./interaction-toggle";
import { SectorBreakdownRow } from "./sector-breakdown-row";
import type { BreakdownQuery } from "./sector-breakdown";

/** Hidden while the "Show interaction" checkbox is off. */
const INTERACTION = "group-data-[hide-interaction=true]/sectors:hidden";

function WeightCell({ portfolio, benchmark, max }: { portfolio: number; benchmark: number | null; max: number }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <MagnitudeBar value={portfolio} max={max} className="h-1.5 w-20" />
        <span className="tnum w-11 text-xs">{fmtWeight(portfolio)}</span>
      </div>
      {benchmark !== null && (
        <div className="flex items-center gap-2">
          <MagnitudeBar value={benchmark} max={max} color="var(--muted-foreground)" className="h-1.5 w-20" />
          <span className="tnum w-11 text-xs text-muted-foreground">{fmtWeight(benchmark)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * `breakdownQuery` is passed only in transparency mode (exec/admin preference): each row then
 * expands to its per-day working, fetched on demand.
 */
export function SectorTable({ result, breakdownQuery }: { result: AttributionResult; breakdownQuery?: BreakdownQuery }) {
  const hasBench = result.effects !== null;
  const dash = <span className="text-muted-foreground">—</span>;
  const cols = (hasBench ? 8 : 4) + (breakdownQuery ? 1 : 0);
  const maxWeight = Math.max(...result.sectors.flatMap((r) => [r.avgPortfolioWeight, hasBench ? r.avgBenchmarkWeight : 0]), 0);
  const maxEffect = Math.max(...result.sectors.map((r) => Math.abs(r.total)), 0);

  const table = (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            {breakdownQuery && <TableHead className="w-6 px-2"><Explained label="">{EXPLAIN.breakdown}</Explained></TableHead>}
            <TableHead><Explained label="Sector">{EXPLAIN.sectors}</Explained></TableHead>
            <TableHead><Explained label={hasBench ? "Weight" : "Avg wt"}>{EXPLAIN.avgWeight}</Explained>{hasBench && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">Fund · bench</span>}</TableHead>
            <TableHead className="text-right"><Explained align="right" label="Return">{EXPLAIN.sectorReturn}</Explained>{hasBench && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">Fund vs bench</span>}</TableHead>
            <TableHead className="text-right"><Explained align="right" label="Contribution">{EXPLAIN.contribution}</Explained></TableHead>
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Allocation">{EXPLAIN.allocation}</Explained></TableHead>}
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Selection">{EXPLAIN.selection}</Explained></TableHead>}
            {hasBench && <TableHead className={cn("text-right", INTERACTION)}><Explained align="right" label="Interaction">{EXPLAIN.interaction}</Explained></TableHead>}
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Total effect">{EXPLAIN.totalEffect}</Explained></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.sectors.map((r) => {
            const etf = r.key !== "cash" && r.key !== "unclassified" ? ETF_BY_SECTOR[r.key] : null;
            const cells = (
              <>
                <TableCell className="font-medium">
                  {bucketLabel(r.key)}
                  {etf && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{etf}</span>}
                </TableCell>
                <TableCell><WeightCell portfolio={r.avgPortfolioWeight} benchmark={hasBench ? r.avgBenchmarkWeight : null} max={maxWeight} /></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {r.portfolioReturn === null ? dash : <Move value={pct(r.portfolioReturn)} unit="%" digits={1} className="font-medium" />}
                  {hasBench && <span className="ml-1.5 text-xs text-muted-foreground">vs {r.benchmarkReturn === null ? "—" : `${r.benchmarkReturn > 0 ? "+" : ""}${(r.benchmarkReturn * 100).toFixed(1)}%`}</span>}
                </TableCell>
                <TableCell className="text-right"><Move value={bps(r.contribution)} unit="" digits={1} /></TableCell>
                {hasBench && <TableCell className="text-right"><Move value={bps(r.allocation)} unit="" digits={1} /></TableCell>}
                {hasBench && <TableCell className="text-right">{r.key === "cash" ? dash : <Move value={bps(r.selection)} unit="" digits={1} />}</TableCell>}
                {hasBench && <TableCell className={cn("text-right", INTERACTION)}>{r.key === "cash" ? dash : <Move value={bps(r.interaction)} unit="" digits={1} />}</TableCell>}
                {hasBench && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-2.5">
                      <DivergingBar value={r.total} max={maxEffect} className="w-12" />
                      <Move value={bps(r.total)} unit="" digits={0} className="w-10 text-right font-semibold" />
                    </div>
                  </TableCell>
                )}
              </>
            );
            return breakdownQuery ? (
              <SectorBreakdownRow key={r.key} sector={r.key} query={breakdownQuery} colSpan={cols}>
                {cells}
              </SectorBreakdownRow>
            ) : (
              <TableRow key={r.key}>{cells}</TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            {breakdownQuery && <TableCell />}
            <TableCell className="font-medium">Fund</TableCell>
            <TableCell className="tnum text-xs">{hasBench ? "100.0% · 100.0%" : "100.0%"}</TableCell>
            <TableCell className="text-right whitespace-nowrap">
              <Move value={pct(result.portfolioReturn)} unit="%" digits={2} className="font-medium" />
              {hasBench && <span className="ml-1.5 text-xs text-muted-foreground">vs {result.benchmarkReturn === null ? "—" : `${result.benchmarkReturn > 0 ? "+" : ""}${(result.benchmarkReturn * 100).toFixed(2)}%`}</span>}
            </TableCell>
            <TableCell className="text-right"><Move value={bps(result.portfolioReturn)} unit="" digits={1} /></TableCell>
            {hasBench && <TableCell className="text-right"><Move value={bps(result.effects!.allocation)} unit="" digits={1} /></TableCell>}
            {hasBench && <TableCell className="text-right"><Move value={bps(result.effects!.selection)} unit="" digits={1} /></TableCell>}
            {hasBench && <TableCell className={cn("text-right", INTERACTION)}><Move value={bps(result.effects!.interaction)} unit="" digits={1} /></TableCell>}
            {hasBench && <TableCell className="text-right font-semibold"><Move value={bps(result.activeReturn)} unit="" digits={1} /></TableCell>}
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );

  return hasBench ? <InteractionToggle>{table}</InteractionToggle> : table;
}
