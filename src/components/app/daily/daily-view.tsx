"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, Pill, StatStrip, type PillTone, type StatCell } from "@/components/app/panel";
import { EffectsPanel, MethodPanel, type EffectBar } from "@/components/app/attribution/attribution-panels";
import type { TeamLookup } from "@/components/app/attribution/contributors-table";
import { DataNoticesButton } from "@/components/app/attribution/data-quality-notice";
import { EXPLAIN } from "@/components/app/attribution/explainers";
import { bps, pct, toneOf } from "@/components/app/attribution/format";
import { Tip } from "@/components/app/attribution/info-tip";
import { InteractionScope } from "@/components/app/attribution/interaction-toggle";
import { SectorsPanel } from "@/components/app/attribution/sectors-panel";
import type { TeamAttributionResult } from "@/lib/attribution/attribution";
import type { LiveSnapshot, LiveStatus, PathPoint } from "@/lib/attribution/live";
import { bucketLabel, INDEX_LABEL } from "@/lib/attribution/sectors";
import { fmtBp, fmtDateTime, fmtDay, fmtPct, fmtTime, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IntradayChart } from "./intraday-chart";
import { LiveHoldingsTable } from "./live-holdings-table";

/** Numbers every minute while the market is open; the chart every five (its bars are five minutes apart). */
const REFRESH_MS = 60_000;
const PATH_MS = 5 * 60_000;
/** After the bell and before the price run: look for the stored closes every five minutes. */
const PROVISIONAL_MS = 5 * 60_000;

const GRID = "grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]";

const STATUS: Record<LiveStatus, { label: string; tone: PillTone }> = {
  live: { label: "Live", tone: "good" },
  provisional: { label: "Closed · provisional", tone: "caution" },
  final: { label: "Final", tone: "neutral" },
};

export type DailyScope = { kind: "fund" } | { kind: "team"; slug: string; name: string; benchmarkName: string; benchmarkSectors: string };

function statusLine(s: LiveSnapshot) {
  const session = `${fmtDay(s.session)} · from the ${fmtDay(s.base)} close`;
  if (s.status === "live") return `${session} · prices as of ${s.asOf ? fmtTime(s.asOf) : "—"}`;
  if (s.status === "provisional") return `${session} · closing quotes until the 5:00 pm price run stores the closes`;
  return s.phase === "open" ? session : `${session} · market opens ${fmtDateTime(s.opensAt)}`;
}

