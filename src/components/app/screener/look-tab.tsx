import { Suspense } from "react";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { titleCaseCompanyName } from "@/lib/company-name";
import { fmtChangePct, fmtDate, fmtNumber } from "@/lib/format";
import { METRIC_DEFS, type MetricKey } from "@/lib/screener/metrics";
import type { ScreenHit, TearSheet } from "@/db/schema";
import { EmptyState } from "@/components/app/empty-state";
import { FilterChip, FilterChips } from "@/components/app/panel";
import { RailCard, RailRow } from "@/components/app/rail-card";
import { RailCardFallback } from "@/components/app/holdings/holding-skeleton";
import { HoldingLogo } from "@/components/app/holding-logo";
import { RowLink } from "@/components/app/row-link";
import {
  TEAM_HITS,
  type loadLook,
  type ScreenerScope,
} from "@/app/(app)/screener/load";
import { screenerHref, type ScreenerQuery } from "@/app/(app)/screener/types";
import { fmtMetric } from "./metric-format";
import { companyHref, Lede, ScreenerFrame, StatusWord } from "./parts";

type Data = Awaited<ReturnType<typeof loadLook>>;

/** The columns a hit shows: cheapness first, then quality. The rest are on the company's page. */
const SHOWN: MetricKey[] = [
  "evEbit",
  "evEbitVsMedian",
  "fcfYield",
  "roic",
  "piotroski",
  "netDebtEbitda",
];
const SHORT: Partial<Record<MetricKey, string>> = {
  evEbitVsMedian: "vs own 5y",
  piotroski: "F-score",
  netDebtEbitda: "Net debt/EBITDA",
};
// Six metric columns (SHOWN); written out so Tailwind sees the class.
const COLS =
  "grid grid-cols-[minmax(150px,1.7fr)_repeat(5,64px)_104px_88px] items-center gap-3";

/**
 * Worth a look: this month's screen hits for the team in view (each team's top five across its sectors), ranked on
 * cheapness and quality computed from SEC filings, with their tear sheets. With the whole fund in view, one list per
 * team.
 */
export function LookTab({
  q,
  scope,
  data,
}: {
  q: ScreenerQuery;
  scope: ScreenerScope;
  data: Data;
}) {
  const { screen, running, hits, sheets, returns } = data;
  if (!screen) {
    return (
      <EmptyState
        title={running ? "The first screen is running" : "No screen yet"}
        hoot="sleepy"
      >
        {running
          ? "It reads SEC data for every NYSE and Nasdaq company above $3B, one concept at a time, and saves its place between runs. Hits show here when it finishes."
          : "The screen runs on the first Saturday of each month over every NYSE and Nasdaq company above $3B. Each team then sees its top five here, with a tear sheet on each."}
      </EmptyState>
    );
  }
  const groups = scope.team
    ? [{ id: scope.team.id, name: scope.team.name }]
    : scope.teams.map((t) => ({ id: t.id, name: t.name }));
  const coverage = Object.entries(screen.run.coverage ?? {});
  const leftOut = coverage
    .filter(([, v]) => v < 0.8)
    .map(([k]) => METRIC_DEFS.find((d) => d.key === k)?.label ?? k);
  const universe = screen.run.universeSize;
  const notScreened =
    typeof screen.run.params?.notScreened === "number"
      ? screen.run.params.notScreened
      : null;

  return (
    <ScreenerFrame
      rail={
        <>
          <RailCard
            id="look-run"
            title="This run"
            note="Latest annual figures from SEC filings, with each company's period end on its page. Banks, insurers, REITs, MLPs and SPACs are left out."
          >
            <RailRow label="Run">{fmtDate(screen.run.runDate)}</RailRow>
            {universe !== null && (
              <RailRow label="Companies screened">
                {fmtNumber(universe)}
              </RailRow>
            )}
            {notScreened !== null && (
              <RailRow
                label="ADRs, not screened yet"
                title="Most file 20-F under IFRS with annual data only; a later pass adds them"
              >
                {fmtNumber(notScreened)}
              </RailRow>
            )}
            <RailRow label="Each team sees">{`Top ${TEAM_HITS}`}</RailRow>
            {leftOut.length > 0 && (
              <RailRow
                label="Left out"
                title="Resolved for under 80% of the universe, so not ranked on"
              >
                <span className="truncate text-caution-foreground">
                  {leftOut.join(", ")}
                </span>
              </RailRow>
            )}
            {running && (
              <RailRow label="Next month's run">
                {<StatusWord tone="ink">Running now</StatusWord>}
              </RailRow>
            )}
          </RailCard>
          {returns && (
            <Suspense
              fallback={<RailCardFallback title="Paper portfolio" rows={3} />}
            >
              <PaperCard returns={returns} />
            </Suspense>
          )}
        </>
      }
    >
      <Lede>
        Ranked on cheapness and quality, computed from SEC filings. The model
        never touches these numbers, and nothing here is a price call: it is
        where to look first.
      </Lede>
      <div className="mt-4 flex items-center gap-3 border-b pb-3">
        <FilterChips label="Track">
          {(["all", "value", "garp"] as const).map((t) => (
            <FilterChip
              key={t}
              href={screenerHref(q, { track: t })}
              active={q.track === t}
              title={
                t === "garp"
                  ? "Growth at a reasonable price: ROIC above 12% and stable, ranked on historical EPS growth"
                  : undefined
              }
            >
              {t === "all" ? "Both tracks" : t === "value" ? "Value" : "GARP"}
            </FilterChip>
          ))}
        </FilterChips>
      </div>
      {groups.map((g) => {
        const rows = hits.filter((h) => h.teamId === g.id);
        return (
          <section
            key={g.id}
            aria-label={g.name}
            className="mt-6 first-of-type:mt-4"
          >
            {!scope.team && (
              <h2 className="mb-1 text-body font-semibold">{g.name}</h2>
            )}
            <HitTable rows={rows} sheets={sheets} />
          </section>
        );
      })}
    </ScreenerFrame>
  );
}

