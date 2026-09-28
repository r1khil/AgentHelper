import type { HoldingRow } from "@/lib/attribution/attribution";
import { MagnitudeBar } from "./bars";
import type { TeamLookup } from "./contributors-table";
import { fmtAccounting, fmtPct } from "@/lib/format";
import { bps, pct } from "./format";
import { ReadAs, tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

/**
 * One column of holdings ranked by contribution: ticker, who owns it and its average weight, a bar scaled to the
 * largest absolute contribution in that column, and the contribution in bp. A table named `label` for screen readers.
 */
export function HoldingsColumn({ rows, teams, label, caption }: { rows: HoldingRow[]; teams: TeamLookup; label: string; caption: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.contribution)), 0);
  return (
    <div role="table" aria-label={label} className="grid content-start">
      <div role="row" className="grid h-8 grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2.5 border-b text-xs text-muted-foreground">
        <span role="columnheader">Ticker</span>
        <span role="columnheader" className="truncate">{caption}</span>
        <span role="columnheader" className="text-right"><ReadAs text="Contribution, basis points">bp</ReadAs></span>
      </div>
      {rows.map((h) => {
        const team = h.teamId ? teams.get(h.teamId) : undefined;
        const bp = Math.round(h.contribution * 10_000);
        return (
          <div key={h.ticker} role="row" className="relative grid min-h-10 grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2.5 border-b border-row text-[13.5px] last:border-b-0">
            <span role="rowheader" className="truncate font-mono font-semibold">
              {team ? (
                <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(h.ticker)}`} aria-label={tickerName(h.ticker, h.name)} className="hover:underline">{h.ticker}</RowLink>
              ) : (
                h.ticker
              )}
            </span>
            <div role="cell" className="grid min-w-0 gap-1">
              <span className="truncate text-xs text-ink-2">
                {team?.name ?? h.name} · <span className="font-mono">{fmtPct(pct(h.avgWeight), 1)}</span>
              </span>
              <MagnitudeBar value={h.contribution} max={max} color={h.contribution < 0 ? "var(--down)" : "var(--up)"} align={h.contribution < 0 ? "end" : "start"} className="h-1.5" />
            </div>
            <span role="cell" className={`text-right font-mono text-[12.5px] font-semibold ${bp > 0 ? "text-up" : bp < 0 ? "text-down" : "text-muted-foreground"}`}>{fmtAccounting(bps(h.contribution), 0)}</span>
          </div>
        );
      })}
    </div>
  );
}
