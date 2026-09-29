"use client";

import { useState } from "react";
import { Segmented } from "@/components/app/panel";
import { CenterBar, SectionHead, Signed } from "@/components/app/portfolio/parts";
import type { BacktestResult, Metrics } from "@/lib/backtesting/engine";
import type { ScenarioMetrics, ScenarioRisk } from "@/lib/risk/compare";
import { fmtAccounting, fmtBp, fmtChangeBp, fmtDay, fmtMonth, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tip } from "../../attribution/info-tip";
import { RISK_EXPLAIN } from "../../risk/explainers";
import { bp, pct, shown, type Period } from "../workspace";

const TRADING_DAYS = 252;
const stdev = (xs: number[]) => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Annualized tracking error of a replay against the benchmark: the standard deviation of its daily gap, times √252. */
export function trackingError(result: BacktestResult, key: "originalActive" | "modifiedActive"): number | null {
  const sd = stdev(result.days.map((d) => d[key]));
  return sd === null ? null : sd * Math.sqrt(TRADING_DAYS);
}

/** "+70 bp higher", "130 bp deeper", "no change": the size of a move and which way it went, in words. */
function moved(d: number | null, up: string, down: string) {
  if (d === null || !Number.isFinite(d)) return "—";
  const text = fmtBp(Math.abs(d) * 10_000);
  if (!/[1-9]/.test(text)) return "no change";
  return `${d > 0 ? `+${text}` : text} ${d > 0 ? up : down}`;
}

const head = "text-caption text-muted-foreground";
const cols = "grid grid-cols-[minmax(0,1fr)_140px_120px_160px_120px] gap-x-3";

/**
 * "What changes": the period's figures for today's weights and the scenario side by side with the benchmark, and how far
 * the scenario moves each one. Return is the only figure coloured, by which way it moved.
 */
