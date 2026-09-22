import Link from "next/link";
import type { TeamRow } from "@/lib/attribution/attribution";
import { Move } from "../move";
import { MagnitudeBar } from "./bars";
import type { TeamLookup } from "./contributors-table";
import { bps, fmtWeight, pct } from "./format";

const ROW = "grid grid-cols-[minmax(0,1fr)_3.25rem_3.75rem_minmax(2rem,1fr)_3.25rem] items-center gap-2.5";

/** Teams ranked by contribution to the Fund, each row linking to that team's attribution view. */
export function TeamTable({ rows, teams, cashContribution, cashWeight, query }: { rows: TeamRow[]; teams: TeamLookup; cashContribution: number; cashWeight?: number; query: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.contribution)), 0);
  return (
    <div className="grid gap-1 text-sm">
      <div className={`${ROW} border-b pb-1 text-[11px] text-muted-foreground`}>
        <span>Team</span>
        <span className="text-right">Avg wt</span>
        <span className="text-right">Return</span>
        <span />
        <span className="text-right">bps</span>
      </div>
      {rows.map((t) => {
        const team = t.teamId ? teams.get(t.teamId) : undefined;
        const cells = (
          <>
            <span className="truncate font-medium">{team?.name ?? "No team"}</span>
            <span className="tnum text-right text-muted-foreground">{fmtWeight(t.avgWeight)}</span>
            <Move value={pct(t.ret)} unit="%" digits={1} className="text-right" />
            <MagnitudeBar value={t.contribution} max={max} align={t.contribution < 0 ? "end" : "start"} color={t.contribution < 0 ? "var(--down)" : "var(--series-1)"} />
            <Move value={bps(t.contribution)} unit="" digits={0} className="text-right font-semibold" />
          </>
        );
        return team ? (
          <Link key={t.teamId} href={`/t/${team.slug}/attribution${query}`} className={`${ROW} -mx-2 rounded-md px-2 py-1.5 hover:bg-muted/60`}>
            {cells}
          </Link>
        ) : (
          <div key="none" className={`${ROW} -mx-2 px-2 py-1.5`}>{cells}</div>
        );
      })}
      {Math.abs(cashContribution) > 1e-9 && (
        <div className={`${ROW} -mx-2 mt-1 border-t px-2 pt-2 text-muted-foreground`}>
          <span className="truncate">Cash, fees and interest</span>
          <span className="tnum text-right">{cashWeight === undefined ? "" : fmtWeight(cashWeight)}</span>
          <span />
          <span />
          <Move value={bps(cashContribution)} unit="" digits={0} className="text-right font-semibold" />
        </div>
      )}
    </div>
  );
}
