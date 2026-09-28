import Link from "next/link";
import { Panel, PanelHeader } from "@/components/app/panel";
import { activeRiskBreakdown } from "@/lib/risk/active";
import type { RiskReport } from "@/lib/risk/model";
import { cn } from "@/lib/utils";
import { InfoTip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rpct } from "./format";
import type { TeamNames } from "./holdings-risk-table";
import { RowLink } from "@/components/app/row-link";

const ROWS = 10;
/** The largest risk sources get a one-click what-if. */
const TRIM_ROWS = 3;
const TRIM_PP = 1;

const COLS = "grid grid-cols-[64px_64px_minmax(0,1fr)_56px_104px] items-center gap-3 px-4";

/** Backtesting with `ticker` trimmed by `pp` percentage points into cash, the Risk page's quick-trade link. */
export const trimHref = (ticker: string, pp: number) => `/backtesting?trade=${encodeURIComponent(`${ticker}:-${pp}:cash`)}`;

/**
 * "Where the risk comes from": the holdings with the largest share of tracking error (or of total risk when there is
 * no benchmark), each as a bar, with a trim what-if on the top three. The full tables sit below the fold.
 */
export function RiskSources({ report: r, teams, className }: { report: RiskReport; teams: TeamNames; className?: string }) {
  const active = activeRiskBreakdown(r);
  const rows = active
    ? active.holdings.slice(0, ROWS).map((h) => ({ ticker: h.ticker, teamId: h.teamId, weight: h.weight, share: h.share }))
    : [...r.holdings].sort((a, b) => b.riskShare - a.riskShare).slice(0, ROWS).map((h) => ({ ticker: h.ticker, teamId: h.teamId, weight: h.weight, share: h.riskShare }));
  const max = Math.max(...rows.map((h) => Math.abs(h.share)), 0);
  return (
    <Panel data-tour="risk-sources" variant="plain" className={className}>
      <PanelHeader
        title="Where the risk comes from"
        aside={
          <>
            {active ? "share of tracking error" : "share of total risk"}
            <InfoTip label={active ? "share of tracking error" : "share of total risk"}>{active ? RISK_EXPLAIN.holdingActiveRiskShare : RISK_EXPLAIN.riskShare}</InfoTip>
          </>
        }
      />
      <div className={cn(COLS, "h-8 shrink-0 text-xs text-muted-foreground")}>
        <span>Holding</span>
        <span className="text-right">Weight</span>
        <span />
        <span className="text-right">Share</span>
        <span className="text-right">What if</span>
      </div>
      {rows.map((h, i) => {
        const team = h.teamId ? teams.get(h.teamId) : undefined;
        const width = max > 0 ? Math.min(100, (Math.abs(h.share) / max) * 100) : 0;
        return (
          <div key={h.ticker} className={cn(COLS, "relative h-10 border-t border-row text-[13.5px]")}>
            {team ? (
              <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(h.ticker)}`} className="truncate font-mono text-[13px] font-semibold hover:underline">{h.ticker}</RowLink>
            ) : (
              <span className="truncate font-mono text-[13px] font-semibold">{h.ticker}</span>
            )}
            <span className="text-right font-mono text-[12.5px] text-muted-foreground">{rpct(h.weight)}</span>
            <div className="h-2.5 rounded-[3px] bg-muted" aria-hidden>
              <div className={cn("h-2.5 rounded-[3px]", h.share < 0 ? "bg-down" : "bg-foreground")} style={{ width: `${width}%` }} />
            </div>
            <span className={cn("text-right font-mono text-[12.5px] font-semibold", h.share < 0 && "text-down")}>{Math.round(Math.abs(h.share) * 100) === 0 ? rpct(h.share, 1) : rpct(h.share, 0)}</span>
            <span className="text-right text-[12.5px] whitespace-nowrap">
              {i < TRIM_ROWS && h.share > 0 && (
                <Link
                  href={trimHref(h.ticker, TRIM_PP)}
                  title={`Opens Backtesting with ${h.ticker} trimmed by ${TRIM_PP} percentage point into cash, so you can see how performance and risk would change.`}
                  className="font-medium text-ink-2 hover:text-foreground hover:underline"
                >
                  Trim {TRIM_PP} pp →
                </Link>
              )}
            </span>
          </div>
        );
      })}
      {!rows.length && <p className="px-4 py-1 text-sm text-muted-foreground">No modeled holdings.</p>}
    </Panel>
  );
}
