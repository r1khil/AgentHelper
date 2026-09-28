import { ScopedLink } from "@/components/app/shell/scope-context";
import { Panel, PanelHeader } from "@/components/app/panel";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import type { Exposure } from "@/lib/risk/exposure";
import { FACTORS, formatBeta, isFactorReport } from "@/lib/risk/factors";
import type { LookthroughState } from "@/lib/risk/lookthrough-report";
import type { RiskReport } from "@/lib/risk/model";
import { cn } from "@/lib/utils";
import { InfoTip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "../risk/explainers";
import { rpct } from "../risk/format";
import type { TeamNames } from "../risk/holdings-risk-table";

/** Active weight in percentage points without the unit, e.g. "+3.4", as in the sector and bets columns. */
const activePp = (v: number | null) => (v === null ? "—" : `${v * 100 > 0.05 ? "+" : ""}${(v * 100).toFixed(1)}`);
const tone = (v: number | null) => (v === null || Math.abs(v) < 5e-4 ? "text-muted-foreground" : v > 0 ? "text-up" : "text-down");

/** Paired bars per sector: the portfolio (ink, 8px) over the benchmark (6px), with the active weight on the right. */
export function SectorWeightsPanel({ x, benchShort, className }: { x: Exposure; benchShort: string; className?: string }) {
  const rows = x.sectors.filter((s) => s.key !== "cash");
  const max = Math.max(...rows.flatMap((s) => [s.weight, s.benchWeight ?? 0]), 0);
  const w = (v: number | null) => `${max > 0 && v !== null ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%`;
  const COLS = "grid grid-cols-[170px_minmax(0,1fr)_64px] items-center gap-3 px-4";
  return (
    <Panel id="sectors" className={cn("scroll-mt-4", className)}>
      <PanelHeader
        title="Sector weights vs benchmark"
        aside={
          <span className="flex items-center gap-3 text-xs text-ink-2">
            <span className="flex items-center gap-[5px]"><span className="h-1.5 w-2.5 rounded-[2px] bg-foreground" />{x.throughEtfs ? "Fund, through ETFs" : "Fund"}</span>
            {x.hasBenchmark && <span className="flex items-center gap-[5px]"><span className="h-1.5 w-2.5 rounded-[2px] bg-bench-bar" />{benchShort}</span>}
          </span>
        }
      />
      <div className={cn(COLS, "h-[30px] shrink-0 text-xs text-muted-foreground")}>
        <span>Sector</span>
        <span />
        <span className="flex items-center justify-end gap-1">
          Active
          <InfoTip label="active weight">{RISK_EXPLAIN.activeWeight}</InfoTip>
        </span>
      </div>
      {rows.map((s) => (
        <div
          key={s.key}
          className={cn(COLS, "min-h-9 border-t border-row text-[13.5px]")}
          title={`${s.label}: ${rpct(s.weight)}${s.benchWeight !== null ? ` vs ${rpct(s.benchWeight)} in ${benchShort}` : ""}${s.tickers.length ? ` · ${s.tickers.join(", ")}` : ""}`}
        >
          <span className="truncate">{s.label}</span>
          <div className="flex flex-col gap-[3px]" aria-hidden>
            <div className="h-2 rounded-[2px] bg-foreground" style={{ width: w(s.weight) }} />
            {s.benchWeight !== null && <div className="h-1.5 rounded-[2px] bg-bench-bar" style={{ width: w(s.benchWeight) }} />}
          </div>
          <span className={cn("text-right font-mono text-[12.5px] font-semibold", tone(s.active))}>{activePp(s.active)}</span>
        </div>
      ))}
    </Panel>
  );
}

/**
 * The largest company-level bets against the benchmark's own holdings (through the ETFs), or by sector when the
 * benchmark's holdings aren't stored.
 */
export function ActiveBetsPanel({ report: r, x, lookthrough, teams, benchShort, className }: { report: RiskReport; x: Exposure; lookthrough: LookthroughState | null; teams: TeamNames; benchShort: string; className?: string }) {
  const lt = lookthrough?.state === "ok" ? lookthrough : null;
  const COLS = "grid grid-cols-[64px_minmax(0,1fr)_60px_60px_56px] items-center gap-2.5 px-4";
  const header = (aside: React.ReactNode) => (
    <PanelHeader
      title="Largest active bets"
      aside={
        <>
          {aside}
          <InfoTip label="largest active bets">{lt?.report.active ? RISK_EXPLAIN.stockLargestBet : RISK_EXPLAIN.largestActiveBet}</InfoTip>
        </>
      }
    />
  );

  if (lt?.report.active) {
    const held = new Map(r.holdings.map((h) => [h.ticker, h]));
    const names = new Map(lt.report.names.map((n) => [n.key, n]));
    const rows = lt.report.active.rows.slice(0, 6);
    return (
      <Panel id="stock-active" className={cn("scroll-mt-4", className)}>
        {header(`vs ${lt.benchmarkLabel === "SPY" ? "S&P 500" : (lt.benchmarkLabel ?? benchShort)} weight`)}
        {rows.map((b) => {
          const h = held.get(b.key);
          const team = h?.teamId ? teams.get(h.teamId) : undefined;
          const n = names.get(b.key);
          const note = team?.name ?? (n?.sector ? SECTOR_LABELS[n.sector] : b.name);
          return (
            <div key={b.key} className={cn(COLS, "min-h-10 border-b border-row text-[13.5px] last:border-b-0")} title={`${b.key} · ${b.name}`}>
              {team ? (
                <ScopedLink owner={team.slug} path={`/h/${encodeURIComponent(b.key)}`} className="truncate font-mono text-[13px] font-semibold hover:underline">{b.key}</ScopedLink>
              ) : (
                <span className="truncate font-mono text-[13px] font-semibold">{b.key}</span>
              )}
              <span className="truncate text-ink-2">{note}</span>
              <span className="text-right font-mono text-[12.5px]">{rpct(b.fund)}</span>
              <span className="text-right font-mono text-[12.5px] text-muted-foreground">{rpct(b.benchmark)}</span>
              <span className={cn("text-right font-mono text-[12.5px] font-semibold", tone(b.active))}>{activePp(b.active)}</span>
            </div>
          );
        })}
      </Panel>
    );
  }

  // No benchmark holdings: the same list by sector.
  const bets = x.sectors.filter((s) => s.key !== "cash" && s.active !== null).sort((a, b) => Math.abs(b.active!) - Math.abs(a.active!)).slice(0, 6);
  return (
    <Panel id="stock-active" className={cn("scroll-mt-4", className)}>
      {header(`by sector · vs ${benchShort} weight`)}
      {bets.map((s) => (
        <div key={s.key} className={cn(COLS, "min-h-10 border-b border-row text-[13.5px] last:border-b-0")} title={s.tickers.join(", ")}>
          <span className="truncate font-mono text-[13px] font-semibold">{s.etf ?? "—"}</span>
          <span className="truncate text-ink-2">{s.label}</span>
          <span className="text-right font-mono text-[12.5px]">{rpct(s.weight)}</span>
          <span className="text-right font-mono text-[12.5px] text-muted-foreground">{rpct(s.benchWeight)}</span>
          <span className={cn("text-right font-mono text-[12.5px] font-semibold", tone(s.active))}>{activePp(s.active)}</span>
        </div>
      ))}
      {!bets.length && <div className="px-4 py-3 text-[13px] text-muted-foreground">Add S&amp;P 500 sector weights to compare against the benchmark.</div>}
      {lt && !lt.report.active && lt.benchmarkMissing && <div className="border-t border-row px-4 py-2 text-xs text-muted-foreground">{lt.benchmarkMissing} Company-level bets need them.</div>}
    </Panel>
  );
}

/** Active factor betas (or the portfolio's, without a benchmark) as diverging bars from a centre axis. */
export function FactorTiltsPanel({ report: r, className }: { report: RiskReport; className?: string }) {
  const f = r.factors;
  if (!isFactorReport(f)) {
    return (
      <Panel id="factors" variant="plain" className={cn("scroll-mt-4", className)}>
        <PanelHeader title="Factor tilts" />
        <div className="p-4 text-[13px] text-muted-foreground">{f.reason}</div>
      </Panel>
    );
  }
  const fit = f.active ?? f.fund;
  const rows = FACTORS.map((d) => ({ ...d, c: fit.betas[d.key] }));
  const max = Math.max(0.25, ...rows.map((x) => Math.abs(x.c.beta))) * 1.1;
  return (
    <Panel id="factors" variant="plain" className={cn("scroll-mt-4", className)}>
      <PanelHeader
        title="Factor tilts"
        aside={
          <>
            {f.active ? "vs sector benchmark" : r.scope === "fund" ? "Fund betas" : "team betas"}, {r.lookback.toUpperCase()}
            <InfoTip label="factor tilts">{f.active ? RISK_EXPLAIN.factorActiveRow : RISK_EXPLAIN.factorBeta} Faded: |t| below 2, no clear link.</InfoTip>
          </>
        }
      />
      {rows.map((x) => {
        const b = x.c.beta;
        const half = Number.isFinite(b) ? Math.min(50, (Math.abs(b) / max) * 50) : 0;
        return (
          <div
            key={x.key}
            className="grid h-9 shrink-0 grid-cols-[110px_minmax(0,1fr)_52px] items-center gap-3 border-b border-row px-4 text-[13.5px] last:border-b-0"
            title={`${x.definition} · β ${formatBeta(b, 3, { signed: true })}, t ${x.c.t.toFixed(1)}${x.c.significant ? "" : " (not statistically clear)"}`}
          >
            <span className="truncate">{x.label}</span>
            <div className="relative h-2.5 rounded-[3px] bg-muted" aria-hidden>
              <span className="absolute -top-[3px] -bottom-[3px] left-1/2 w-px bg-bench-bar" />
              <span
                className="absolute inset-y-0 rounded-[3px]"
                style={{ left: b < 0 ? `${50 - half}%` : "50%", width: `${half}%`, background: "color-mix(in oklch, var(--series-1) 80%, transparent)", opacity: x.c.significant ? 1 : 0.4 }}
              />
            </div>
            <span className={cn("text-right font-mono text-[12.5px]", !x.c.significant && "text-muted-foreground")}>{formatBeta(b, 2, { signed: true })}</span>
          </div>
        );
      })}
    </Panel>
  );
}
