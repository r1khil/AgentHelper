import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TeamRow } from "@/lib/attribution/attribution";
import { Move } from "../move";
import type { TeamLookup } from "./contributors-table";
import { EXPLAIN } from "./explainers";
import { bps, fmtWeight, pct } from "./format";
import { Explained } from "./info-tip";

export function TeamTable({ rows, teams, cashContribution, query }: { rows: TeamRow[]; teams: TeamLookup; cashContribution: number; query: string }) {
  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead className="text-right"><Explained align="right" label="Avg wt">{EXPLAIN.holdingWeight}</Explained></TableHead>
            <TableHead className="text-right"><Explained align="right" label="Return">{EXPLAIN.holdingReturn}</Explained></TableHead>
            <TableHead className="text-right"><Explained align="right" label="Contribution">{EXPLAIN.contribution}</Explained></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const team = t.teamId ? teams.get(t.teamId) : undefined;
            return (
              <TableRow key={t.teamId ?? "none"}>
                <TableCell className="font-medium">
                  {team ? <Link href={`/t/${team.slug}/attribution${query}`} className="hover:underline">{team.name}</Link> : "No team"}
                </TableCell>
                <TableCell className="tnum text-right">{fmtWeight(t.avgWeight)}</TableCell>
                <TableCell className="text-right"><Move value={pct(t.ret)} unit="%" digits={2} /></TableCell>
                <TableCell className="text-right"><Move value={bps(t.contribution)} unit=" bps" digits={1} /></TableCell>
              </TableRow>
            );
          })}
          {Math.abs(cashContribution) > 1e-9 && (
            <TableRow>
              <TableCell className="font-medium">Cash, fees and interest</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right"><Move value={bps(cashContribution)} unit=" bps" digits={1} /></TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
