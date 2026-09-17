import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttributionResult } from "@/lib/attribution/attribution";
import { ETF_BY_SECTOR, bucketLabel } from "@/lib/attribution/sectors";
import { Move } from "../move";
import { fmtWeight, pct } from "./format";

export function SectorTable({ result }: { result: AttributionResult }) {
  const hasBench = result.effects !== null;
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sector</TableHead>
            <TableHead className="text-right">Avg wt</TableHead>
            {hasBench && <TableHead className="text-right">Bench wt</TableHead>}
            {hasBench && <TableHead className="text-right">Active wt</TableHead>}
            <TableHead className="text-right">Return</TableHead>
            {hasBench && <TableHead className="text-right">Bench return</TableHead>}
            <TableHead className="text-right">Contribution</TableHead>
            {hasBench && <TableHead className="text-right">Allocation</TableHead>}
            {hasBench && <TableHead className="text-right">Selection</TableHead>}
            {hasBench && <TableHead className="text-right">Interaction</TableHead>}
            {hasBench && <TableHead className="text-right">Total effect</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.sectors.map((r) => (
            <TableRow key={r.key}>
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
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
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
