import { SectionHead } from "@/components/app/portfolio/parts";
import { ReadAs } from "@/components/app/read-as";
import { fmtDate, fmtDayMonth } from "@/lib/format";
import { STRESS_WINDOWS, type StressOk } from "@/lib/risk/stress";
import { cn } from "@/lib/utils";
import { Tip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";

/** Scenario, window, then Fund, Benchmark, Gap and what it would be on today's value. */
export const STRESS_COLS = "grid grid-cols-[130px_minmax(0,1fr)_74px_84px_76px_112px] gap-x-3 xl:grid-cols-[160px_minmax(0,1fr)_90px_100px_90px_140px]";
export const STRESS_COLUMNS = 6;

/** "Feb 19 – Mar 23, 2020": the year once when both ends share it. */
export const stressDates = (from: string, to: string) => (from === to ? fmtDate(from) : from.slice(0, 4) === to.slice(0, 4) ? `${fmtDayMonth(from)} – ${fmtDate(to)}` : `${fmtDate(from)} – ${fmtDate(to)}`);
/** The section's anchor: a link to `#stress-tests` (or one window's `#stress-covid`) opens it. */
export const STRESS_DETAIL = { id: "stress-tests", label: "Stress tests", title: "Stress tests" };
/** Anchor of a window's row, which a link to `#stress-<key>` opens. */
export const stressAnchor = (key: string) => `stress-${key}`;
export const backtestHref = (r: StressOk) => `/backtesting?${new URLSearchParams({ from: r.backtestFrom, to: r.end, stress: r.key })}`;

/** The heading of the stress table's section: what the tests are, in one line. */
export function StressHead({ aside }: { aside?: React.ReactNode }) {
  return (
    <SectionHead
      id="stress-heading"
      title="Stress tests"
      sub={
        <>
          <Tip label="Today's positions, buy-and-hold">{RISK_EXPLAIN.stressTests}</Tip>, through each historical window, against the sector benchmark replayed the same way. Dollars on today&apos;s value.
        </>
      }
      aside={aside}
    />
  );
}

export function StressColumnHeads({ fundLabel = "Fund" }: { fundLabel?: string }) {
  return (
    <div role="row" className={cn(STRESS_COLS, "min-h-[34px] items-center border-b text-caption text-muted-foreground")}>
      <span role="columnheader">Scenario</span>
      <span role="columnheader">Window</span>
      <span role="columnheader" className="text-right"><Tip label={fundLabel} side="bottom">{RISK_EXPLAIN.stressFund}</Tip></span>
      <span role="columnheader" className="text-right"><Tip label="Benchmark" side="bottom">{RISK_EXPLAIN.stressBenchmark}</Tip></span>
      <span role="columnheader" className="text-right"><Tip label={<ReadAs text="Fund minus benchmark, basis points">Gap</ReadAs>} side="bottom">{RISK_EXPLAIN.stressActive}</Tip></span>
      <span role="columnheader" className="text-right"><Tip label="On today's value" side="bottom">{RISK_EXPLAIN.stressDollars}</Tip></span>
    </div>
  );
}

/** The stress tests while their stored closes load: the four windows by name and date. */
export function StressPanelFallback({ className }: { className?: string }) {
  return (
    <section aria-label="Stress tests" aria-busy className={className}>
      <StressHead />
      <div role="table" aria-label="Stress tests" className="mt-2 text-body">
        <StressColumnHeads />
        {STRESS_WINDOWS.map((w) => (
          <div key={w.key} role="row" className={cn(STRESS_COLS, "min-h-10 items-center border-b border-row")}>
            <span role="rowheader" className="font-semibold">{w.label}</span>
            <span role="cell" className="text-muted-foreground">{stressDates(w.from, w.to)}</span>
            <span role="cell" aria-colspan={4} className="col-span-4 text-right text-muted-foreground">loading…</span>
          </div>
        ))}
      </div>
    </section>
  );
}
