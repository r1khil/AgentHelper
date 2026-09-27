import Link from "next/link";
import { Panel, PanelFooter, PanelHeader } from "@/components/app/panel";
import { STRESS_WINDOWS, type StressOk, type StressResult } from "@/lib/risk/stress";
import { cn } from "@/lib/utils";
import { InfoTip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rsigned } from "./format";

const COLS = "grid grid-cols-[minmax(0,1fr)_140px_76px_76px_70px] items-center gap-3 px-4";
const tone = (v: number | null) => (v === null || Math.abs(v) < 5e-5 ? "text-muted-foreground" : v > 0 ? "text-up" : "text-down");
/** "2020-02-19 → 03-23", with the year left off the end when it matches the start. */
export const stressDates = (from: string, to: string) => (from === to ? from : `${from} → ${to.slice(0, 4) === from.slice(0, 4) ? to.slice(5) : to}`);
/** Detail below the fold: every window expandable to its path, contributions and working, plus the CSV downloads. */
export const STRESS_DETAIL = { id: "stress-detail", label: "Stress test detail", title: "Stress tests in detail" };
/** Anchor of a window's expanded row in the stress detail below the fold. */
export const stressAnchor = (key: string) => `stress-${key}`;
export const backtestHref = (r: StressOk) => `/backtesting?${new URLSearchParams({ from: r.backtestFrom, to: r.end, stress: r.key })}`;

const pp = (v: number) => {
  const x = v * 100;
  return `${x > 0.05 ? "+" : ""}${x.toFixed(1)} pp`;
};

function Head() {
  return (
    <div className={cn(COLS, "h-8 shrink-0 text-xs text-muted-foreground")}>
      <span>Window</span>
      <span>Dates</span>
      <span className="text-right">Fund</span>
      <span className="text-right">S&amp;P 500</span>
      <span className="text-right" title="Fund return minus the S&P 500's, in percentage points">Diff</span>
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
    <Panel aria-label="Historical stress tests" className={className}>
      <PanelHeader
        title="Stress tests"
        aside={
          <>
            today&apos;s positions, buy and hold
            <InfoTip label="stress tests">{RISK_EXPLAIN.stressTests}</InfoTip>
          </>
        }
      />
      <Head />
      {results.map((r) =>
        r.status === "ok" ? (
          <div key={r.key} className={cn(COLS, "min-h-11 flex-1 border-t border-row text-[13.5px]")}>
            <a href={`#${stressAnchor(r.key)}`} className="truncate font-medium hover:underline" title={`${r.note} Open the day-by-day path and each holding's contribution.`}>
              {r.label}
            </a>
            <span className="truncate font-mono text-[11.5px] text-muted-foreground">{stressDates(r.start, r.end)}</span>
            <span className={cn("text-right font-mono text-[12.5px]", tone(r.fund))} title={fundLabel}>{rsigned(r.fund)}</span>
            <span className="text-right font-mono text-[12.5px] text-muted-foreground">{rsigned(r.market)}</span>
            <span className={cn("text-right font-mono text-[12.5px] font-semibold", tone(r.fund - r.market))}>{pp(r.fund - r.market)}</span>
          </div>
        ) : (
          <div key={r.key} className={cn(COLS, "min-h-11 flex-1 border-t border-row text-[13.5px]")}>
            <span className="truncate font-medium">{r.label}</span>
            <span className="col-span-4 truncate text-xs text-muted-foreground" title={r.reason}>{stressDates(r.from, r.to)} · {r.reason}</span>
          </div>
        ),
      )}
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
    <Panel aria-label="Historical stress tests" aria-busy className={className}>
      <PanelHeader title="Stress tests" aside="today's positions, buy and hold" />
      <Head />
      {STRESS_WINDOWS.map((w) => (
        <div key={w.key} className={cn(COLS, "min-h-11 flex-1 border-t border-row text-[13.5px]")}>
          <span className="truncate font-medium">{w.label}</span>
          <span className="truncate font-mono text-[11.5px] text-muted-foreground">{stressDates(w.from, w.to)}</span>
          <span className="col-span-3 text-right text-xs text-muted-foreground">loading…</span>
        </div>
      ))}
      <PanelFooter className="h-[42px] border-t-0 text-ink-2">Replay any window with different weights</PanelFooter>
    </Panel>
  );
}
