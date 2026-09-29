import { ShareBar, SectionHead } from "@/components/app/portfolio/parts";
import { ReadAs } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";
import type { RiskReport } from "@/lib/risk/model";
import { cn } from "@/lib/utils";
import { Tip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rnum, rpct } from "./format";
import type { TeamNames } from "./holdings-risk-table";

const ROWS = 10;
/** A holding "adds more" than its size suggests when its share of risk is this many times its weight. */
export const ADDS_MORE = 1.5;

const COLS = "grid grid-cols-[minmax(0,1fr)_64px_84px_112px_minmax(0,120px)] gap-x-3.5 xl:grid-cols-[minmax(0,1fr)_70px_96px_140px_150px]";

/** Backtesting with `ticker` trimmed by `pp` percentage points into cash, the Risk page's quick-trade link. */
export const trimHref = (ticker: string, pp: number) => `/backtesting?trade=${encodeURIComponent(`${ticker}:-${pp}:cash`)}`;

/**
 * "Where the risk comes from": the ten holdings with the largest share of the portfolio's volatility, each with its
 * weight beside its share of risk, and "Adds more" where a holding takes at least 1.5× the risk its weight suggests.
 * The full table, with a trim what-if on every holding, is below.
 */
export function RiskSources({ report: r, teams }: { report: RiskReport; teams: TeamNames }) {
  const rows = [...r.holdings].sort((a, b) => b.riskShare - a.riskShare).slice(0, ROWS);
  const covered = rows.reduce((s, h) => s + h.riskShare, 0);
  const max = Math.max(...rows.flatMap((h) => [Math.abs(h.riskShare), h.weight]), 0);
  return (
    <section data-tour="risk-sources" aria-labelledby="risk-sources">
      <SectionHead
        id="risk-sources"
        title="Where the risk comes from"
        sub={
          <>
            Top {rows.length} of the {r.holdings.length} holdings measured, {rpct(covered, 0)} of the {r.scope === "fund" ? "fund" : "team"}&apos;s volatility. <Tip label="Adds more">{RISK_EXPLAIN.addsMore}</Tip> when a holding&apos;s share of risk is {rnum(ADDS_MORE, 1)}× its weight or more
          </>
        }
      />
      <div role="table" aria-label="Holdings by share of risk" className="mt-2 text-body">
        <div role="row" className={cn(COLS, "min-h-[34px] items-center border-b text-caption text-muted-foreground")}>
          <span role="columnheader">Holding</span>
          <span role="columnheader" className="text-right">Weight</span>
          <span role="columnheader" className="text-right"><Tip label="Share of risk" side="bottom">{RISK_EXPLAIN.riskShare}</Tip></span>
          {/* The bars draw the weight and the share beside them; they stay out of the table screen readers hear. */}
          <span aria-hidden />
          <span role="columnheader" className="text-right"><Tip label={<ReadAs text="Share of risk divided by weight">Risk ÷ weight</ReadAs>} side="bottom">{RISK_EXPLAIN.riskPerWeight}</Tip></span>
        </div>
        {rows.map((h) => {
          const team = h.teamId ? teams.get(h.teamId) : undefined;
          const ratio = h.weight > 0 ? h.riskShare / h.weight : null;
          const more = ratio !== null && ratio >= ADDS_MORE;
          return (
            <div key={h.ticker} role="row" className={cn(COLS, "relative min-h-9 items-center border-b border-row")}>
              <span role="rowheader" className="min-w-0 truncate">
                {team ? (
                  <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(h.ticker)}`} className="font-semibold hover:underline">{h.ticker}</RowLink>
                ) : (
                  <b className="font-semibold">{h.ticker}</b>
                )}{" "}
                <span className="text-muted-foreground">{team?.name ?? ""}</span>
              </span>
              <span role="cell" className="text-right">{rpct(h.weight, 2)}</span>
              <span role="cell" className="text-right font-semibold">{rpct(h.riskShare)}</span>
              <span aria-hidden className="flex flex-col gap-[3px]">
                <span className="h-1 bg-bench-bar" style={{ width: `${max > 0 ? (h.weight / max) * 100 : 0}%` }} />
                <span className="h-1 bg-series-1" style={{ width: `${max > 0 ? (Math.abs(h.riskShare) / max) * 100 : 0}%` }} />
              </span>
              <span role="cell" className="text-right">
                <span className={more ? "font-semibold" : undefined}>{ratio === null ? "—" : `${rnum(ratio)}×`}</span>
                {more && <span className="ml-1.5 text-caption font-semibold text-caution-foreground">Adds more</span>}
              </span>
            </div>
          );
        })}
      </div>
      {!rows.length && <p className="mt-3 text-body text-muted-foreground">No modeled holdings.</p>}
      <div className="mt-2 flex gap-4 text-caption text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-1 w-3.5 bg-bench-bar" aria-hidden />Weight</span>
        <span className="flex items-center gap-1.5"><span className="h-1 w-3.5 bg-series-1" aria-hidden />Share of risk</span>
      </div>
    </section>
  );
}

/** "By team": each team's share of the portfolio's volatility, from the holdings' shares of risk. */
export function RiskByTeam({ report: r, teams }: { report: RiskReport; teams: TeamNames }) {
  const byTeam = new Map<string | null, number>();
  for (const h of r.holdings) byTeam.set(h.teamId, (byTeam.get(h.teamId) ?? 0) + h.riskShare);
  const rows = [...byTeam].map(([id, share]) => ({ id, share, team: id ? teams.get(id) : undefined })).sort((a, b) => b.share - a.share);
  const max = Math.max(...rows.map((x) => Math.abs(x.share)), 0);
  const q = `?lookback=${r.lookback}`;
  return (
    <section aria-labelledby="risk-by-team">
      <SectionHead id="risk-by-team" title="By team" sub={`Share of the ${r.scope === "fund" ? "fund" : "team"}'s volatility`} />
      <div role="table" aria-label="Share of volatility by team" className="mt-2 text-body">
        <div role="row" className="grid min-h-[34px] grid-cols-[minmax(0,1fr)_90px_44px] items-center gap-x-2.5 border-b text-caption text-muted-foreground">
          <span role="columnheader">Team</span>
          <span aria-hidden />
          <span role="columnheader" className="text-right">Share</span>
        </div>
        {rows.map((x) => (
          <div key={x.id ?? "none"} role="row" className={cn("relative grid min-h-9 grid-cols-[minmax(0,1fr)_90px_44px] items-center gap-x-2.5 border-b border-row", x.team && "hover:bg-band has-[a:focus-visible]:bg-band")}>
            <span role="rowheader" className="min-w-0 truncate">
              {x.team ? (
                <RowLink cover="stretch" href={`/t/${x.team.slug}/risk${q}`} className="focus-visible:after:ring-0">
                  {x.team.name}
                </RowLink>
              ) : (
                "No team"
              )}
            </span>
            <span role="cell"><ShareBar value={x.share} max={max} /></span>
            <span role="cell" className="text-right font-semibold">{rpct(x.share, 0)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