export function WhatChanges({ result, period, names, years }: { result: BacktestResult; period: Period; names: { original: string; modified: string }; years: string }) {
  const te = { original: trackingError(result, "originalActive"), modified: trackingError(result, "modifiedActive") };
  const m = (k: keyof Metrics, a: Metrics = result.original, b: Metrics = result.modified) => [a[k] as number | null, b[k] as number | null] as const;
  type Row = { key: string; label: string; explain?: string; cur: string; mod: string; diff: React.ReactNode; bench: string };
  const ratio = (k: "upCapture" | "downCapture"): Row => {
    const [a, b] = m(k);
    return { key: k, label: k === "upCapture" ? "Up capture" : "Down capture", cur: pct(a), mod: pct(b), diff: a === null || b === null ? "—" : bp(b - a), bench: pct(result.benchmarkMetrics[k]) };
  };
  const count = (k: "outDays" | "underDays" | "equalDays", label: string): Row => ({
    key: k,
    label,
    cur: String(result.original[k]),
    mod: String(result.modified[k]),
    diff: fmtAccounting(result.modified[k] - result.original[k], 0),
    bench: "—",
  });
  const [va, vb] = m("volatility");
  const [da, db] = m("maxDrawdown");
  const rows: Row[] = [
    { key: "ret", label: "Return", cur: pct(period.current), mod: pct(period.modified), diff: <Signed text={fmtChangeBp(shown(period.delta) * 10_000)} className="font-semibold" />, bench: pct(period.benchmark) },
    { key: "vol", label: "Volatility", explain: RISK_EXPLAIN.vol, cur: pct(va), mod: pct(vb), diff: moved(va === null || vb === null ? null : vb - va, "higher", "lower"), bench: pct(result.benchmarkMetrics.volatility) },
    { key: "te", label: "Tracking error", explain: RISK_EXPLAIN.trackingError, cur: pct(te.original), mod: pct(te.modified), diff: moved(te.original === null || te.modified === null ? null : te.modified - te.original, "higher", "lower"), bench: "—" },
    // Drawdowns are negative: a more negative modified figure is a deeper fall.
    { key: "dd", label: "Max drawdown", explain: RISK_EXPLAIN.drawdown, cur: pct(da), mod: pct(db), diff: moved(da === null || db === null ? null : da - db, "deeper", "shallower"), bench: pct(result.benchmarkMetrics.maxDrawdown) },
    ratio("upCapture"),
    ratio("downCapture"),
    count("outDays", "Outperforming days"),
    count("underDays", "Underperforming days"),
    count("equalDays", "Equal-return days"),
    { key: "vs", label: `Difference vs ${result.benchmark}`, cur: bp(period.currentActive), mod: bp(period.modifiedActive), diff: bp(period.delta), bench: bp(0) },
  ];
  return (
    <section aria-labelledby="bt-changes" className="mt-[30px]">
      <SectionHead id="bt-changes" title="What changes" />
      <div role="table" aria-label="Period summary" className="mt-2.5 text-body">
        <div role="row" className={cn(cols, "min-h-[34px] items-center border-b", head)}>
          <span role="columnheader">Measure, {years}</span>
          <span role="columnheader" className="text-right">{names.original}</span>
          <span role="columnheader" className="text-right">{names.modified}</span>
          <span role="columnheader" className="text-right">Difference</span>
          <span role="columnheader" className="text-right">Benchmark</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} role="row" className={cn(cols, "min-h-10 items-center border-b border-row")}>
            <span role="rowheader" className={r.key === "vs" ? "font-semibold" : undefined}>{r.explain ? <Tip label={r.label}>{r.explain}</Tip> : r.label}</span>
            <span role="cell" className="text-right">{r.cur}</span>
            <span role="cell" className="text-right font-semibold">{r.mod}</span>
            <span role="cell" className="text-right font-semibold">{r.diff}</span>
            <span role="cell" className="text-right text-muted-foreground">{r.bench}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

type Rank = "modified" | "original" | "delta";

/** Who added and who cost the most in each replay (or between them), then every holding's contribution. */
export function ReplayContributors({ result, period, names }: { result: BacktestResult; period: Period; names: { original: string; modified: string } }) {
  const [sort, setSort] = useState<Rank>("modified");
  const sorted = [...result.contributions].sort((a, b) => b[sort] - a[sort]);
  const leaders = sorted.filter((c) => c[sort] > 0).slice(0, 5);
  const detractors = sorted.filter((c) => c[sort] < 0).reverse().slice(0, 5);
  const max = Math.max(1e-9, ...[...leaders, ...detractors].map((c) => Math.abs(c[sort])));
  const grid = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px_80px_80px] gap-x-3";
  return (
    <section aria-labelledby="bt-contrib" className="mt-[30px]">
      <SectionHead
        id="bt-contrib"
        title="Contributors"
        sub="What each holding added to the period's return, in bp"
        aside={
          <Segmented
            label="Rank by"
            segments={[
              { key: "modified", label: names.modified, active: sort === "modified", onClick: () => setSort("modified") },
              { key: "original", label: names.original, active: sort === "original", onClick: () => setSort("original") },
              { key: "delta", label: "Weight-change delta", active: sort === "delta", onClick: () => setSort("delta") },
            ]}
          />
        }
      />
      <div className="mt-2.5 grid grid-cols-2 gap-x-14">
        {(
          [
            ["Top contributors", leaders],
            ["Top detractors", detractors],
          ] as const
        ).map(([label, rows]) => (
          <div key={label} role="table" aria-label={label}>
            <div role="row" className={cn("grid min-h-8 grid-cols-[7.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-2.5 border-b", head)}>
              <span role="columnheader">{label}</span>
              <span aria-hidden />
              <span role="columnheader" className="text-right">bp</span>
            </div>
            {rows.length === 0 && (
              <div role="row">
                <div role="cell" aria-colspan={2} className="min-h-10 py-2.5 text-body text-muted-foreground">None in this period.</div>
              </div>
            )}
            {rows.map((c) => (
              <div key={c.id} role="row" className="grid min-h-10 grid-cols-[7.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-2.5 border-b border-row text-body">
                <span role="rowheader" className="font-semibold">{c.ticker}</span>
                <span aria-hidden><CenterBar value={c[sort]} max={max} className="h-1.5" /></span>
                <Signed role="cell" text={bp(c[sort])} className="text-right font-semibold" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div role="table" aria-label="Contribution by holding" className="mt-6 max-h-96 overflow-auto text-body">
        <div role="row" className={cn(grid, "sticky top-0 min-h-8 items-center border-b bg-background", head)}>
          <span role="columnheader">Holding</span>
          <span aria-hidden />
          <span role="columnheader" className="text-right">{names.original}</span>
          <span role="columnheader" className="text-right">{names.modified}</span>
          <span role="columnheader" className="text-right">Delta</span>
        </div>
        {sorted.map((c) => (
          <div key={c.id} role="row" className={cn(grid, "min-h-9 items-center border-b border-row")}>
            <span role="rowheader" className="font-semibold">{c.ticker}</span>
            <span aria-hidden />
            <span role="cell" className="text-right">{bp(c.original)}</span>
            <span role="cell" className="text-right">{bp(c.modified)}</span>
            <Signed role="cell" text={bp(c.delta)} className="text-right font-semibold" />
          </div>
        ))}
        <div role="row" className={cn(grid, "min-h-9 items-center font-semibold")}>
          <span role="rowheader">Total</span>
          <span aria-hidden />
          <span role="cell" className="text-right">{bp(period.current)}</span>
          <span role="cell" className="text-right">{bp(period.modified)}</span>
          <span role="cell" className="text-right">{bp(period.delta)}</span>
        </div>
      </div>
    </section>
  );
}

type Mode = "originalActive" | "modifiedActive" | "delta";

/** A calendar of the replay's days, each coloured by how far ahead or behind it was; a day opens its contributions. */
export function DailyHeatmap({ result, names, defaultMode }: { result: BacktestResult; names: { original: string; modified: string }; defaultMode: Mode }) {
  const [date, setDate] = useState(result.days.at(-1)!.date);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const selected = result.days.find((d) => d.date === date)!;
  const months = [...new Set(result.days.map((d) => d.date.slice(0, 7)))];
  const byDate = new Map(result.days.map((d) => [d.date, d]));
  const modeLabel: Record<Mode, string> = {
    modifiedActive: `${names.modified} vs ${result.benchmark}`,
    originalActive: `${names.original} vs ${result.benchmark}`,
    delta: `${names.modified} − ${names.original.toLowerCase()}`,
  };
  const dayCols = "grid grid-cols-[minmax(0,1fr)_100px_100px_100px] gap-x-3";
  return (
    <section aria-labelledby="bt-days" className="mt-[30px]">
      <SectionHead
        id="bt-days"
        title="By day"
        sub={
          mode === "delta"
            ? `Green: ${names.modified.toLowerCase()} ahead that day · red: ${names.original.toLowerCase()} ahead · neutral: equal · darker: larger, up to 100 bp. Daily colors do not show the full-period result.`
            : `Green: ahead of ${result.benchmark} that day · red: behind · neutral: equal · darker: larger, up to 100 bp. Daily colors do not show the full-period result.`
        }
        aside={
          <Segmented
            label="Heatmap measure"
            segments={(Object.keys(modeLabel) as Mode[]).map((k) => ({ key: k, label: modeLabel[k], active: mode === k, onClick: () => setMode(k) }))}
          />
        }
      />
      <div className="mt-3 grid max-h-[36rem] gap-6 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
        {months.map((month) => {
          const first = new Date(`${month}-01T00:00:00Z`);
          const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
          const offset = (first.getUTCDay() + 6) % 7;
          return (
            <div key={month}>
              <h3 className="mb-2 text-body font-semibold">{fmtMonth(`${month}-01`)}</h3>
              <div className="grid grid-cols-7 gap-1 text-center text-body">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={i} className="pb-1 text-caption text-muted-foreground">
                    {d}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`pad${i}`} />
                ))}
                {Array.from({ length: count }, (_, i) => {
                  const day = `${month}-${String(i + 1).padStart(2, "0")}`;
                  const row = byDate.get(day);
                  if (!row)
                    return (
                      <span key={day} className="grid min-h-8 place-items-center rounded-[4px] bg-secondary/60 text-muted-foreground/70" title="Outside replay or no benchmark session">
                        {i + 1}
                      </span>
                    );
                  const value = row[mode];
                  const label = `${day}: ${modeLabel[mode]} ${bp(value)}`;
                  return (
                    <button
                      type="button"
                      key={day}
                      title={label}
                      aria-label={label}
                      aria-pressed={day === date}
                      onClick={() => setDate(day)}
                      className={cn("min-h-8 rounded-[4px] text-body text-foreground focus-visible:outline-2 focus-visible:outline-ring", day === date && "ring-2 ring-foreground ring-offset-1 ring-offset-background")}
                      style={{
                        backgroundColor: Math.abs(value) < 1e-12 ? "var(--secondary)" : `color-mix(in srgb, ${value > 0 ? "var(--up)" : "var(--down)"} ${20 + Math.min(Math.abs(value) / 0.01, 1) * 50}%, var(--background))`,
                      }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-caption text-muted-foreground">Select a trading day for contributions. Blank sessions are not assigned a zero return.</p>

      <h3 className="mt-6 text-title font-bold tracking-[-0.01em]">Day detail · {fmtDay(date)}</h3>
      <div role="table" aria-label="Selected day, portfolio and benchmark" className="mt-2 text-body">
        <div role="row" className={cn(dayCols, "min-h-8 items-center border-b", head)}>
          <span role="columnheader">Return</span>
          <span role="columnheader" className="text-right">{names.original}</span>
          <span role="columnheader" className="text-right">{names.modified}</span>
          <span role="columnheader" className="text-right">Difference</span>
        </div>
        {[
          ["Portfolio", pct(selected.original), pct(selected.modified), bp(selected.delta)],
          [`Benchmark · ${result.benchmark}`, pct(selected.benchmark), pct(selected.benchmark), bp(0)],
          [`Difference vs ${result.benchmark}`, bp(selected.originalActive), bp(selected.modifiedActive), bp(selected.delta)],
        ].map(([label, a, b, c]) => (
          <div key={label} role="row" className={cn(dayCols, "min-h-9 items-center border-b border-row")}>
            <span role="rowheader">{label}</span>
            <span role="cell" className="text-right">{a}</span>
            <span role="cell" className="text-right">{b}</span>
            <span role="cell" className="text-right">{c}</span>
          </div>
        ))}
      </div>
      <div role="table" aria-label="Holding contributions to the selected day" className="mt-5 text-body">
        <p className="mb-1 text-caption text-muted-foreground">Holding contributions to the day&apos;s portfolio return, in percentage points.</p>
        <div role="row" className={cn("grid grid-cols-[minmax(0,1fr)_100px_100px_100px_100px] gap-x-3 min-h-8 items-center border-b", head)}>
          <span role="columnheader">Holding</span>
          <span role="columnheader" className="text-right">Holding return</span>
          <span role="columnheader" className="text-right">{names.original}</span>
          <span role="columnheader" className="text-right">{names.modified}</span>
          <span role="columnheader" className="text-right">Difference</span>
        </div>
        {selected.contributions.map((c) => (
          <div key={c.id} role="row" className="grid min-h-9 grid-cols-[minmax(0,1fr)_100px_100px_100px_100px] items-center gap-x-3 border-b border-row">
            <span role="rowheader" className="font-semibold">{c.ticker}</span>
            <span role="cell" className="text-right">{pct(c.return)}</span>
            <span role="cell" className="text-right">{bp(c.original)}</span>
            <span role="cell" className="text-right">{bp(c.modified)}</span>
            <Signed role="cell" text={bp(c.delta)} className="text-right font-semibold" />
          </div>
        ))}
      </div>
    </section>
  );
}

const rpct = (v: number | null, d = 2) => fmtPct(v === null ? null : v * 100, d);
const num = (v: number | null, d = 2) => fmtAccounting(v, d);

const RISK_ROWS: { key: keyof ScenarioMetrics; label: string; explain: string; fmt: (v: number | null) => string; unit: "bp" | "x" }[] = [
  { key: "vol", label: "Volatility", explain: RISK_EXPLAIN.vol, fmt: rpct, unit: "bp" },
  { key: "beta", label: "Beta", explain: RISK_EXPLAIN.beta, fmt: num, unit: "x" },
  { key: "trackingError", label: "Tracking error", explain: RISK_EXPLAIN.trackingError, fmt: rpct, unit: "bp" },
  { key: "var", label: "1-day VaR (95%)", explain: RISK_EXPLAIN.var, fmt: rpct, unit: "bp" },
  { key: "es", label: "Expected shortfall", explain: RISK_EXPLAIN.es, fmt: rpct, unit: "bp" },
  { key: "effectiveN", label: "Effective positions", explain: RISK_EXPLAIN.effectiveN, fmt: (v) => num(v, 1), unit: "x" },
  { key: "top5", label: "Top 5 weight", explain: RISK_EXPLAIN.top5, fmt: rpct, unit: "bp" },
];

/** How far a measure moved, in ink: green and red are for the sign of a return, and a lower risk figure is not a loss. */
function RiskChange({ before, after, unit }: { before: number | null; after: number | null; unit: "bp" | "x" }) {
  if (before === null || after === null || !Number.isFinite(before) || !Number.isFinite(after)) return <span className="text-muted-foreground">—</span>;
  const d = after - before;
  const text = unit === "bp" ? fmtChangeBp(d * 10_000) : fmtAccounting(d, 2);
  if (!/[1-9]/.test(text)) return <span className="text-muted-foreground">no change</span>;
  return <span>{unit === "x" && d > 0 ? `+${text}` : text}</span>;
}

const arrow = (a: string, b: string) => (a === b ? a : `${a} → ${b}`);

export const RISK_IMPACT_EXPLAIN =
  "Today's risk of today's weights and the scenario, using the Risk page's model: a 1-year window of daily total returns, sample covariance, beta against SPY, tracking error against the sector benchmark, and 1-day 95% historical VaR. It is independent of the replay period above and is an estimate from past returns, not a forecast.";

/**
 * Risk impact: today's weights against the scenario on the Risk page's model: the headline measures, then each holding's
 * share of risk and each sector's active weight and share of risk. Measured when the replay runs.
 */
export function ScenarioRiskSection({ data, busy, error, stale, names }: { data: ScenarioRisk | null; busy: boolean; error: string; stale: boolean; names: { original: string; modified: string } }) {
  const measure = "grid grid-cols-[minmax(0,1fr)_86px_86px_92px] gap-x-3";
  const two = "grid grid-cols-[minmax(0,1fr)_120px_120px] gap-x-3";
  return (
    <section data-tour="bt-risk-impact" aria-labelledby="bt-risk" className="mt-[30px]">
      <SectionHead
        id="bt-risk"
        title={<Tip label="Risk impact">{RISK_IMPACT_EXPLAIN}</Tip>}
        sub={data ? `Today's weights against the scenario · ${data.window.days} daily returns to the ${data.window.to} close` : "Today's weights against the scenario"}
      />
      {error ? (
        <p role="alert" className="mt-2 text-body"><b className="font-semibold text-caution-foreground">Failed</b> <span className="text-ink-3">{error}</span></p>
      ) : !data ? (
        <p className="mt-2 text-body text-muted-foreground">{busy ? "Measuring risk…" : "Run the replay to see how the scenario changes the portfolio's risk."}</p>
      ) : (
        <div className={cn("mt-2.5 grid grid-cols-2 gap-x-14", stale && "opacity-60")}>
          <div role="table" aria-label="Risk measures" className="text-body">
            <div role="row" className={cn(measure, "min-h-[34px] items-center border-b", head)}>
              <span role="columnheader">Measure</span>
              <span role="columnheader" className="text-right">{names.original}</span>
              <span role="columnheader" className="text-right">{names.modified}</span>
              <span role="columnheader" className="text-right">Change</span>
            </div>
            {RISK_ROWS.map((r) => (
              <div key={r.key} role="row" className={cn(measure, "min-h-10 items-center border-b border-row")}>
                <span role="rowheader"><Tip label={r.label}>{r.explain}</Tip></span>
                <span role="cell" className="text-right">{r.fmt(data.before[r.key])}</span>
                <span role="cell" className="text-right font-semibold">{r.fmt(data.after[r.key])}</span>
                <span role="cell" className="text-right font-semibold"><RiskChange before={data.before[r.key]} after={data.after[r.key]} unit={r.unit} /></span>
              </div>
            ))}
          </div>
          <div className="grid content-start gap-6">
            <div role="table" aria-label="Weight and share of risk by holding" className="text-body">
              <div role="row" className={cn(two, "min-h-[34px] items-center border-b", head)}>
                <span role="columnheader">Holding</span>
                <span role="columnheader" className="text-right">Weight</span>
                <span role="columnheader" className="text-right"><Tip label="Share of risk" side="bottom">{RISK_EXPLAIN.riskShare}</Tip></span>
              </div>
              {data.holdings.map((h) => (
                <div key={h.ticker} role="row" className={cn(two, "min-h-9 items-center border-b border-row")}>
                  <span role="rowheader" className="font-semibold">{h.ticker}</span>
                  <span role="cell" className="text-right">{arrow(rpct(h.weightBefore), rpct(h.weightAfter))}</span>
                  <span role="cell" className="text-right">{arrow(rpct(h.shareBefore, 1), rpct(h.shareAfter, 1))}</span>
                </div>
              ))}
            </div>
            {data.sectors.length > 0 && (
              <div role="table" aria-label="Active weight and share of risk by sector" className="text-body">
                <div role="row" className={cn(two, "min-h-[34px] items-center border-b", head)}>
                  <span role="columnheader">Sector</span>
                  <span role="columnheader" className="text-right"><Tip label="Active weight" side="bottom">{`${RISK_EXPLAIN.activeWeight} Against ${data.benchmarkLabel}.`}</Tip></span>
                  <span role="columnheader" className="text-right">Share of risk</span>
                </div>
                {data.sectors.map((s) => (
                  <div key={s.label} role="row" className={cn(two, "min-h-9 items-center border-b border-row")}>
                    <span role="rowheader">{s.label}</span>
                    <span role="cell" className="text-right">{s.activeBefore === null ? "—" : arrow(rpct(s.activeBefore, 1), rpct(s.activeAfter, 1))}</span>
                    <span role="cell" className="text-right">{arrow(rpct(s.shareBefore, 1), rpct(s.shareAfter, 1))}</span>
                  </div>
                ))}
              </div>
            )}
            {data.notices.map((n) => (
              <p key={n} className="text-body text-muted-foreground">{n}</p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export const riskWindowLabel = (data: ScenarioRisk | null) => (data ? `${data.window.days} daily returns to the ${data.window.to} close` : undefined);
