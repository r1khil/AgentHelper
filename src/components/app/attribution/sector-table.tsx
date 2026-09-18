import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttributionResult } from "@/lib/attribution/attribution";
import { ETF_BY_SECTOR, bucketLabel } from "@/lib/attribution/sectors";
import { Move } from "../move";
import { EXPLAIN } from "./explainers";
import { fmtWeight, pct } from "./format";
import { Explained } from "./info-tip";
import { SectorBreakdownRow } from "./sector-breakdown-row";
import type { BreakdownQuery } from "./sector-breakdown";

/**
 * `breakdownQuery` is passed only in transparency mode (exec/admin preference): each row then
 * expands to its per-day working, fetched on demand.
 */
export function SectorTable({ result, breakdownQuery }: { result: AttributionResult; breakdownQuery?: BreakdownQuery }) {
  const hasBench = result.effects !== null;
  const dash = <span className="text-muted-foreground">—</span>;
  const cols = (hasBench ? 11 : 4) + (breakdownQuery ? 1 : 0);
  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            {breakdownQuery && <TableHead className="w-6 px-2"><Explained label="">{EXPLAIN.breakdown}</Explained></TableHead>}
            <TableHead><Explained label="Sector">{EXPLAIN.sectors}</Explained></TableHead>
            <TableHead className="text-right"><Explained align="right" label="Avg wt">{EXPLAIN.avgWeight}</Explained></TableHead>
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Bench wt">{EXPLAIN.benchWeight}</Explained></TableHead>}
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Active wt">{EXPLAIN.activeWeight}</Explained></TableHead>}
            <TableHead className="text-right"><Explained align="right" label="Return">{EXPLAIN.sectorReturn}</Explained></TableHead>
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Bench return">{EXPLAIN.benchReturn}</Explained></TableHead>}
            <TableHead className="text-right"><Explained align="right" label="Contribution">{EXPLAIN.contribution}</Explained></TableHead>
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Allocation">{EXPLAIN.allocation}</Explained></TableHead>}
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Selection">{EXPLAIN.selection}</Explained></TableHead>}
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Interaction">{EXPLAIN.interaction}</Explained></TableHead>}
            {hasBench && <TableHead className="text-right"><Explained align="right" label="Total effect">{EXPLAIN.totalEffect}</Explained></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.sectors.map((r) => {
            const cells = (
              <>
              <TableCell className="font-medium">{bucketLabel(r.key)}</TableCell>
              <TableCell className="tnum text-right">{fmtWeight(r.avgPortfolioWeight)}</TableCell>
              {hasBench && <TableCell className="tnum text-right">{fmtWeight(r.avgBenchmarkWeight)}</TableCell>}
              {hasBench && <TableCell className="text-right"><Move value={pct(r.avgPortfolioWeight - r.avgBenchmarkWeight)} unit="pp" /></TableCell>}
              <TableCell className="text-right">{r.portfolioReturn === null ? dash : <Move value={pct(r.portfolioReturn)} unit="%" digits={2} />}</TableCell>
              {hasBench && (
                <TableCell className="text-right">
                  {r.benchmarkReturn === null ? dash : (
                    <>
                      <Move value={pct(r.benchmarkReturn)} unit="%" digits={2} />
                      {r.key !== "cash" && r.key !== "unclassified" && <span className="ml-1.5 text-xs text-muted-foreground">{ETF_BY_SECTOR[r.key]}</span>}
                    </>
                  )}
                </TableCell>
              )}
              <TableCell className="text-right"><Move value={pct(r.contribution)} unit="pp" digits={2} /></TableCell>
              {hasBench && <TableCell className="text-right"><Move value={pct(r.allocation)} unit="pp" digits={2} /></TableCell>}
              {hasBench && <TableCell className="text-right"><Move value={pct(r.selection)} unit="pp" digits={2} /></TableCell>}
              {hasBench && <TableCell className="text-right"><Move value={pct(r.interaction)} unit="pp" digits={2} /></TableCell>}
              {hasBench && <TableCell className="text-right font-medium"><Move value={pct(r.total)} unit="pp" digits={2} /></TableCell>}
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
            <TableCell className="font-medium">Total</TableCell>
            <TableCell className="tnum text-right">100.0%</TableCell>
            {hasBench && <TableCell className="tnum text-right">100.0%</TableCell>}
            {hasBench && <TableCell />}
            <TableCell className="text-right"><Move value={pct(result.portfolioReturn)} unit="%" digits={2} /></TableCell>
            {hasBench && <TableCell className="text-right"><Move value={pct(result.benchmarkReturn)} unit="%" digits={2} /></TableCell>}
            <TableCell className="text-right"><Move value={pct(result.portfolioReturn)} unit="pp" digits={2} /></TableCell>
            {hasBench && <TableCell className="text-right"><Move value={pct(result.effects!.allocation)} unit="pp" digits={2} /></TableCell>}
            {hasBench && <TableCell className="text-right"><Move value={pct(result.effects!.selection)} unit="pp" digits={2} /></TableCell>}
            {hasBench && <TableCell className="text-right"><Move value={pct(result.effects!.interaction)} unit="pp" digits={2} /></TableCell>}
            {hasBench && <TableCell className="text-right font-medium"><Move value={pct(result.activeReturn)} unit="pp" digits={2} /></TableCell>}
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}
