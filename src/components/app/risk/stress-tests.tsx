import Link from "next/link";
import { ChevronRight, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fmtDate } from "@/lib/format";
import type { StressOk, StressResult } from "@/lib/risk/stress";
import { cn } from "@/lib/utils";
import { Explained } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rpct, rsigned, rusd, rusdFull } from "./format";
import { StressPathChart } from "./stress-path-chart";
import { SectionHead } from "./section-head";
import { backtestHref, stressAnchor, stressDates } from "./stress-panel";
import { Source, Step, Working } from "./working";

const tone = (v: number | null) => (v === null || Math.abs(v) < 5e-5 ? "" : v > 0 ? "text-up" : "text-down");
/** Window, five figures, worst contributors, stood-in count. Below md the same cells wrap into a four-column card. */
const GRID = "grid grid-cols-4 items-baseline gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,0.75fr))_minmax(0,1.6fr)_minmax(0,0.55fr)] md:gap-x-4";
const HEAD = [
  { label: "Fund", explain: RISK_EXPLAIN.stressFund },
  { label: "S&P 500", explain: RISK_EXPLAIN.stressMarket },
  { label: "Sector bench.", explain: RISK_EXPLAIN.stressBenchmark },
  { label: "Active", explain: RISK_EXPLAIN.stressActive },
  { label: "On today's value", explain: RISK_EXPLAIN.stressDollars },
  { label: "Worst contributors", explain: RISK_EXPLAIN.stressWorst },
  { label: "Stood in", explain: RISK_EXPLAIN.stressProxy },
];

/**
 * Historical stress tests on the Risk page: one row per window, expanding to its path, every
 * holding's contribution and (in transparency mode) the arithmetic behind the row.
 */
