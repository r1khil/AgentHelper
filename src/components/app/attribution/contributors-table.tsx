import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HoldingRow } from "@/lib/attribution/attribution";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { Move } from "../move";
import { EXPLAIN } from "./explainers";
import { bps, fmtWeight, pct } from "./format";
import { Tip } from "./info-tip";

export type TeamLookup = Map<string, { name: string; slug: string }>;

/** Every holding in the period with its weight, return and contribution. Sits inside a panel. */
export function ContributorsTable({ rows, teams, showTeam = true }: { rows: HoldingRow[]; teams: TeamLookup; showTeam?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Holding</TableHead>
            <TableHead>{showTeam ? "Team" : "Sector"}</TableHead>
            <TableHead className="text-right"><Tip label="Avg wt" side="bottom">{EXPLAIN.holdingWeight}</Tip></TableHead>
            <TableHead className="text-right"><Tip label="Return" side="bottom">{EXPLAIN.holdingReturn}</Tip></TableHead>
            <TableHead className="pr-4 text-right"><Tip label="Contribution" side="bottom">{EXPLAIN.contribution}</Tip></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h) => {
            const team = h.teamId ? teams.get(h.teamId) : undefined;
            return (
              <TableRow key={h.ticker}>
                <TableCell className="pl-4">
                  <div className="flex min-w-0 items-baseline gap-2">
                    {team ? <Link href={`/t/${team.slug}/h/${h.ticker}`} className="font-mono font-semibold hover:underline">{h.ticker}</Link> : <span className="font-mono font-semibold">{h.ticker}</span>}
                    <span className="max-w-64 truncate text-ink-2">{h.name}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-44 truncate text-muted-foreground">{showTeam ? (team?.name ?? "—") : h.sector ? SECTOR_LABELS[h.sector] : "Unclassified"}</TableCell>
                <TableCell className="text-right font-mono text-[12.5px]">{fmtWeight(h.avgWeight)}</TableCell>
                <TableCell className="text-right text-[12.5px]"><Move value={pct(h.ret)} unit="%" digits={2} /></TableCell>
                <TableCell className="pr-4 text-right text-[12.5px]"><Move value={bps(h.contribution)} unit=" bp" digits={1} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
