import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, Segmented } from "@/components/app/panel";
import type { HoldingRow, TeamRow } from "@/lib/attribution/attribution";
import type { PeriodKey } from "@/lib/attribution/periods";
import { cn } from "@/lib/utils";
import { ContributorsTable, type TeamLookup } from "./contributors-table";
import { CompactCumulativeChart, CumulativeDetails, type CumulativeChartPoint } from "./cumulative-active-chart";
import { DataNoticesButton, type QualityNotice } from "./data-quality-notice";
import { EXPLAIN } from "./explainers";
import { fmtBpsShort, fmtSigned, fmtWeight } from "./format";
import { HoldingsColumn } from "./holdings-columns";
import { Tip } from "./info-tip";
import { INTERACTION_CLASS } from "./interaction-toggle";
import { PeriodSelector } from "./period-selector";
import { SectorEffectsList, type SectorEffectPoint } from "./sector-effects-list";
import { RowLink } from "@/components/app/row-link";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sep 17", with the year only when it isn't the same as `other`'s. */
function shortDate(iso: string, other: string) {
  const [y, m, d] = iso.split("-");
  return `${MONTH[Number(m) - 1]} ${Number(d)}${y === other.slice(0, 4) ? "" : `, ${y}`}`;
}

export function rangeText(start: string, end: string, days: number) {
  return `${shortDate(start, end)} close through ${shortDate(end, start)} · ${days} trading ${days === 1 ? "day" : "days"}`;
}

export const LEDGER_HREF = "/attribution/ledger";

export function LedgerButton() {
  return (
    <Button nativeButton={false} variant="outline" render={<Link href={LEDGER_HREF} />}>
      <BookOpenText />
      Ledger
    </Button>
  );
}

/** Period control, range text, and on the right the data notices and (fund only) the ledger. */
export function AttributionToolbar({
  basePath,
  period,
  from,
  to,
  inception,
  latest,
  days,
  notices,
  ledger,
}: {
  basePath: string;
  period: { key: PeriodKey; start: string; end: string };
  from?: string;
  to?: string;
  inception: string;
  latest: string;
  days: number;
  notices: QualityNotice[];
  ledger?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2">
      <PeriodSelector basePath={basePath} active={period.key} from={from} to={to} inception={inception} latest={latest} />
      <span className="text-[13px] whitespace-nowrap text-muted-foreground">{rangeText(period.start, period.end, days)}</span>
      <span className="flex-1" />
      <DataNoticesButton notices={notices} />
      {ledger && <LedgerButton />}
    </div>
  );
}

/** Title row used by the two top panels (padded, no divider, as in the design). */
function PanelTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-7 shrink-0 items-center gap-3.5">
      {children}
      <span className="flex-1" />
      {aside && <div className="flex items-center gap-2.5 text-xs whitespace-nowrap text-muted-foreground">{aside}</div>}
    </div>
  );
}

function LegendDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[5px] text-xs text-ink-2">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

export function CumulativePanel({ data, portfolioLabel, benchmarkLabel, asOf, className }: { data: CumulativeChartPoint[]; portfolioLabel: string; benchmarkLabel: string; asOf: string; className?: string }) {
  return (
    <section className={cn("panel flex min-w-0 flex-col px-4 pt-3.5 pb-3", className)} aria-label="Cumulative return">
      <PanelTitle
        aside={
          <>
            <span className="font-mono text-[11px] uppercase">Prices as of {shortDate(asOf, asOf)} close</span>
            {data.length >= 2 && <CumulativeDetails data={data} portfolioLabel={portfolioLabel} benchmarkLabel={benchmarkLabel} explain={EXPLAIN.cumulativeChart} />}
          </>
        }
      >
        <h2 className="text-[14.5px] font-semibold whitespace-nowrap"><Tip label="Cumulative return">{EXPLAIN.cumulativeChart}</Tip></h2>
        <LegendDot color="var(--series-1)">{portfolioLabel}</LegendDot>
        <LegendDot color="var(--series-neutral)">{benchmarkLabel}</LegendDot>
      </PanelTitle>
      <div className="mt-2.5 flex min-h-0 flex-1 flex-col">
        <CompactCumulativeChart data={data} portfolioLabel={portfolioLabel} benchmarkLabel={benchmarkLabel} />
      </div>
    </section>
  );
}