export function StressTests({
  results,
  fundLabel,
  scopeLabel,
  benchmarkLabel,
  transparency,
  exportQuery,
  backtesting = true,
  label = "Historical stress tests",
  title = "Historical stress tests",
  id,
}: {
  results: StressResult[];
  /** Name of the portfolio line, e.g. "Fund" or "Tech sleeve". */
  fundLabel: string;
  /** What the dollar impact is measured on, e.g. "NAV". */
  scopeLabel: string;
  benchmarkLabel: string;
  transparency: boolean;
  /** Query for the CSV downloads, e.g. "&team=tech"; null hides them. */
  exportQuery: string | null;
  /** Link each window to Backtesting with its dates. */
  backtesting?: boolean;
  /** The section's accessible name; the Risk page's summary panel owns "Historical stress tests". */
  label?: string;
  title?: string;
  id?: string;
}) {
  const download = (file: string, label: string) => (
    <a href={`/api/risk/export?file=${file}${exportQuery ?? ""}`} className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2" download>
      <Download className="size-3" aria-hidden />
      {label}
    </a>
  );
  return (
    <section id={id} aria-label={label} className="scroll-mt-4">
      <SectionHead aside={<Explained label="Today's positions, buy-and-hold" align="right">{RISK_EXPLAIN.stressTests}</Explained>}>{title}</SectionHead>
      <Card className="gap-0 overflow-hidden p-0">
        <div className={cn(GRID, "hidden border-b px-4 py-2 pl-10 text-xs font-medium text-muted-foreground md:grid")}>
          <span>Window</span>
          {HEAD.map((h, i) => (
            <span key={h.label} className={i < 5 || i === 6 ? "text-right" : undefined}>
              <Explained label={h.label} align={i < 5 || i === 6 ? "right" : "left"}>{h.explain}</Explained>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b px-4 py-2 text-[11px] text-muted-foreground md:hidden">
          {HEAD.map((h) => (
            <Explained key={h.label} label={h.label}>{h.explain}</Explained>
          ))}
        </div>
        {results.map((r) =>
          r.status === "ok" ? (
            <StressRow key={r.key} r={r} fundLabel={fundLabel} scopeLabel={scopeLabel} benchmarkLabel={benchmarkLabel} transparency={transparency} backtesting={backtesting} />
          ) : (
            <div key={r.key} className="border-b px-4 py-3 text-sm last:border-b-0">
              <span className="font-medium">{r.label}</span> <span className="text-muted-foreground">· {fmtDate(r.from)} – {fmtDate(r.to)} · {r.reason}</span>
            </div>
          ),
        )}
      </Card>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Replays, not forecasts: they show how today&apos;s book would have moved through each episode.</span>
        {exportQuery !== null && (
          <>
            {download("stress", "Stress results (CSV)")}
            {download("stress-paths", "Daily paths (CSV)")}
          </>
        )}
      </p>
    </section>
  );
}

function StressRow({ r, fundLabel, scopeLabel, benchmarkLabel, transparency, backtesting }: { r: StressOk; fundLabel: string; scopeLabel: string; benchmarkLabel: string; transparency: boolean; backtesting: boolean }) {
  const small = "text-[11px] text-muted-foreground md:hidden";
  const stoodIn = r.holdings.filter((h) => h.proxied);
  return (
    <details id={stressAnchor(r.key)} className="group scroll-mt-4 border-b border-row last:border-b-0">
      <summary className="cursor-pointer list-none px-4 py-3 hover:bg-band [&::-webkit-details-marker]:hidden">
        <div className="flex items-start gap-2">
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
          <div className={cn(GRID, "tnum min-w-0 flex-1 text-sm")}>
            <div className="col-span-3 min-w-0 md:col-span-1">
              <div className="font-medium">{r.label}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{stressDates(r.start, r.end)}</div>
            </div>
            <div className="text-right">
              <div className={cn("font-mono text-base font-semibold md:text-[12.5px]", tone(r.fund))}>{rsigned(r.fund)}</div>
              <div className={small}>{fundLabel}</div>
            </div>
            <Figure label="S&P 500" value={rsigned(r.market)} className={tone(r.market)} />
            <Figure label="Sector bench." value={rsigned(r.benchmark)} className={tone(r.benchmark)} />
            <Figure label="Active" value={r.active === null ? "—" : `${r.active > 0 ? "+" : ""}${(r.active * 100).toFixed(1)} pp`} className={tone(r.active)} />
            <Figure label={`On ${scopeLabel}`} value={rusd(r.dollars)} className={cn("font-medium", tone(r.dollars))} />
            <div className="col-span-4 min-w-0 text-xs md:col-span-1">
              <span className="text-muted-foreground md:hidden">Worst: </span>
              {r.worst.map((h, i) => (
                <span key={h.ticker}>
                  {i > 0 && ", "}
                  <span className="whitespace-nowrap">
                    {h.ticker} <span className={tone(h.contribution)}>{rsigned(h.contribution, 2)}</span>
                  </span>
                </span>
              ))}
            </div>
            <div className="col-span-4 text-xs text-muted-foreground md:col-span-1 md:text-right">
              <span className="md:hidden">Stood in: </span>
              {r.proxied ? <span className="text-foreground">{r.proxied}</span> : "none"}
            </div>
          </div>
        </div>
      </summary>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-dashed bg-muted/20 px-4 py-4 md:pl-10">
        <p className="text-xs text-muted-foreground">
          {r.note} Bought at the {fmtDate(r.start)} close, valued at the {fmtDate(r.end)} close ({r.sessions} sessions){r.cashWeight > 0 ? `, with ${rpct(r.cashWeight)} in cash at 0%` : ""}. Impact on today&apos;s {scopeLabel}: <b className={cn("tnum", tone(r.dollars))}>{rusdFull(r.dollars)}</b>.
        </p>
        {stoodIn.length > 0 && (
          <p className="text-xs">
            <span className="font-medium">Stood in: </span>
            {stoodIn.map((h, i) => (
              <span key={h.ticker}>
                {i > 0 && "; "}
                {h.ticker} uses {h.series} ({h.proxyReason})
              </span>
            ))}
            .
          </p>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-5">
            <StressPathChart data={r.path} fundLabel={fundLabel} benchmarkLabel={benchmarkLabel} />
          </div>
          <div className="min-w-0 lg:col-span-7">
            <ContributionTable r={r} />
          </div>
        </div>
        {transparency && <StressWorking r={r} />}
        {backtesting && (
          <div className="text-xs">
            <Link href={backtestHref(r)} className="font-medium underline underline-offset-2 hover:text-foreground">
              Open in Backtesting →
            </Link>
            <span className="text-muted-foreground"> with {fmtDate(r.backtestFrom)} – {fmtDate(r.end)} filled in. Backtesting replays saved weights rebalanced daily, so its result will differ.</span>
          </div>
        )}
      </div>
    </details>
  );
}

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="md:text-right">
      <div className={cn("font-mono text-[12.5px] whitespace-nowrap", className)}>{value}</div>
      <div className="text-[11px] text-muted-foreground md:hidden">{label}</div>
    </div>
  );
}

function ContributionTable({ r }: { r: StressOk }) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border bg-background">
      <table className="tnum w-full text-xs whitespace-nowrap">
        <thead className="sticky top-0 bg-background text-muted-foreground">
          <tr className="border-b">
            <th className="px-2 py-1.5 text-left font-medium">Holding</th>
            <th className="px-2 py-1.5 text-right font-medium">Weight</th>
            <th className="px-2 py-1.5 text-right font-medium">Return</th>
            <th className="px-2 py-1.5 text-right font-medium">
              <Explained label="Contribution" align="right">{RISK_EXPLAIN.stressWorst}</Explained>
            </th>
            <th className="px-2 py-1.5 text-right font-medium">Dollars</th>
          </tr>
        </thead>
        <tbody>
          {r.holdings.map((h) => (
            <tr key={h.ticker} className="border-b border-border/50">
              <td className="px-2 py-1">
                <span className="font-mono font-semibold">{h.ticker}</span>
                {h.proxied && <span className="ml-1.5 rounded border px-1 py-px text-[10px] text-muted-foreground" title={h.proxyReason ?? undefined}>via {h.series}</span>}
              </td>
              <td className="px-2 py-1 text-right">{rpct(h.weight)}</td>
              <td className={cn("px-2 py-1 text-right", tone(h.ret))}>{rsigned(h.ret)}</td>
              <td className={cn("px-2 py-1 text-right font-medium", tone(h.contribution))}>{rsigned(h.contribution, 2)}</td>
              <td className={cn("px-2 py-1 text-right", tone(h.dollars))}>{rusd(h.dollars)}</td>
            </tr>
          ))}
          {r.cashWeight > 0 && (
            <tr className="border-b border-border/50 text-muted-foreground">
              <td className="px-2 py-1">Cash</td>
              <td className="px-2 py-1 text-right">{rpct(r.cashWeight)}</td>
              <td className="px-2 py-1 text-right">0.0%</td>
              <td className="px-2 py-1 text-right">0.00%</td>
              <td className="px-2 py-1 text-right">$0</td>
            </tr>
          )}
        </tbody>
        <tfoot className="sticky bottom-0 bg-background font-medium">
          <tr className="border-t">
            <td className="px-2 py-1.5">Total</td>
            <td className="px-2 py-1.5 text-right">{rpct(r.cashWeight + r.holdings.reduce((s, h) => s + h.weight, 0))}</td>
            <td />
            <td className={cn("px-2 py-1.5 text-right", tone(r.fund))}>{rsigned(r.fund, 2)}</td>
            <td className={cn("px-2 py-1.5 text-right", tone(r.dollars))}>{rusd(r.dollars)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StressWorking({ r }: { r: StressOk }) {
  const pp = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(3)}%`;
  const sum = r.holdings.reduce((s, h) => s + h.contribution, 0);
  const nav = r.fund === 0 ? null : r.dollars / r.fund;
  return (
    <Working>
      <Step label="Portfolio">Σ wᵢ × (Gᵢ − 1) over {r.holdings.length} holdings = {pp(sum)}{r.cashWeight > 0 ? ` + cash ${rpct(r.cashWeight)} × 0` : ""} = <b className="whitespace-nowrap">{pp(r.fund)}</b></Step>
      <Step label="Largest terms">{r.holdings.slice(0, 5).map((h) => `${h.ticker} ${rpct(h.weight, 2)} × ${pp(h.ret)}`).join(" + ")} + …</Step>
      {nav !== null && <Step label="On today's value">{pp(r.fund)} × {rusdFull(nav)} = <b className="whitespace-nowrap">{rusdFull(r.dollars)}</b></Step>}
      {r.benchmark !== null && (
        <Step label="Sector benchmark">
          {r.benchmarkLegs.map((l) => `${l.etf} ${rpct(l.weight, 1)} × ${pp(l.ret)}`).join(" + ")} = <b className="whitespace-nowrap">{pp(r.benchmark)}</b>
        </Step>
      )}
      {r.active !== null && <Step label="Active">{pp(r.fund)} − {pp(r.benchmark!)} = <b className="whitespace-nowrap">{pp(r.active)}</b></Step>}
      <Step label="S&P 500">SPY growth of $1 {fmtDate(r.start)} → {fmtDate(r.end)}, dividends reinvested, − 1 = <b className="whitespace-nowrap">{pp(r.market)}</b></Step>
      <Step label="Rebalanced daily instead">Π (1 + Σ wᵢ rᵢ,ₜ) − 1 = {pp(r.rebalanced)} (buy-and-hold minus rebalanced: {((r.fund - r.rebalanced) * 100).toFixed(2)} pp). <span className="text-muted-foreground">{RISK_EXPLAIN.stressRebalanced}</span></Step>
      <Source>Gᵢ = Π (closeₜ + dividendₜ) ÷ closeₜ₋₁ from stored Yahoo Finance closes (split-adjusted) and dividends on ex-dates; the Stress results CSV has every term, the Daily paths CSV each series.</Source>
    </Working>
  );
}