export function DailyView({ initial, scope, teams: teamList }: { initial: LiveSnapshot; scope: DailyScope; teams: [string, { name: string; slug: string }][] }) {
  const [snap, setSnap] = useState(initial);
  const [points, setPoints] = useState<PathPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
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
      const due =
        (snap.status === "live" && since >= REFRESH_MS - 1000) ||
        (snap.status === "provisional" && since >= PROVISIONAL_MS - 1000) ||
        (snap.status === "final" && snap.phase !== "open" && now >= Date.parse(snap.opensAt) && since >= REFRESH_MS - 1000);
      if (due) void loadSnap();
      if (snap.status === "live" && now - lastPath.current >= PATH_MS - 1000) void loadPath();
    };
    const timer = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [snap.status, snap.phase, snap.opensAt, loadSnap, loadPath]);

  const r = snap.result;
  const fund = scope.kind === "fund";
  const own = fund ? "Fund" : "team";
  const status = STATUS[snap.status];
  const active = snap.spx === null ? null : snap.ret - snap.spx;

  const cells: StatCell[] = fund
    ? [
        { label: <Tip label="Owl Fund" side="bottom">The Fund&apos;s return today from the prior close, cash included.</Tip>, value: fmtPct(pct(snap.ret)), tone: toneOf(snap.ret), note: <>P&amp;L {fmtUsd(snap.pnl, 0)}</> },
        { label: <Tip label={INDEX_LABEL} side="bottom">{EXPLAIN.index}</Tip>, value: fmtPct(pct(snap.spx)), note: "Index, price return" },
        { label: "Dow", value: fmtPct(pct(snap.dow)), note: "Index, price return" },
        { label: <Tip label={`Active vs ${INDEX_LABEL}`} side="bottom">{EXPLAIN.active}</Tip>, value: fmtBp(bps(active)), tone: toneOf(active), note: "Fund minus index" },
        {
          label: <Tip label="vs sector benchmark" side="bottom">{EXPLAIN.benchmark}</Tip>,
          value: fmtBp(bps(r.activeReturn)),
          tone: toneOf(r.activeReturn),
          note: r.benchmarkReturn === null ? "Needs sector weights" : `Benchmark ${fmtPct(pct(r.benchmarkReturn))}`,
        },
      ]
    : [
        { label: <Tip label={scope.name} side="bottom">{EXPLAIN.teamReturn}</Tip>, value: fmtPct(pct(snap.ret)), tone: toneOf(snap.ret), note: <>P&amp;L {fmtUsd(snap.pnl, 0)}</> },
        { label: <Tip label="Sector benchmark" side="bottom">{EXPLAIN.teamBenchmark}</Tip>, value: fmtPct(pct(r.benchmarkReturn)), note: <span title={scope.benchmarkSectors}>{scope.benchmarkName}</span> },
        { label: <Tip label="Active vs benchmark" side="bottom">{EXPLAIN.teamActive}</Tip>, value: fmtBp(bps(r.activeReturn)), tone: toneOf(r.activeReturn), note: "Team minus benchmark" },
        { label: <Tip label="To the Fund" side="bottom">{EXPLAIN.fundContribution}</Tip>, value: fmtBp(bps((r as TeamAttributionResult).fundContribution)), tone: toneOf((r as TeamAttributionResult).fundContribution), note: `${fmtPct(pct((r as TeamAttributionResult).avgFundWeight), 1)} of the Fund at the open` },
      ];

  const effects: EffectBar[] = r.effects
    ? fund
      ? [
          { label: "Allocation", value: r.effects.allocation, explain: EXPLAIN.allocation },
          { label: "Selection", value: r.effects.selection, explain: EXPLAIN.selection },
          { label: "Interaction", value: r.effects.interaction, explain: `${EXPLAIN.interaction} Weight × pick.`, interaction: true },
        ]
      : [
          { label: "Selection", value: r.effects.selection + r.effects.interaction, explain: EXPLAIN.teamSelection },
          { label: "Allocation", value: r.effects.allocation, explain: `${EXPLAIN.teamAllocation} Mix across team sectors.` },
        ]
    : [];
  const total: EffectBar | null = r.effects && r.activeReturn !== null ? { label: "Total", value: r.activeReturn, explain: `${fund ? EXPLAIN.benchmark : EXPLAIN.teamBenchmark} Brinson-Fachler, one day.` } : null;
  const top = r.holdings[0];
  const bottom = r.holdings.at(-1);
  const leader = r.effects ? [...r.sectors].filter((s) => s.key !== "cash").sort((a, b) => b.selection + b.interaction - (a.selection + a.interaction))[0] : undefined;
  const note = (
    <>
      {top && top.contribution > 0 && <>{top.ticker} added the most, {fmtBp(bps(top.contribution))}. </>}
      {bottom && bottom.contribution < 0 && <>{bottom.ticker} cost the most, {fmtBp(bps(bottom.contribution))}. </>}
      {leader && leader.selection + leader.interaction > 0 && <>Best picks in {bucketLabel(leader.key)}.</>}
    </>
  );
  const notices = [...(failed ? ["The last refresh failed; these are the numbers from before it."] : []), ...snap.notes].map((text) => ({ text }));
  const portfolioLabel = fund ? "Owl Fund" : scope.name;
  const benchmarkLabel = fund ? INDEX_LABEL : "Sector benchmark";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <InteractionScope className="flex flex-col gap-4">
        <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2">
          <Pill tone={status.tone}>
            {snap.status === "live" && <span className="mr-1.5 size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
            {status.label}
          </Pill>
          <span className="text-body whitespace-nowrap text-muted-foreground">{statusLine(snap)}</span>
          <span className="flex-1" />
          <DataNoticesButton notices={notices} />
          <Button variant="outline" onClick={refresh} disabled={loading} aria-label="Refresh prices">
            <RefreshCw className={cn(loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
        <StatStrip cells={cells} />
        <div className={`${GRID} lg:min-h-[252px]`}>
          <section className="panel-plain flex min-w-0 flex-col px-4 pt-2 pb-3" aria-label="Today so far">
            <div className="flex min-h-7 shrink-0 items-center gap-3.5">
              <h2 className="text-emph font-semibold whitespace-nowrap">
                <Tip label="Today so far">Both lines from the prior close in five-minute steps. Holdings are weighted as they stood at the open; cash is flat. The gap between the lines is the active return so far.</Tip>
              </h2>
              <Legend color="var(--series-1)">{portfolioLabel}</Legend>
              <Legend color="var(--series-neutral)">{benchmarkLabel}</Legend>
            </div>
            <div className="mt-2.5 flex min-h-0 flex-1 flex-col">
              <IntradayChart points={points} hours={snap.hours} portfolioLabel={portfolioLabel} benchmarkLabel={benchmarkLabel} />
            </div>
          </section>
          <EffectsPanel items={effects} total={total} aside={fund ? "vs sector benchmark, bp" : `vs ${scope.benchmarkName}, bp`} note={note} empty="Add S&P 500 sector weights to see allocation and selection." />
        </div>
        <div className={`${GRID} lg:items-start`}>
          <Panel>
            <PanelHeader title={<Tip label="Holdings">{EXPLAIN.contributors}</Tip>} count={snap.holdings.length} aside={`${fmtUsd(snap.value, 0)} ${fund ? "NAV" : "held"}`} />
            <LiveHoldingsTable rows={snap.holdings} teams={teams} showTeam={fund} own={own} />
          </Panel>
          <div className="flex min-w-0 flex-col gap-5">
            <SectorsPanel rows={r.sectors} hasBench={r.effects !== null} own={fund ? "Fund" : "Team"} />
            <MethodPanel>
              The same engine as Attribution, run on one session. While the market is open, today&apos;s prices are live quotes held in memory, never stored; returns are measured
              from the stored prior closes. Weights are set at the open, so a holding&apos;s contribution is its opening weight times its return today; its current weight
              drifts with the move. The PT sheet weights by end-of-day holdings, so a day with a trade can differ by a few bp. At 5:00 pm the price run stores the closes and
              Attribution&apos;s 1D shows the same session.
            </MethodPanel>
          </div>
        </div>
      </InteractionScope>
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[5px] text-body text-ink-2">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}
