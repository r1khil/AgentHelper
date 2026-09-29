import { CenterBar, HowNote, SectionHead, signTone, toneClass } from "@/components/app/portfolio/parts";
import { Segmented } from "@/components/app/panel";
import { RowLink } from "@/components/app/row-link";
import type { AttributionResult, HoldingRow, TeamRow } from "@/lib/attribution/attribution";
import { bucketLabel } from "@/lib/attribution/sectors";
import { fmtAccounting, fmtChangeBp, fmtChangePct, fmtDay, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PeriodSelector, type ViewPeriodKey } from "./period-selector";
import { ContributorsTable, type TeamLookup } from "./contributors-table";
import { EXPLAIN } from "./explainers";
import { bps, pct } from "./format";
import { HoldingsColumn } from "./holdings-columns";
import { Tip } from "./info-tip";
import { SectorEffectsList, type SectorEffectPoint } from "./sector-effects-list";

export function rangeText(start: string, end: string, days: number) {
  return `${fmtDay(start)} close through ${fmtDay(end)}, ${days} trading ${days === 1 ? "day" : "days"}`;
}

export const LEDGER_HREF = "/t/fund/activity";

/** The period buttons with, on the right, whatever the caller puts there (the chart's key, the Details button). */
export function PeriodBar({ basePath, active, from, to, inception, latest, children }: { basePath: string; active: ViewPeriodKey; from?: string; to?: string; inception: string; latest: string; children?: React.ReactNode }) {
  return (
    <div className="mt-3.5 flex items-center gap-1 border-b pb-3.5">
      <PeriodSelector basePath={basePath} active={active} from={from} to={to} inception={inception} latest={latest} />
      <span className="flex-1" />
      {children}
    </div>
  );
}


/** One decimal of bp with a plus when up, no unit: for lists whose heading says "bp". */
const bp1 = (v: number) => {
  const t = fmtAccounting(bps(v), 1);
  return bps(v) > 0 && /[1-9]/.test(t) ? `+${t}` : t;
};

export type Effect = { label: string; tip: string; value: number; note: React.ReactNode };

/**
 * "The gap, and where it came from": the effects that add up to the gap to the benchmark, as figures with a line each.
 * Weights (allocation) and picks (selection with its overlap), then the total.
 */
export function effectCells(effects: Effect[]) {
  return effects.map((e) => {
    const shown = Math.round(bps(e.value));
    return {
      label: <Tip label={e.label} side="bottom">{e.tip}</Tip>,
      value: `${bp1(e.value)} bp`,
      tone: shown > 0 ? ("up" as const) : shown < 0 ? ("down" as const) : null,
      note: e.note,
    };
  });
}

/**
 * The three figures under the chart: sector weights (allocation), picks (selection with its overlap) and the total gap
 * they add up to. Null while there is no sector benchmark to measure against.
 */
export function bridgeCells(r: AttributionResult, fund: boolean) {
  if (!r.effects) return null;
  const cashRow = r.sectors.find((s) => s.key === "cash");
  const leader = [...r.sectors].filter((s) => s.key !== "cash").sort((a, b) => b.selection + b.interaction - (a.selection + a.interaction))[0];
  const picks = r.effects.selection + r.effects.interaction;
  const leaderPicks = leader ? leader.selection + leader.interaction : 0;
  return effectCells([
    {
      label: "Sector weights (allocation)",
      tip: fund ? EXPLAIN.allocation : `${EXPLAIN.teamAllocation} Mix across team sectors.`,
      value: r.effects.allocation,
      note: cashRow
        ? fund
          ? `${cashRow.allocation < 0 ? "Cash drag" : "Cash"} ${fmtChangeBp(bps(cashRow.allocation))}; sector bets ${fmtChangeBp(bps(r.effects.allocation - cashRow.allocation))}`
          : `Cash ${fmtChangeBp(bps(cashRow.allocation))}`
        : fund
          ? "Sector bets against the benchmark"
          : "Mix across the team's sectors",
    },
    {
      label: "Picks within sectors (selection)",
      tip: `${fund ? EXPLAIN.selection : EXPLAIN.teamSelection} Includes the overlap of weights and picks.`,
      value: picks,
      note: leader && leaderPicks > 0 ? `Led by ${bucketLabel(leader.key)}, ${fmtChangeBp(bps(leaderPicks))}` : `Includes ${fmtChangeBp(bps(r.effects.interaction))} of overlap`,
    },
    { label: "Total gap", tip: `${fund ? EXPLAIN.benchmark : EXPLAIN.teamBenchmark} Brinson-Fachler, daily, Carino-linked.`, value: r.activeReturn ?? 0, note: "The two add up to the number above" },
  ]);
}

