import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HoldingRow } from "@/lib/attribution/attribution";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { Move } from "../move";
import { fmtWeight, pct } from "./format";

export type TeamLookup = Map<string, { name: string; slug: string }>;

export function ContributorsTable({ rows, teams, showTeam = true }: { rows: HoldingRow[]; teams: TeamLookup; showTeam?: boolean }) {
  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Holding</TableHead>
            <TableHead>{showTeam ? "Team" : "Sector"}</TableHead>
            <TableHead className="text-right">Avg wt</TableHead>
            <TableHead className="text-right">Return</TableHead>
            <TableHead className="text-right">Contribution</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h) => {
            const team = h.teamId ? teams.get(h.teamId) : undefined;
            return (
              <TableRow key={h.ticker}>
                <TableCell>
                  {team ? <Link href={`/t/${team.slug}/h/${h.ticker}`} className="font-medium hover:underline">{h.ticker}</Link> : <span className="font-medium">{h.ticker}</span>}
                  <span className="ml-2 hidden text-muted-foreground sm:inline">{h.name}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{showTeam ? (team?.name ?? "—") : h.sector ? SECTOR_LABELS[h.sector] : "Unclassified"}</TableCell>
                <TableCell className="tnum text-right">{fmtWeight(h.avgWeight)}</TableCell>
                <TableCell className="text-right"><Move value={pct(h.ret)} unit="%" digits={2} /></TableCell>
                <TableCell className="text-right"><Move value={pct(h.contribution)} unit="pp" digits={2} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
