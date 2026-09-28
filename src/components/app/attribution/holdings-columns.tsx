import type { HoldingRow } from "@/lib/attribution/attribution";
import { MagnitudeBar } from "./bars";
import type { TeamLookup } from "./contributors-table";
import { fmtAccounting, fmtPct } from "@/lib/format";
import { bps, pct } from "./format";
import { RowLink } from "@/components/app/row-link";

/**
 * One column of holdings ranked by contribution: ticker, who owns it and its average weight, a bar scaled to the
 * largest absolute contribution in that column, and the contribution in bp.
 */
export function HoldingsColumn({ rows, teams, caption }: { rows: HoldingRow[]; teams: TeamLookup; caption: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.contribution)), 0);
  return (
    <div className="grid content-start">
      <div className="grid h-8 grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2.5 border-b text-xs text-muted-foreground">
        <span>Ticker</span>
        <span className="truncate">{caption}</span>
        <span className="text-right">bp</span>
      </div>
      {rows.map((h) => {
        const team = h.teamId ? teams.get(h.teamId) : undefined;
        const bp = Math.round(h.contribution * 10_000);
        return (
          <div key={h.ticker} className="relative grid min-h-10 grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2.5 border-b border-row text-[13.5px] last:border-b-0">
            {team ? (
              <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(h.ticker)}`} className="truncate font-mono font-semibold hover:underline">{h.ticker}</RowLink>
            ) : (
              <span className="truncate font-mono font-semibold">{h.ticker}</span>
            )}
            <div className="grid min-w-0 gap-1">
              <span className="truncate text-xs text-ink-2">
                {team?.name ?? h.name} · <span className="font-mono">{fmtPct(pct(h.avgWeight), 1)}</span>
              </span>
              <MagnitudeBar value={h.contribution} max={max} color={h.contribution < 0 ? "var(--down)" : "var(--up)"} align={h.contribution < 0 ? "end" : "start"} className="h-1.5" />
            </div>
            <span className={`text-right font-mono text-[12.5px] font-semibold ${bp > 0 ? "text-up" : bp < 0 ? "text-down" : "text-muted-foreground"}`}>{fmtAccounting(bps(h.contribution), 0)}</span>
          </div>
        );
      })}
    </div>
  );
}