type Returns = Record<string, Record<string, number | null>> | null;

/** Every hit of the run held equally from the run date, against the S&P 500 (fractions). */
async function PaperCard({ returns }: { returns: Promise<Returns> }) {
  const paper = Object.values((await returns) ?? {});
  const avg = (k: string) => {
    const xs = paper
      .map((r) => r[k])
      .filter((x): x is number => typeof x === "number");
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  return (
    <RailCard
      id="look-paper"
      title="Paper portfolio"
      note="Every hit of this run held equally from the run date, against the S&P 500. It informs; it never decides."
    >
      <PaperRow label="3 months" mine={avg("r3m")} spx={avg("spx3m")} />
      <PaperRow label="6 months" mine={avg("r6m")} spx={avg("spx6m")} />
      <PaperRow label="12 months" mine={avg("r12m")} spx={avg("spx12m")} />
    </RailCard>
  );
}

function PaperRow({
  label,
  mine,
  spx,
}: {
  label: string;
  mine: number | null;
  spx: number | null;
}) {
  return (
    <RailRow label={label}>
      {mine === null ? (
        <span className="text-muted-foreground">Not yet</span>
      ) : (
        <span className="tabular-nums">
          <span className={mine >= 0 ? "text-up" : "text-down"}>
            {fmtChangePct(mine * 100, 1)}
          </span>
          {spx !== null && (
            <span className="text-muted-foreground">
              , S&amp;P {fmtChangePct(spx * 100, 1)}
            </span>
          )}
        </span>
      )}
    </RailRow>
  );
}

function sheetWord(s: TearSheet | undefined) {
  if (!s) return <StatusWord>Not written</StatusWord>;
  if (s.status === "held")
    return (
      <StatusWord tone="caution" title={s.heldReason ?? undefined}>
        Held back
      </StatusWord>
    );
  return <StatusWord tone="ink">Ready</StatusWord>;
}

function HitTable({
  rows,
  sheets,
}: {
  rows: ScreenHit[];
  sheets: Map<string, TearSheet>;
}) {
  const defs = SHOWN.map((k) => METRIC_DEFS.find((d) => d.key === k)!);
  if (!rows.length)
    return (
      <p className="border-b border-row py-3 text-body text-muted-foreground">
        No hits in this team&apos;s sectors this month on this track.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <div
        role="table"
        aria-label="Screen hits"
        className="min-w-[680px] text-body"
      >
        <div
          role="row"
          className={`${COLS} h-10 border-b text-caption text-muted-foreground`}
        >
          <span role="columnheader">Company</span>
          {defs.map((d) => (
            <span
              key={d.key}
              role="columnheader"
              title={d.help}
              className="truncate text-right"
            >
              {SHORT[d.key] ?? d.label}
            </span>
          ))}
          <span role="columnheader" className="text-right">
            Tear sheet
          </span>
        </div>
        {rows.map((h) => (
          <div
            key={h.id}
            role="row"
            className={`${COLS} relative min-h-12 border-b border-row py-1.5 transition-colors hover:bg-band`}
          >
            <span
              role="rowheader"
              className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)] items-center gap-x-2.5"
            >
              <HoldingLogo ticker={h.ticker} size={20} className="row-span-2" />
              <RowLink
                cover="stretch"
                href={companyHref(h.ticker)}
                aria-label={`${h.ticker}, ${titleCaseCompanyName(h.companyName)}`}
                className="flex min-w-0 items-baseline gap-2"
              >
                <span className="font-semibold">{h.ticker}</span>
                <span className="truncate text-caption text-muted-foreground">
                  {titleCaseCompanyName(h.companyName)}
                </span>
              </RowLink>
              <span className="truncate text-caption text-muted-foreground">
                {[
                  h.track === "garp" ? "GARP" : "Value",
                  h.sector ? SECTOR_LABELS[h.sector] : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </span>
            {defs.map((d) => (
              <span key={d.key} role="cell" className="text-right tabular-nums">
                {fmtMetric(d, h.metrics[d.key] ?? null)}
              </span>
            ))}
            <span role="cell" className="text-right">
              {sheetWord(sheets.get(h.ticker))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
