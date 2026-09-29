import Link from "next/link";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import type { CurrentUser } from "@/lib/auth";
import { loadHeldTickets } from "@/lib/attribution/held-tickets";
import { loadHootFeed } from "@/lib/hoot/nudges";
import type { HootNudge } from "@/lib/hoot/types";
import type { Overview } from "@/lib/portfolio/overview";
import { loadWeek } from "@/lib/portfolio/week";
import { buildExposure } from "@/lib/risk/exposure";
import { loadRisk } from "@/lib/risk/load";
import { LOOKBACKS } from "@/lib/risk/model";
import { fmtBp, fmtChangeBp, fmtChangePair, fmtChangePct, fmtChangeUsd, fmtDay, fmtDayMonth, fmtMoney, fmtPct, fmtTime, fmtUsd } from "@/lib/format";
import { holdingHref } from "@/lib/scope";
import { isOverdue, listNudges, nudgeWhen } from "@/lib/today";
import { cn } from "@/lib/utils";
import { PageHero } from "@/components/app/page-head";
import { StatStrip, type StatCell } from "@/components/app/panel";
import { toneOfText } from "./figures";
import { OverviewChart } from "./overview-chart";
import { PositionsTable, type PositionGroup } from "./positions-table";
import type { Team } from "@/db/schema";

const RULE = "grid min-h-10 grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 border-b border-row text-body";

/** The header's grey note: which prices these are. */
export async function OverviewAsOf({ overview }: { overview: Promise<Overview | null> }) {
  const o = await overview;
  if (!o) return null;
  if (o.status === "live") return <>Live · prices as of {o.quotesAsOf ? fmtTime(o.quotesAsOf) : "the last quote"}</>;
  if (o.status === "provisional") return <>Market closed · closing quotes, official closes at 5:00 PM ET</>;
  return <>Closing prices, {fmtDay(o.session)}</>;
}

/** "12 bp ahead of the benchmark", "level with the S&P 500". */
export function versus(v: NonNullable<Overview["vsBenchmark"]>) {
  const n = Math.round(Math.abs(v.bp));
  return n === 0 ? `level with ${v.label}` : `${fmtBp(n)} ${v.bp > 0 ? "ahead of" : "behind"} ${v.label}`;
}

/** The fund's value, today's change and what it means against the benchmark, then the chart. */
export async function OverviewHero({ overview, today }: { overview: Promise<Overview | null>; today: string }) {
  const o = await overview;
  if (!o) return null;
  const day = o.status === "final" && o.session !== today ? fmtDay(o.session) : "Today";
  const change = fmtChangePair(fmtChangeUsd(o.dayPnl), o.dayPct);
  return (
    <div className="flex flex-col">
      <PageHero label="Owl Fund" value={fmtUsd(o.value)} change={change} tone={toneOfText(change)} note={`${day}${o.vsBenchmark ? ` · ${versus(o.vsBenchmark)}` : ""}`} />
      {o.notes.map((n) => (
        <span key={n} className="pt-1 text-caption text-caution-foreground">
          {n}
        </span>
      ))}
      <OverviewChart points={o.chart} dayBase={o.dayBase} inception={o.inception} note={o.chartNote} />
    </div>
  );
}


/** Six numbers, each opening the tab that explains it. Volatility, tracking error and the largest tilt come from the Risk model. */
export async function OverviewStats({ overview }: { overview: Promise<Overview | null> }) {
  const o = await overview;
  if (!o) return null;
  const risk = await loadRisk("1y", null).catch((e) => {
    console.error("[overview] risk failed", e);
    return null;
  });
  const report = risk?.state === "ok" ? risk.report : null;
  const bet = report ? buildExposure(report).largestBet : null;
  const s = o.since;
  const since = s ? fmtChangePct(s.pct) : "—";
  const active = s?.activeBp != null ? fmtChangeBp(s.activeBp) : "—";
  const larger = s && s.allocationBp != null && s.selectionBp != null ? (Math.abs(s.allocationBp) >= Math.abs(s.selectionBp) ? "allocation" : "selection") : null;
  const cells: StatCell[] = [
    { label: `Since ${fmtDayMonth(o.inception)}`, value: since, note: s ? (s.benchmarkPct === null ? "No benchmark weights saved" : `Benchmark ${fmtChangePct(s.benchmarkPct)}`) : "The ledger has one day so far", href: "/attribution", tone: toneOfText(since) },
    { label: "Against the benchmark", value: active, note: larger ? `Mostly ${larger}` : s?.activeBp == null ? "Needs benchmark weights" : "", href: "/attribution", tone: toneOfText(active) },
    { label: "Volatility", value: report ? fmtPct(report.portfolio.vol * 100, 1) : "—", note: report ? `${LOOKBACKS[report.lookback].label}, annualized` : "Price history is still loading", href: "/risk" },
    { label: "Tracking error", value: report?.portfolio.trackingError != null ? fmtPct(report.portfolio.trackingError * 100, 1) : "—", note: "Against the benchmark", href: "/risk" },
    { label: "Largest tilt", value: bet ? bet.label : "—", note: bet?.active != null ? `${fmtChangeBp(bet.active * 10_000)} ${bet.active >= 0 ? "overweight" : "underweight"}` : "Needs benchmark weights", href: "/exposure" },
    { label: "Cash", value: fmtPct(o.cash.weightPct), note: fmtMoney(o.cash.value), href: "/attribution/ledger" },
  ];
  // The chart's range row above draws the strip's top hairline.
  return <StatStrip cells={cells} className="border-t-0 pb-5" />;
}

type Need = { key: string; tag: string; tone: "down" | "caution" | "neutral"; title: string; meta: string; href: string };