/** The legend under the chart: a swatch drawn like the line, and its name. */
export function LegendItem({ children, swatch }: { children: React.ReactNode; swatch: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}

// The team name keeps what the numbers leave and wraps rather than cutting off.
const TEAM_COLS = "grid-cols-[minmax(0,1fr)_90px_56px]";

/**
 * "By team": each team's share of the return in bp, drawn either side of zero, the Fund's total under them. Each team
 * links to its own Performance page, and its average weight and return sit under its name. Cash, fees and interest
 * close the list. A table for screen readers: the team name is the row header and its link stretches over the row.
 */
export function TeamBars({ rows, teams, cashContribution, cashWeight, portfolioReturn, query }: { rows: TeamRow[]; teams: TeamLookup; cashContribution: number; cashWeight?: number; portfolioReturn: number; query: string }) {
  const showCash = Math.abs(cashContribution) > 1e-9 || cashWeight !== undefined;
  const max = Math.max(1e-9, ...rows.map((t) => Math.abs(t.contribution)), Math.abs(cashContribution));
  const cell = (v: number) => cn("text-right font-semibold", toneClass(signTone(bps(v), 1)) ?? "text-muted-foreground");
  return (
    <section aria-labelledby="perf-teams">
      <SectionHead
        id="perf-teams"
        title="By team"
        sub={
          <>
            Contribution to the Fund&apos;s <span className="font-medium text-ink-3">{fmtChangePct(pct(portfolioReturn))}</span>, in bp. This is each team&apos;s share of the return, not its gap to the benchmark.
          </>
        }
      />
      <div role="table" aria-label="Contribution by team" className="mt-2 text-body">
        <div role="row" className={cn("grid min-h-8 items-center gap-x-2.5 border-b text-caption text-muted-foreground", TEAM_COLS)}>
          <span role="columnheader"><Tip label="Team" side="bottom">{EXPLAIN.teams}</Tip></span>
          <span role="columnheader" className="sr-only">Contribution, drawn</span>
          <span role="columnheader" className="text-right"><Tip label="bp" side="bottom">{EXPLAIN.fundContribution}</Tip></span>
        </div>
        {rows.length === 0 && (
          <div role="row">
            <div role="cell" aria-colspan={3} className="py-3 text-muted-foreground">No team holdings in this period.</div>
          </div>
        )}
        {rows.map((t) => {
          const team = t.teamId ? teams.get(t.teamId) : undefined;
          return (
            <div key={t.teamId ?? "none"} role="row" className={cn("relative grid min-h-11 items-center gap-x-2.5 border-b border-row py-1 transition-colors", TEAM_COLS, team && "hover:bg-band has-[a:focus-visible]:bg-band")}>
              <span role="rowheader" className="min-w-0 leading-4">
                {team ? (
                  <RowLink cover="stretch" href={`/t/${team.slug}/performance${query}`} className="focus-visible:after:ring-0">
                    {team.name}
                  </RowLink>
                ) : (
                  "No team"
                )}
                <span className="block text-caption text-muted-foreground">
                  {fmtPct(pct(t.avgWeight), 1)} of the Fund, {fmtChangePct(pct(t.ret))}
                </span>
              </span>
              <span role="cell"><CenterBar value={t.contribution} max={max} /></span>
              <span role="cell" className={cell(t.contribution)}>{bp1(t.contribution)}</span>
            </div>
          );
        })}
        {showCash && (
          <div role="row" className={cn("grid min-h-11 items-center gap-x-2.5 border-b border-row py-1", TEAM_COLS)}>
            <span role="rowheader" className="min-w-0 leading-4">
              Cash, fees and interest
              {cashWeight !== undefined && <span className="block text-caption text-muted-foreground">{fmtPct(pct(cashWeight), 1)} average weight</span>}
            </span>
            <span role="cell"><CenterBar value={cashContribution} max={max} /></span>
            <span role="cell" className={cell(cashContribution)}>{bp1(cashContribution)}</span>
          </div>
        )}
        <div role="row" className={cn("grid min-h-9 items-center gap-x-2.5 font-semibold", TEAM_COLS)}>
          <span role="rowheader">Fund</span>
          <span role="cell" />
          <span role="cell" className={cell(portfolioReturn)}>{bp1(portfolioReturn)}</span>
        </div>
      </div>
    </section>
  );
}

/** Holdings ranked by contribution: top and bottom five side by side, or every holding as a table (`?all=1`). */
export function HoldingsSection({
  holdings,
  teams,
  basePath,
  queryString,
  showAll,
  showTeam = true,
  toggle = true,
}: {
  holdings: HoldingRow[];
  teams: TeamLookup;
  basePath: string;
  queryString: string;
  showAll: boolean;
  showTeam?: boolean;
  /** Offer the "Top & bottom 5 · All" switch (`?all=1`). */
  toggle?: boolean;
}) {
  const top = holdings.slice(0, 5);
  const bottom = holdings.slice(-5).reverse().filter((h) => !top.includes(h));
  return (
    <section aria-labelledby="perf-holdings" className="mt-8">
      <SectionHead
        id="perf-holdings"
        title={<Tip label="Holdings by contribution">{EXPLAIN.contributors}</Tip>}
        sub={`${holdings.length} ${holdings.length === 1 ? "holding" : "holdings"}, contribution in bp of the return`}
        aside={
          toggle && (
            <Segmented
              label="Holdings view"
              segments={[
                { key: "tb", label: "Top & bottom 5", href: `${basePath}${queryString}`, active: !showAll },
                { key: "all", label: `All ${holdings.length}`, href: `${basePath}${queryString}&all=1`, active: showAll },
              ]}
            />
          )
        }
      />
      {holdings.length === 0 ? (
        <p className="mt-3 text-body text-muted-foreground">No holdings in this period.</p>
      ) : showAll ? (
        <div className="mt-2">
          <ContributorsTable rows={holdings} teams={teams} showTeam={showTeam} />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-x-14">
          <HoldingsColumn rows={top} teams={teams} label="Helped most" caption={showTeam ? "Helped most, team and average weight" : "Helped most, average weight"} />
          <HoldingsColumn rows={bottom} teams={teams} label="Hurt most" caption={showTeam ? "Hurt most, team and average weight" : "Hurt most, average weight"} />
        </div>
      )}
    </section>
  );
}

/** "By sector effect": total effect per sector as bars either side of zero, for a team (which has no team list beside it). */
export function SectorEffectsSection({ data, empty }: { data: SectorEffectPoint[] | null; empty: React.ReactNode }) {
  return (
    <section aria-labelledby="perf-effects">
      <SectionHead id="perf-effects" title={<Tip label="Total effect by sector">{EXPLAIN.effectsChart}</Tip>} sub="In bp, most helpful first" />
      <div className="mt-3">{data ? <SectorEffectsList data={data} /> : <p className="text-body text-muted-foreground">{empty}</p>}</div>
    </section>
  );
}

export { HowNote };