export type EffectBar = { label: string; value: number; explain: string; interaction?: boolean };

/**
 * "Where it came from": each effect as a horizontal bar from a zero axis at 30% of the track, in bp, the total in
 * ink, then a one-line explanation. Bars share one scale so their lengths compare.
 */
export function EffectsPanel({ items, total, aside, note, empty, className }: { items: EffectBar[]; total: EffectBar | null; aside: React.ReactNode; note?: React.ReactNode; empty?: React.ReactNode; className?: string }) {
  const all = total ? [...items, total] : items;
  const bps = all.map((e) => e.value * 10_000);
  const maxPos = Math.max(0, ...bps);
  const maxNeg = Math.max(0, ...bps.map((v) => -v));
  // % of the track per bp: the biggest gain reaches ~57% of the track, the biggest loss at most the 27% left of zero.
  const unit = Math.min(maxPos > 0 ? 57 / maxPos : Infinity, maxNeg > 0 ? 27 / maxNeg : Infinity);
  const scale = Number.isFinite(unit) ? unit : 0;

  return (
    <section className={cn("panel flex min-w-0 flex-col px-4 pt-3.5 pb-3.5", className)} aria-label="Where it came from">
      <PanelTitle aside={aside}>
        <h2 className="text-[14.5px] font-semibold whitespace-nowrap">Where it came from</h2>
      </PanelTitle>
      {total === null ? (
        <div className="flex flex-1 items-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <>
          <div className="mt-3.5 mb-3 flex flex-1 flex-col gap-3.5">
            {all.map((e, i) => {
              const isTotal = total !== null && i === all.length - 1;
              const v = e.value * 10_000;
              const shown = Math.round(v);
              const width = Math.max(Math.abs(v) * scale, shown === 0 ? 0 : 0.8);
              return (
                <div key={e.label} className={cn("grid grid-cols-[92px_minmax(0,1fr)_48px] items-center gap-2.5 text-[13.5px]", e.interaction && INTERACTION_CLASS)}>
                  <span className={cn("truncate", isTotal && "font-semibold")}><Tip label={e.label}>{e.explain}</Tip></span>
                  <div className="relative h-[18px] rounded-[6px] bg-muted" aria-hidden>
                    <span className="absolute -top-[3px] -bottom-[3px] left-[30%] w-px bg-muted-foreground/45" />
                    <span
                      className={cn("absolute top-[3px] bottom-[3px] rounded-[4px]", isTotal ? "bg-primary" : v < 0 ? "bg-down/75" : "bg-up/75")}
                      style={{ left: v < 0 ? `${30 - width}%` : "30%", width: `${width}%` }}
                    />
                  </div>
                  <span className={cn("text-right font-mono text-[13px]", isTotal ? "font-semibold text-foreground" : shown > 0 ? "text-up" : shown < 0 ? "text-down" : "text-muted-foreground")}>
                    {fmtBpsShort(e.value)}
                  </span>
                </div>
              );
            })}
          </div>
          {note && <p className="text-[12.5px] leading-normal text-ink-2">{note}</p>}
        </>
      )}
    </section>
  );
}

const TEAM_COLS = "grid-cols-[minmax(0,1fr)_56px_70px_88px]";

