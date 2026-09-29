"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/app/page-head";
import { FilterChip, FilterChips, Pill, StatStrip, type PillTone } from "@/components/app/panel";
import { HowNote, Hero, SectionHead, Signed, Strong, signTone } from "@/components/app/portfolio/parts";
import { BENCH_LINE, FUND_LINE, LineKey } from "@/components/app/portfolio/lines-chart";
import { bridgeCells, LegendItem, PeriodBar, SectorEffectsSection, TeamBars } from "@/components/app/attribution/attribution-panels";
import type { TeamLookup } from "@/components/app/attribution/contributors-table";
import { HeroNotes, type QualityNotice } from "@/components/app/attribution/data-quality-notice";
import { EXPLAIN } from "@/components/app/attribution/explainers";
import { bps, pct } from "@/components/app/attribution/format";
import { Tip } from "@/components/app/attribution/info-tip";
import { SectorsPanel } from "@/components/app/attribution/sectors-panel";
import { usePageContext } from "@/components/app/hoot/page-context";
import type { TeamAttributionResult } from "@/lib/attribution/attribution";
import type { LiveSnapshot, LiveStatus, PathPoint } from "@/lib/attribution/live";
import { bucketLabel, INDEX_LABEL } from "@/lib/attribution/sectors";
import { fmtChangeBp, fmtChangePct, fmtChangeUsd, fmtDateTime, fmtDay, fmtPct, fmtTime, fmtUsd } from "@/lib/format";
import { IntradayChart } from "./intraday-chart";
import { LiveHoldingsTable } from "./live-holdings-table";

/** Numbers every minute while the market is open; the chart every five (its bars are five minutes apart). */
const REFRESH_MS = 60_000;
const PATH_MS = 5 * 60_000;
/** After the bell and before the price run: look for the stored closes every five minutes. */
const PROVISIONAL_MS = 5 * 60_000;

const STATUS: Record<LiveStatus, { label: string; tone: PillTone }> = {
  live: { label: "Live", tone: "good" },
  provisional: { label: "Closed · provisional", tone: "caution" },
  final: { label: "Final", tone: "neutral" },
};

type HoldingKind = "all" | "stocks" | "etfs";

export type TodayScope = { kind: "fund" } | { kind: "team"; slug: string; name: string; benchmarkName: string; benchmarkSectors: string };

/** What the page tells the view about the period bar: where it links, and the ledger's first and last day. */
export type TodayPeriod = { basePath: string; inception: string; latest: string };

function statusLine(s: LiveSnapshot) {
  if (s.status === "live") return `Prices as of ${s.asOf ? fmtTime(s.asOf) : "—"}`;
  if (s.status === "provisional") return "Closing quotes until the 5:00 pm price run stores the closes";
  return s.phase === "open" ? fmtDay(s.session) : `${fmtDay(s.session)} · market opens ${fmtDateTime(s.opensAt)}`;
}

/**
 * Performance's "Today" period: the session's return and where it came from, live while the market is open, the last
 * session otherwise. The same engine as the other periods, run on one day from quotes held in memory. Refreshed like the
 * old Daily page: the numbers every minute while it trades, the chart every five, the stored closes every five minutes
 * after the bell until the 5:00 pm price run lands.
 */
