import { PageHero } from "@/components/app/page-head";
import { StatStrip, type StatCell } from "@/components/app/panel";
import { teamDay, type HoldingListRow } from "@/components/app/holdings/holdings-table";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonChart, SkeletonStatStrip, TextBone } from "@/components/app/skeletons";
import { fmtBp, fmtChangeBp, fmtChangePair, fmtChangePct, fmtChangeUsd, fmtDay, fmtDayMonth, fmtMoney, fmtPct, fmtTime, fmtUsd } from "@/lib/format";
import type { MarketSnapshot } from "@/lib/market";
import { loadRisk } from "@/lib/risk/load";
import { LOOKBACKS } from "@/lib/risk/model";
import type { ScopeBook } from "./book-load";
import { toneOfText } from "./figures";
import { toneClass } from "./parts";
import { OverviewChart } from "./overview-chart";

// The top of every Portfolio view: what the book in scope is worth and did today, its history, and five numbers that
// open the views explaining them. For a reader who can't see a team's sizes, the team's move today instead.

/** "41 bp ahead of the benchmark", "level with the S&P 500". */
export function versus(v: NonNullable<ScopeBook["vsBenchmark"]>) {
  const n = Math.round(Math.abs(v.bp));
  return n === 0 ? `level with ${v.label}` : `${fmtBp(n)} ${v.bp > 0 ? "ahead of" : "behind"} ${v.label}`;
}

/** The header's grey note: which prices these are. */
export async function BookAsOf({ book }: { book: Promise<ScopeBook | null> }) {
  const b = await book;
  if (!b) return null;
  if (b.status === "live") return <>Live at {b.quotesAsOf ? fmtTime(b.quotesAsOf) : "the last quote"}</>;
  if (b.status === "provisional") return <>Market closed, closing quotes. Official closes at 5:00 PM ET</>;
  return <>Closing prices, {fmtDay(b.session)}</>;
}

/** The same note from the market quotes, for readers without the book. */
export async function MarketAsOf({ market }: { market: Promise<MarketSnapshot> }) {
  const { spx } = await market;
  if (!spx) return <>Quotes unavailable</>;
  return spx.marketState === "REGULAR" ? <>Live at {fmtTime(spx.asOf)}</> : <>Closing prices, {fmtDay(spx.asOf.slice(0, 10))}</>;
}

/** The value, today's change and what it means against the benchmark, then the chart. */
export async function BookHero({ book, today, teamSlug, empty }: { book: Promise<ScopeBook | null>; today: string; /** A team's slug, for the chart's 1D path. */ teamSlug?: string; empty: React.ReactNode }) {
  const b = await book;
  if (!b) return <>{empty}</>;
  const day = b.status === "final" && b.session !== today ? `on ${fmtDay(b.session)}` : "today";
  const change = fmtChangePair(fmtChangeUsd(b.dayPnl), b.dayPct);
  return (
    <div className="flex flex-col">
      <PageHero label={b.label} value={fmtUsd(b.value)} change={change} tone={toneOfText(change)} note={`${day}${b.vsBenchmark ? `, ${versus(b.vsBenchmark)}` : ""}`} />
      {b.notes.map((n) => (
        <span key={n} className="pt-1 text-caption text-caution-foreground">
          {n}
        </span>
      ))}
      <OverviewChart points={b.chart} dayBase={b.dayBase} inception={b.inception} note={b.chartNote} team={teamSlug} subject={b.kind === "fund" ? "Fund" : b.label} />
    </div>
  );
}

/**
 * Five numbers, each opening the view that explains it: the return since the ledger opened, the gap to the benchmark
 * and what it is mostly made of, volatility and tracking error from the Risk model, and cash (a team's share of the
 * fund instead: it holds no cash).
 */
