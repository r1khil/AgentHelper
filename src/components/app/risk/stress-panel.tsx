import Link from "next/link";
import { Panel, PanelFooter, PanelHeader } from "@/components/app/panel";
import { STRESS_WINDOWS, type StressOk, type StressResult } from "@/lib/risk/stress";
import { cn } from "@/lib/utils";
import { InfoTip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rbp, rpct } from "./format";
import { ReadAs } from "../read-as";

// Below xl (a 1,045 px window gives this panel ~450 px) the window name and the three returns keep their columns and
// the dates move to a second line under the name; the Dates column stays in the table for screen readers.
const COLS = "grid grid-cols-[minmax(0,1fr)_76px_76px_70px] items-center gap-3 px-4 xl:grid-cols-[minmax(0,1fr)_140px_76px_76px_70px]";
/** The Dates header and cells: out of sight, but still read, below xl. */
const DATES = "sr-only xl:not-sr-only";
const tone = (v: number | null) => (v === null || Math.abs(v) < 5e-5 ? "text-muted-foreground" : v > 0 ? "text-up" : "text-down");
/** "2020-02-19 → 03-23", with the year left off the end when it matches the start. */
export const stressDates = (from: string, to: string) => (from === to ? from : `${from} → ${to.slice(0, 4) === from.slice(0, 4) ? to.slice(5) : to}`);
/** Detail below the fold: every window expandable to its path, contributions and working, plus the CSV downloads. */
export const STRESS_DETAIL = { id: "stress-detail", label: "Stress test detail", title: "Stress tests in detail" };
/** Anchor of a window's expanded row in the stress detail below the fold. */
export const stressAnchor = (key: string) => `stress-${key}`;
export const backtestHref = (r: StressOk) => `/backtesting?${new URLSearchParams({ from: r.backtestFrom, to: r.end, stress: r.key })}`;

/** Below xl, a window's dates under its name; the Dates column holds them for screen readers. */
function DatesLine({ from, to }: { from: string; to: string }) {
  return (
    <span aria-hidden className="block font-mono text-caption font-normal text-muted-foreground xl:hidden">
      {stressDates(from, to)}
    </span>
  );
}

function Head() {
  return (
    <div role="row" className={cn(COLS, "h-8 shrink-0 text-body text-muted-foreground")}>
      <span role="columnheader">Window</span>
      <span role="columnheader" className={DATES}>Dates</span>
      <span role="columnheader" className="text-right">Fund</span>
      <span role="columnheader" className="text-right">S&amp;P 500</span>
      <span role="columnheader" className="text-right" title="Fund return minus the S&P 500's, in basis points">
        <ReadAs text="Fund minus S&P 500, basis points">Diff</ReadAs>
      </span>
    </div>
  );
}

/**
 * The Risk page's stress-test panel: today's positions through each historical window, against the S&P 500. Each
 * window links to its expanded row (path, contributions, working) in the stress detail below the fold.
 */
export function StressPanel({ results, fundLabel, className }: { results: StressResult[]; fundLabel: string; className?: string }) {
  const ok = results.filter((r): r is StressOk => r.status === "ok");
  // The footer link replays the window where today's positions fell furthest.
  const worst = [...ok].sort((a, b) => a.fund - b.fund)[0];
  return (
    <Panel aria-label="Historical stress tests" variant="plain" className={className}>
      <PanelHeader
        title="Stress tests"
        aside={
          <>
            today&apos;s positions, buy and hold
            <InfoTip label="stress tests">{RISK_EXPLAIN.stressTests}</InfoTip>
          </>
        }
      />
      <div role="table" aria-label="Stress tests">
        <Head />
        {results.map((r) =>
          r.status === "ok" ? (
            <div key={r.key} role="row" className={cn(COLS, "min-h-11 border-t border-row text-body")}>
              <span role="rowheader" className="min-w-0 py-1 font-medium">
                <a href={`#${stressAnchor(r.key)}`} className="hover:underline" title={`${r.note} Open the day-by-day path and each holding's contribution.`}>
                  {r.label}
                </a>
                <DatesLine from={r.start} to={r.end} />
              </span>
              <span role="cell" className={cn("truncate font-mono text-caption text-muted-foreground", DATES)}>{stressDates(r.start, r.end)}</span>
              <span role="cell" className={cn("text-right font-mono text-body", tone(r.fund))} title={fundLabel}>{rpct(r.fund)}</span>
              <span role="cell" className="text-right font-mono text-body text-muted-foreground">{rpct(r.market)}</span>
              <span role="cell" className={cn("text-right font-mono text-body font-semibold", tone(r.fund - r.market))}>{rbp(r.fund - r.market)}</span>
            </div>
          ) : (
            <div key={r.key} role="row" className={cn(COLS, "min-h-11 border-t border-row text-body")}>
              <span role="rowheader" className="min-w-0 py-1 font-medium">{r.label}</span>
              <span role="cell" aria-colspan={4} className="col-span-3 py-1 text-caption text-muted-foreground xl:col-span-4">{stressDates(r.from, r.to)} · {r.reason}</span>
            </div>
          ),
        )}
      </div>
      <PanelFooter className="h-[42px] border-t-0 text-ink-2">
        Replay any window with different weights
        <span className="flex-1" />
        {worst && (
          <Link href={backtestHref(worst)} title={`Opens ${worst.label} in Backtesting with its dates filled in`} className="font-semibold whitespace-nowrap text-foreground hover:underline">
            Open in Backtesting →
          </Link>
        )}
      </PanelFooter>
    </Panel>
  );
}

export function StressPanelFallback({ className }: { className?: string }) {
  return (
    <Panel aria-label="Historical stress tests" aria-busy variant="plain" className={className}>
      <PanelHeader title="Stress tests" aside="today's positions, buy and hold" />
      <div role="table" aria-label="Stress tests">
        <Head />
        {STRESS_WINDOWS.map((w) => (
          <div key={w.key} role="row" className={cn(COLS, "min-h-11 border-t border-row text-body")}>
            <span role="rowheader" className="min-w-0 py-1 font-medium">
              {w.label}
              <DatesLine from={w.from} to={w.to} />
            </span>
            <span role="cell" className={cn("truncate font-mono text-caption text-muted-foreground", DATES)}>{stressDates(w.from, w.to)}</span>
            <span role="cell" aria-colspan={3} className="col-span-3 text-right text-body text-muted-foreground">loading…</span>
          </div>
        ))}
      </div>
      <PanelFooter className="h-[42px] border-t-0 text-ink-2">Replay any window with different weights</PanelFooter>
    </Panel>
  );
}