export function TodayView({ initial, scope, teams: teamList, period, notices: pageNotices }: { initial: LiveSnapshot; scope: TodayScope; teams: [string, { name: string; slug: string }][]; period: TodayPeriod; notices: QualityNotice[] }) {
  const [snap, setSnap] = useState(initial);
  const [points, setPoints] = useState<PathPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<HoldingKind>("all");
  const lastSnap = useRef(Date.parse(initial.generatedAt));
  const lastPath = useRef(0);
  const shown = useRef(`${initial.session}|${initial.status}`);
  const teams: TeamLookup = useMemo(() => new Map(teamList), [teamList]);
  const query = scope.kind === "team" ? `?team=${encodeURIComponent(scope.slug)}` : "";

  const loadPath = useCallback(async () => {
    lastPath.current = Date.now();
    try {
      const res = await fetch(`/api/daily-performance/path${query}`, { cache: "no-store" });
      if (res.ok) setPoints(((await res.json()) as { points: PathPoint[] }).points);
      else setPoints((p) => p ?? []);
    } catch {
      setPoints((p) => p ?? []);
    }
  }, [query]);

  const loadSnap = useCallback(async () => {
    lastSnap.current = Date.now();
    setLoading(true);
    try {
      const res = await fetch(`/api/daily-performance${query}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as LiveSnapshot;
      // A new session (the bell rang) or the stored closes landing redraws the chart.
      const key = `${next.session}|${next.status}`;
      if (key !== shown.current) {
        shown.current = key;
        void loadPath();
      }
      setSnap(next);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [query, loadPath]);

  const refresh = useCallback(() => {
    void loadSnap();
    void loadPath();
  }, [loadSnap, loadPath]);

  // The chart loads after the page: the day's first bar fetch takes a few seconds.
  useEffect(() => {
    const t = window.setTimeout(() => void loadPath(), 0);
    return () => window.clearTimeout(t);
  }, [loadPath]);

  // Only while something can change: the session is live, the closes are due, or the bell is about to ring.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      const since = now - lastSnap.current;
      // Every minute while the market is open, whatever the last answer was: at the bell (or while Yahoo is down) it can
      // still be the previous session until today's first quotes arrive.
      const due =
        ((snap.phase === "open" || now >= Date.parse(snap.opensAt)) && since >= REFRESH_MS - 1000) ||
        (snap.status === "provisional" && since >= PROVISIONAL_MS - 1000);
      if (due) void loadSnap();
      if (snap.phase === "open" && now - lastPath.current >= PATH_MS - 1000) void loadPath();
    };
    const timer = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [snap.status, snap.phase, snap.opensAt, loadSnap, loadPath]);

  // Hoot reads the page it was asked from: the session shown, and whether it is live.
  usePageContext(
    scope.kind === "fund"
      ? { kind: "daily", path: period.basePath, title: "Performance today", scope: "fund", session: snap.session, status: snap.status }
      : { kind: "daily", path: period.basePath, title: `${scope.name} performance today`, scope: "team", team: scope.slug, session: snap.session, status: snap.status },
  );

  const r = snap.result;
  const fund = scope.kind === "fund";
  const own = fund ? "Fund" : "team";
  const status = STATUS[snap.status];
  const active = snap.spx === null ? null : snap.ret - snap.spx;
  const gap = r.activeReturn;
  const teamR = r as TeamAttributionResult;
  const portfolioLabel = fund ? "Fund" : scope.name;
  const benchmarkLabel = fund ? INDEX_LABEL : "Sector benchmark";
  const cells = bridgeCells(r, fund);

  const notices: QualityNotice[] = [
    ...(failed ? [{ text: "The last refresh failed; these are the numbers from before it." }] : []),
    ...snap.notes.map((text) => ({ text })),
    ...pageNotices,
  ];

  const top = r.holdings[0];
  const bottom = r.holdings.at(-1);
  const etfCount = snap.holdings.filter((h) => h.etf).length;
  // The chips only show when there are both kinds; if a refresh leaves one kind, the choice falls back to All.
  const filterable = etfCount > 0 && etfCount < snap.holdings.length;
  const shownKind: HoldingKind = filterable ? kind : "all";
  const shownRows = shownKind === "all" ? snap.holdings : snap.holdings.filter((h) => h.etf === (shownKind === "etfs"));
  const group = shownRows.reduce((s, h) => ({ w: s.w + h.weightOpen, c: s.c + h.contribution, pnl: s.pnl + h.pnl }), { w: 0, c: 0, pnl: 0 });

  const hoursLabel = snap.status === "live" ? "today so far" : snap.status === "provisional" ? "today, at the closing quotes" : `on ${fmtDay(snap.session)}`;
  const line = (
    <>
      <Strong>
        <Tip label={fund ? "Fund" : scope.name}>{fund ? "The Fund's return today from the prior close, cash included." : EXPLAIN.teamReturn}</Tip> {fmtChangePct(pct(snap.ret))}
      </Strong>{" "}
      · P&amp;L {fmtChangeUsd(snap.pnl, 0)}
      {r.benchmarkReturn !== null && (
        <>
          {" "}· <Tip label="Benchmark">{fund ? EXPLAIN.benchmark : EXPLAIN.teamBenchmark}</Tip> {fmtChangePct(pct(r.benchmarkReturn))}
          {!fund && <span title={scope.benchmarkSectors}> ({scope.benchmarkName})</span>}
        </>
      )}
      {fund ? (
        <>
          {" "}· <Tip label={INDEX_LABEL}>{EXPLAIN.index}</Tip> {fmtChangePct(pct(snap.spx))}, Dow {fmtChangePct(pct(snap.dow))}
          {active !== null && (
            <>
              {" "}· {fmtChangeBp(bps(active))} <Tip label="vs S&P 500">{EXPLAIN.active}</Tip>
            </>
          )}
        </>
      ) : (
        <>
          {" "}· <Tip label="To the Fund">{EXPLAIN.fundContribution}</Tip> {fmtChangeBp(bps(teamR.fundContribution))}, {fmtPct(pct(teamR.avgFundWeight), 1)} of the Fund at the open
        </>
      )}
    </>
  );

  return (
    <>
      <PageHead
        crumbs={[{ label: "Portfolio" }]}
        scope
        asof={
          <>
            <Pill tone={status.tone} className="mr-1.5">
              {snap.status === "live" && <span className="mr-1.5 size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
              {status.label}
            </Pill>
            {statusLine(snap)}
          </>
        }
      />
      <Hero
        label={`${gap === null ? `${portfolioLabel} return` : "Against the sector benchmark"}, ${hoursLabel} · from the ${fmtDay(snap.base)} close`}
        value={gap === null ? fmtChangePct(pct(snap.ret)) : fmtChangeBp(bps(gap))}
        tone={signTone(gap ?? snap.ret, 10_000)}
        line={line}
        aside={<HeroNotes notices={notices} />}
      />
      <div className="mt-[22px]">
        <IntradayChart points={points} hours={snap.hours} portfolioLabel={portfolioLabel} benchmarkLabel={benchmarkLabel} />
      </div>
      <PeriodBar basePath={period.basePath} active="today" inception={period.inception} latest={period.latest}>
        <span className="flex items-center gap-3.5 text-caption text-muted-foreground">
          <LegendItem swatch={<LineKey line={FUND_LINE} />}>{portfolioLabel}</LegendItem>
          <LegendItem swatch={<LineKey line={BENCH_LINE} />}>{benchmarkLabel}</LegendItem>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={loading} aria-label="Refresh prices">
            <RefreshCw className={loading ? "animate-spin" : undefined} />
            Refresh
          </Button>
        </span>
      </PeriodBar>
      {cells ? (
        <StatStrip className="border-t-0" cells={cells} data-tour="attribution-strip" />
      ) : (
        <p className="border-b py-4 text-body text-muted-foreground">Add S&amp;P 500 sector weights to see allocation and selection.</p>
      )}
      <div className="mt-[26px] grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-14">
        <section aria-labelledby="perf-sectors">
          <h2 id="perf-sectors" className="text-title font-bold tracking-[-0.01em]">By sector</h2>
          <div className="mt-2">
            <SectorsPanel rows={r.sectors} hasBench={r.effects !== null} own={fund ? "Fund" : "Team"} totals={r} />
          </div>
        </section>
        {fund ? (
          <TeamBars rows={r.teams} teams={teams} cashContribution={r.cashContribution} cashWeight={r.sectors.find((s) => s.key === "cash")?.avgPortfolioWeight} portfolioReturn={r.portfolioReturn} query="?period=today" />
        ) : (
          <SectorEffectsSection
            data={r.effects ? r.sectors.map((s) => ({ sector: bucketLabel(s.key), allocation: s.allocation * 10_000, selection: s.selection * 10_000, interaction: s.interaction * 10_000, total: s.total * 10_000 })) : null}
            empty="No benchmark for this session."
          />
        )}
      </div>
      <section aria-labelledby="perf-live-holdings" className="mt-8">
        <SectionHead
          id="perf-live-holdings"
          title={<Tip label="Holdings">{EXPLAIN.contributors}</Tip>}
          sub={
            <>
              {snap.holdings.length} {snap.holdings.length === 1 ? "holding" : "holdings"} · {fmtUsd(snap.value, 0)} {fund ? "NAV" : "held"}
              {top && top.contribution > 0 && <> · {top.ticker} added the most, {fmtChangeBp(bps(top.contribution), 1)}</>}
              {bottom && bottom.contribution < 0 && <>; {bottom.ticker} cost the most, {fmtChangeBp(bps(bottom.contribution), 1)}</>}
            </>
          }
          aside={
            filterable && (
              <FilterChips label="Show holdings">
                <FilterChip onClick={() => setKind("all")} active={kind === "all"} count={snap.holdings.length}>All</FilterChip>
                <FilterChip onClick={() => setKind("stocks")} active={kind === "stocks"} count={snap.holdings.length - etfCount}>Stocks</FilterChip>
                <FilterChip onClick={() => setKind("etfs")} active={kind === "etfs"} count={etfCount}>ETFs</FilterChip>
              </FilterChips>
            )
          }
        />
        {filterable && shownKind !== "all" && (
          <p className="mt-2 text-body text-muted-foreground">
            {shownKind === "etfs" ? "ETFs" : "Stocks"}: {fmtPct(pct(group.w), 1)} of the {own} at the open, <Signed text={fmtChangeBp(bps(group.c), 1)} />, <Signed text={fmtChangeUsd(group.pnl, 0)} /> P&amp;L
          </p>
        )}
        <div className="mt-2">
          <LiveHoldingsTable rows={shownRows} teams={teams} showTeam={fund} own={own} />
        </div>
      </section>
      <HowNote>
        The same engine as the other periods, run on one session. While the market is open, today&apos;s prices are live quotes held in memory, never stored; returns are measured from the stored prior closes. Weights are set at
        the open, so a holding&apos;s contribution is its opening weight times its return today; its current weight drifts with the move. The PT sheet weights by end-of-day holdings, so a day with a trade can differ by a few
        bp. At 5:00 pm the price run stores the closes and 1D shows the same session.
      </HowNote>
    </>
  );
}
