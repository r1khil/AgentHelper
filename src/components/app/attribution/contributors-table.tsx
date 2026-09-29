import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HoldingRow } from "@/lib/attribution/attribution";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { Signed } from "@/components/app/portfolio/parts";
import { EXPLAIN } from "./explainers";
import { fmtChangeBp, fmtChangePct, fmtPct } from "@/lib/format";
import { bps, pct } from "./format";
import { Tip } from "./info-tip";
import { ReadAs, tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

export type TeamLookup = Map<string, { name: string; slug: string }>;

/** Every holding in the period with its weight, return and contribution. Sits inside a panel. */
export function ContributorsTable({ rows, teams, showTeam = true }: { rows: HoldingRow[]; teams: TeamLookup; showTeam?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table aria-label="Holdings by contribution">
        <TableHeader>
          <TableRow>
            <TableHead className="first:pl-0">Holding</TableHead>
            <TableHead>{showTeam ? "Team" : "Sector"}</TableHead>
            <TableHead className="text-right"><Tip label={<ReadAs text="Average weight">Avg wt</ReadAs>} side="bottom">{EXPLAIN.holdingWeight}</Tip></TableHead>
            <TableHead className="text-right"><Tip label="Return" side="bottom">{EXPLAIN.holdingReturn}</Tip></TableHead>
            <TableHead className="text-right last:pr-0"><Tip label="Contribution" side="bottom">{EXPLAIN.contribution}</Tip></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((h) => {
            const team = h.teamId ? teams.get(h.teamId) : undefined;
            return (
              <TableRow key={h.ticker}>
                <TableCell className="first:pl-0">
                  <div className="flex min-w-0 items-baseline gap-2">
                    {team ? <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(h.ticker)}`} aria-label={tickerName(h.ticker, h.name)} className="font-semibold hover:underline">{h.ticker}</RowLink> : <span className="font-semibold">{h.ticker}</span>}
                    <span aria-hidden={team ? true : undefined} className="max-w-64 truncate text-ink-2">
                      {h.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-44 truncate text-muted-foreground">{showTeam ? (team?.name ?? "—") : h.sector ? SECTOR_LABELS[h.sector] : "Unclassified"}</TableCell>
                <TableCell className="text-right text-body">{fmtPct(pct(h.avgWeight), 1)}</TableCell>
                <TableCell className="text-right text-body"><Signed text={fmtChangePct(pct(h.ret))} /></TableCell>
                <TableCell className="pr-4 text-right text-body"><Signed text={fmtChangeBp(bps(h.contribution), 1)} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