export async function BookStats({ book, base, teamId }: { book: Promise<ScopeBook | null>; base: string; teamId: string | null }) {
  const b = await book;
  if (!b) return null;
  const risk = await loadRisk("1y", teamId).catch((e) => {
    console.error("[portfolio] risk failed", e);
    return null;
  });
  const report = risk?.state === "ok" ? risk.report : null;
  const s = b.since;
  const since = s ? fmtChangePct(s.pct) : "—";
  const active = s?.activeBp != null ? fmtChangeBp(s.activeBp) : "—";
  const larger = s && s.allocationBp != null && s.selectionBp != null ? (Math.abs(s.allocationBp) >= Math.abs(s.selectionBp) ? "allocation" : "selection") : null;
  const benchmark = b.kind === "fund" ? "Benchmark" : "Sector benchmark";
  const cells: StatCell[] = [
    {
      label: `Since ${fmtDayMonth(s?.from ?? b.inception)}`,
      value: since,
      note: s ? (s.benchmarkPct === null ? (b.kind === "fund" ? "No benchmark weights saved" : "No sectors assigned") : `${benchmark} ${fmtChangePct(s.benchmarkPct)}`) : "The ledger has one day so far",
      href: `${base}/performance?period=itd`,
      tone: toneOfText(since),
    },
    { label: b.kind === "fund" ? "Against the benchmark" : "Against its sectors", value: active, note: larger ? `Mostly ${larger}` : s?.activeBp == null ? "Needs benchmark weights" : "", href: `${base}/performance?period=itd`, tone: toneOfText(active) },
    { label: "Volatility", value: report ? fmtPct(report.portfolio.vol * 100, 1) : "—", note: report ? `${LOOKBACKS[report.lookback].label}, annualized` : "Price history is still loading", href: `${base}/risk` },
    { label: "Tracking error", value: report?.portfolio.trackingError != null ? fmtPct(report.portfolio.trackingError * 100, 1) : "—", note: b.kind === "fund" ? "Against the benchmark" : "Against its sectors", href: `${base}/risk` },
    b.cash
      ? { label: "Cash", value: fmtPct(b.cash.weightPct), note: fmtMoney(b.cash.value), href: b.kind === "fund" ? `${base}/activity` : undefined }
      : { label: "Of the fund", value: b.fundWeightPct === null ? "—" : fmtPct(b.fundWeightPct), note: `${b.positions.length} ${b.positions.length === 1 ? "position" : "positions"}, ${fmtMoney(b.value, 0)}`, href: `${base}/exposure` },
  ];
  // The chart's range row above draws the strip's top hairline.
  return <StatStrip cells={cells} className="border-t-0" />;
}

/**
 * For a reader who can't see the team's position sizes: its move today (its holdings weighted by their recorded
 * weights) and what that is against the S&P 500. No value, no chart.
 */
export async function MoveHero({ teamName, rows, market }: { teamName: string; rows: HoldingListRow[]; market: Promise<MarketSnapshot> }) {
  const snap = await market;
  const quotes = Object.fromEntries(Object.entries(snap.rows).map(([t, m]) => [t, { changePct: m.quote?.changePct }]));
  const dayPct = teamDay(rows, quotes);
  const spxPct = snap.spx?.changePct;
  const vs = dayPct != null && spxPct != null ? (dayPct - spxPct) * 100 : null;
  const vsText = vs == null ? null : versus({ bp: vs, label: "the S&P 500" });
  const value = dayPct != null ? fmtChangePct(dayPct) : "—";
  return (
    <div className="flex flex-col border-b pb-5">
      <PageHero label={teamName} value={<span className={toneClass(toneOfText(value))}>{value}</span>} note={`${teamName} today${vsText ? `, ${vsText}` : ""}`} />
      {!snap.spx && <span className="pt-1 text-caption text-caution-foreground">{snap.error ?? "Quotes are unavailable right now."}</span>}
    </div>
  );
}

/** The hero's boxes while the book loads: label, figure, the line, the chart and its range row. */
export function BookHeroFallback({ label }: { label?: string }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading the book">
      {label ? <span className="text-body text-muted-foreground">{label}</span> : <TextBone className="text-body" w="w-16" />}
      <span aria-hidden className="flex h-[52px] items-center">
        <Skeleton className="h-9 w-72" />
      </span>
      <TextBone className="text-emph" w="w-96" />
      <SkeletonChart className="mt-[22px] h-[220px]" />
      <div className="mt-3 flex items-center gap-1 border-b pb-3.5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-10 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** The five numbers while the Risk model loads. */
export function BookStatsFallback() {
  return <SkeletonStatStrip cells={5} className="border-t-0" />;
}
