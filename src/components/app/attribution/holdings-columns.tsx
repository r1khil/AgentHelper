import Link from "next/link";
import type { HoldingRow } from "@/lib/attribution/attribution";
import { Move } from "../move";
import { MagnitudeBar } from "./bars";
import type { TeamLookup } from "./contributors-table";
import { bps, fmtWeight } from "./format";

/**
 * One column of holdings ranked by contribution: ticker, who owns it, and a bar scaled to the
 * largest absolute contribution in that column.
 */
export function HoldingsColumn({ rows, teams, caption }: { rows: HoldingRow[]; teams: TeamLookup; caption: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.contribution)), 0);
  return (
    <div className="grid content-start gap-2">
      <div className="grid grid-cols-[3.25rem_1fr_3.5rem] gap-2.5 border-b pb-1 text-[11px] text-muted-foreground">
        <span>Ticker</span>
        <span>{caption}</span>
        <span className="text-right">bps</span>
      </div>
      {rows.map((h) => {
        const team = h.teamId ? teams.get(h.teamId) : undefined;
        return (
          <div key={h.ticker} className="grid grid-cols-[3.25rem_1fr_3.5rem] items-center gap-2.5 text-sm">
            {team ? (
              <Link href={`/t/${team.slug}/h/${h.ticker}`} className="truncate font-semibold hover:underline">{h.ticker}</Link>
            ) : (
              <span className="truncate font-semibold">{h.ticker}</span>
            )}
            <div className="grid gap-1">
              <span className="truncate text-xs text-muted-foreground">{`${team?.name ?? h.name} · ${fmtWeight(h.avgWeight)}`}</span>
              <MagnitudeBar
                value={h.contribution}
                max={max}
                color={h.contribution < 0 ? "var(--down)" : "var(--up)"}
                align={h.contribution < 0 ? "end" : "start"}
                className="h-1.5"
              />
            </div>
            <Move value={bps(h.contribution)} unit="" digits={0} className="text-right font-semibold" />
          </div>
        );
      })}
    </div>
  );
}