const NUDGE_TAG: Record<string, string> = { movement: "Due", earnings: "Reports", sell_side: "Ready", proposal: "Review", weekly: "Pack", changelog: "New" };

function needFromNudge(n: HootNudge): Need {
  const late = isOverdue(n);
  const failed = n.kind === "sell_side" && n.id.endsWith(":error");
  return {
    key: n.id,
    tag: late ? "Overdue" : failed ? "Check" : (NUDGE_TAG[n.kind] ?? "Open"),
    tone: late ? "down" : failed || (n.kind === "weekly" && n.id.endsWith(":failed")) ? "caution" : "neutral",
    title: n.title,
    meta: nudgeWhen(n),
    href: n.href,
  };
}

const NEED_SHOWN = 5;
const TAG_TONE = { down: "text-down", caution: "text-caution-foreground", neutral: "text-ink-2" } as const;

/**
 * What needs the reader: Hoot's list (overdue write-ups first), tickets he held back, and data that is stale or
 * missing. Each row opens the place where it is dealt with.
 */
export async function NeedsYou({ user, overview }: { user: CurrentUser; overview: Promise<Overview | null> }) {
  const [feed, held, o] = await Promise.all([
    loadHootFeed(user).catch((e) => {
      console.error("[overview] hoot feed failed", e);
      return { nudges: [] as HootNudge[] };
    }),
    loadHeldTickets().catch((e) => {
      console.error("[overview] held tickets failed", e);
      return [];
    }),
    overview,
  ]);
  const needs: Need[] = [
    ...listNudges(feed.nudges).filter(isOverdue).map(needFromNudge),
    ...held.map((t): Need => ({ key: `held:${t.id}`, tag: "Check", tone: "caution", title: `${t.ticker} ticket held`, meta: t.why.match(/is ([\d.]+% (?:above|below))/)?.[1]?.replace(/ (above|below)/, " from the market") ?? "Price is off", href: "/attribution/ledger" })),
    ...(o?.attention ?? []).map((a): Need => ({ key: `data:${a.title}`, tag: a.tag, tone: "caution", title: a.title, meta: a.meta, href: a.href })),
    ...listNudges(feed.nudges).filter((n) => !isOverdue(n)).map(needFromNudge),
  ];
  const shown = needs.slice(0, NEED_SHOWN);
  return (
    <section aria-labelledby="needs-h">
      <h2 id="needs-h" className="mb-1 text-body font-bold">
        Needs you
      </h2>
      {shown.length === 0 ? (
        <p className="flex min-h-10 items-center text-body text-muted-foreground">Nothing needs you right now.</p>
      ) : (
        shown.map((n) => (
          <Link key={n.key} href={n.href} className={cn(RULE, "grid-cols-[70px_minmax(0,1fr)_auto] transition-colors hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}>
            <span className={cn("text-caption font-semibold", TAG_TONE[n.tone])}>{n.tag}</span>
            <span className="truncate font-medium">{n.title}</span>
            <span className="max-w-[16rem] truncate text-caption text-muted-foreground">{n.meta}</span>
          </Link>
        ))
      )}
      {needs.length > shown.length && (
        <Link href="/" className="inline-block pt-2 text-caption text-muted-foreground hover:text-foreground hover:underline">
          {needs.length - shown.length} more on Home
        </Link>
      )}
    </section>
  );
}

/** The next week: the fund's earnings reports and the big economic releases. */
export async function ThisWeek({ teams }: { teams: Team[] }) {
  const { items, releasesUnavailable } = await loadWeek(teams.map((t) => t.id)).catch(() => ({ items: [], releasesUnavailable: true }));
  return (
    <section aria-labelledby="week-h">
      <h2 id="week-h" className="mb-1 text-body font-bold">
        This week
      </h2>
      {items.length === 0 ? (
        <p className="flex min-h-10 items-center text-body text-muted-foreground">Nothing scheduled in the next seven days.</p>
      ) : (
        items.map((w) => (
          <div key={`${w.date}-${w.text}`} className={RULE}>
            <span className="text-caption text-muted-foreground">{w.day}</span>
            <span className="truncate">{w.text}</span>
            <span className="text-caption text-muted-foreground">{w.when}</span>
          </div>
        ))
      )}
      {releasesUnavailable && <p className="pt-2 text-caption text-caution-foreground">The economic calendar could not be loaded, so releases are missing.</p>}
    </section>
  );
}

/** Positions grouped by team. */
export async function OverviewPositions({ overview, teams }: { overview: Promise<Overview | null>; teams: Team[] }) {
  const o = await overview;
  if (!o) return null;
  const known = new Map(teams.map((t) => [t.id, t]));
  const line = (p: Overview["positions"][number]) => ({
    ticker: p.ticker,
    name: p.name,
    href: holdingHref(FUND_SCOPE_SLUG, known.get(p.teamId ?? "")?.slug ?? FUND_SCOPE_SLUG, p.ticker),
    shares: p.shares,
    price: p.price,
    dayPct: p.dayPct,
    dayPnl: p.dayPnl,
    value: p.value,
    weight: p.weight,
    gain: p.gain,
    cost: p.cost,
  });
  const groups: PositionGroup[] = [...teams]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((t) => ({ id: t.id, name: t.name, lines: o.positions.filter((p) => p.teamId === t.id).map(line) }))
    .filter((g) => g.lines.length);
  const orphans = o.positions.filter((p) => !p.teamId || !known.has(p.teamId));
  if (orphans.length) groups.push({ id: "none", name: "No team", lines: orphans.map(line) });
  return <PositionsTable groups={groups} cash={o.cash} asOf={o.session} />;
}
