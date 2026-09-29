import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Signed } from "@/components/app/portfolio/parts";
import { ReadAs, tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";
import { Tip } from "@/components/app/attribution/info-tip";
import { bps, pct } from "@/components/app/attribution/format";
import type { TeamLookup } from "@/components/app/attribution/contributors-table";
import type { LiveHolding } from "@/lib/attribution/live";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { fmtChangeBp, fmtChangePct, fmtChangeUsd, fmtPct, fmtTime, fmtUsd } from "@/lib/format";

const SOURCE: Record<LiveHolding["source"], string> = {
  quote: "Live quote",
  close: "Stored close",
  carried: "No quote yet this session: held at the last close",
  trade: "Valued at today's trade price",
};

/** Every holding in the session: start and current weight, price, the day's move, contribution and P&L. */
export function LiveHoldingsTable({ rows, teams, showTeam, own }: { rows: LiveHolding[]; teams: TeamLookup; showTeam: boolean; own: string }) {
  return (
    <div className="overflow-x-auto">
      <Table aria-label="Holdings by contribution today">
        <TableHeader>
          <TableRow>
            <TableHead className="text-caption first:pl-0">Holding</TableHead>
            <TableHead className="text-caption">{showTeam ? "Team" : "Sector"}</TableHead>
            <TableHead className="text-right text-caption"><Tip label={<ReadAs text="Weight at the open">Wt open</ReadAs>} side="bottom">Share of the {own} at the start of the session, before today&apos;s moves. Contributions are weighted by it.</Tip></TableHead>
            <TableHead className="text-right text-caption"><Tip label={<ReadAs text="Weight now">Wt now</ReadAs>} side="bottom">Share of the {own} at the current price: the opening weight drifted by today&apos;s moves.</Tip></TableHead>
            <TableHead className="text-right text-caption">Price</TableHead>
            <TableHead className="text-right text-caption"><Tip label="Today" side="bottom">Return from the prior close, including a dividend going ex today and any trade today at its price.</Tip></TableHead>
            <TableHead className="text-right text-caption"><Tip label="Contribution" side="bottom">Opening weight times today&apos;s return: how many points of the {own}&apos;s return came from this holding. They add up to the {own}&apos;s return.</Tip></TableHead>
            <TableHead className="text-right text-caption last:pr-0">P&amp;L ($)</TableHead>
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
                    <span aria-hidden={team ? true : undefined} className="max-w-56 truncate text-ink-2">{h.name}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-40 truncate text-muted-foreground">{showTeam ? (team?.name ?? "—") : h.sector ? SECTOR_LABELS[h.sector] : "Unclassified"}</TableCell>
                <TableCell className="text-right">{fmtPct(pct(h.weightOpen), 1)}</TableCell>
                <TableCell className="text-right">{fmtPct(pct(h.weightNow), 1)}</TableCell>
                <TableCell className="text-right" title={h.quoteAt ? `${SOURCE[h.source]}, ${fmtTime(h.quoteAt)}` : SOURCE[h.source]}>
                  {h.source === "carried" ? <span className="text-muted-foreground">{fmtUsd(h.price)}</span> : fmtUsd(h.price)}
                </TableCell>
                <TableCell className="text-right"><Signed text={fmtChangePct(pct(h.ret))} /></TableCell>
                <TableCell className="text-right"><Signed text={fmtChangeBp(bps(h.contribution), 1)} /></TableCell>
                <TableCell className="text-right last:pr-0"><Signed text={fmtChangeUsd(h.pnl, 0).replace("$", "")} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