/** Teams ranked by contribution to the Fund, each linking to that team's attribution; cash in the footer. */
export function TeamsPanel({ rows, teams, cashContribution, cashWeight, query, className }: { rows: TeamRow[]; teams: TeamLookup; cashContribution: number; cashWeight?: number; query: string; className?: string }) {
  const num = "text-right font-mono text-[12.5px]";
  const tone = (v: number, scale: number) => (Math.round(v * scale) > 0 ? "text-up" : Math.round(v * scale) < 0 ? "text-down" : "text-muted-foreground");
  const showCash = Math.abs(cashContribution) > 1e-9 || cashWeight !== undefined;
  return (
    <section className={cn("panel flex min-w-0 flex-col overflow-hidden", className)} aria-label="Teams">
      <div className={cn("grid h-9 shrink-0 items-center gap-2.5 border-b px-4 text-xs text-muted-foreground", TEAM_COLS)}>
        <span><Tip label="Team" side="bottom">{EXPLAIN.teams}</Tip></span>
        <span className="text-right"><Tip label="Avg wt" side="bottom">{EXPLAIN.teamWeight}</Tip></span>
        <span className="text-right"><Tip label="Return" side="bottom">{EXPLAIN.teamReturn}</Tip></span>
        <span className="text-right"><Tip label="To the Fund" side="bottom">{EXPLAIN.fundContribution}</Tip></span>
      </div>
      {rows.length === 0 && <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">No team holdings in this period.</div>}
      {rows.map((t) => {
        const team = t.teamId ? teams.get(t.teamId) : undefined;
        const cells = (
          <>
            <span className="truncate">{team?.name ?? "No team"}</span>
            <span className={cn(num, "text-muted-foreground")}>{fmtWeight(t.avgWeight)}</span>
            <span className={cn(num, tone(t.ret, 10_000))}>{fmtSigned(t.ret)}</span>
            <span className={cn(num, "font-semibold", tone(t.contribution, 10_000))}>{fmtBpsShort(t.contribution)} bp</span>
          </>
        );
        const cls = cn("grid max-h-16 min-h-10 flex-1 items-center gap-2.5 border-b border-row px-4 text-[13.5px]", TEAM_COLS);
        return team ? (
          <RowLink key={t.teamId} href={`/t/${team.slug}/attribution${query}`} className={cn(cls, "transition-colors hover:bg-band focus-visible:bg-band focus-visible:outline-none")}>
            {cells}
          </RowLink>
        ) : (
          <div key="none" className={cls}>{cells}</div>
        );
      })}
      {showCash && (
        <div className="mt-auto flex min-h-10 shrink-0 items-center bg-band-2 px-4 text-[12.5px] text-muted-foreground">
          <span className="truncate">
            Cash, fees and interest{cashWeight !== undefined && ` · ${fmtWeight(cashWeight)} average weight`} ·{" "}
            <span className={cn("font-mono", tone(cashContribution, 10_000))}>{fmtBpsShort(cashContribution)} bp</span>
          </span>
        </div>
      )}
    </section>
  );
}

/** Holdings ranked by contribution: top and bottom five side by side, or every holding as a table (`?all=1`). */
export function HoldingsPanel({
  holdings,
  teams,
  basePath,
  queryString,
  showAll,
  showTeam = true,
  toggle = true,
  className,
}: {
  holdings: HoldingRow[];
  teams: TeamLookup;
  basePath: string;
  queryString: string;
  showAll: boolean;
  showTeam?: boolean;
  /** Offer the "Top & bottom 5 · All" switch (`?all=1`). */
  toggle?: boolean;
  className?: string;
}) {
  const top = holdings.slice(0, 5);
  const bottom = holdings.slice(-5).reverse().filter((h) => !top.includes(h));
  return (
    <Panel className={className} aria-label="Holdings by contribution">
      <PanelHeader
        title={<Tip label="Holdings by contribution">{EXPLAIN.contributors}</Tip>}
        count={holdings.length}
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
        <div className="p-6 text-center text-sm text-muted-foreground">No holdings in this period.</div>
      ) : showAll ? (
        <ContributorsTable rows={holdings} teams={teams} showTeam={showTeam} />
      ) : (
        <div className="grid gap-6 px-4 py-3 sm:grid-cols-2">
          <HoldingsColumn rows={top} teams={teams} caption={showTeam ? "Helped most · team, avg weight" : "Helped most · avg weight"} />
          <HoldingsColumn rows={bottom} teams={teams} caption={showTeam ? "Hurt most · team, avg weight" : "Hurt most · avg weight"} />
        </div>
      )}
    </Panel>
  );
}

export function SectorEffectsPanel({ data, empty, className }: { data: SectorEffectPoint[] | null; empty: React.ReactNode; className?: string }) {
  return (
    <Panel className={className} aria-label="Total effect by sector">
      <PanelHeader title={<Tip label="Total effect by sector">{EXPLAIN.effectsChart}</Tip>} aside="bp, most helpful first" />
      <div className="px-4 py-3">{data ? <SectorEffectsList data={data} /> : <div className="text-sm text-muted-foreground">{empty}</div>}</div>
    </Panel>
  );
}

export function MethodPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Panel className={className} aria-label="How this is calculated">
      <PanelHeader title="How this is calculated" />
      <div className="px-4 py-3 text-[13px] leading-relaxed text-ink-2">{children}</div>
    </Panel>
  );
}
