import Link from "next/link";
import { Download } from "lucide-react";
import { ExpandRow } from "@/components/app/portfolio/expand-row";
import { Signed } from "@/components/app/portfolio/parts";
import { fmtAccounting, fmtChangeBp, fmtDate } from "@/lib/format";
import type { StressOk, StressResult } from "@/lib/risk/stress";
import { cn } from "@/lib/utils";
import { Tip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "./explainers";
import { rbp, rpct, rusd, rusdFull } from "./format";
import { StressPathChart } from "./stress-path-chart";
import { backtestHref, stressAnchor, StressColumnHeads, StressHead, STRESS_COLS, STRESS_COLUMNS, STRESS_DETAIL, stressDates } from "./stress-panel";
import { Source, Step, Working } from "./working";

/** Fund, benchmark or a gap as a figure in accounting style, coloured by sign. */
const pctText = (v: number | null) => (v === null ? "—" : rpct(v));
const tone = (v: number | null) => (v === null || Math.abs(v) < 5e-5 ? "" : v > 0 ? "text-up" : "text-down");

/**
 * Historical stress tests on the Risk page: today's positions through each historical window, against the sector
 * benchmark replayed the same way. One row per window; a row opens to its path, the S&P 500, the worst contributors, every
 * holding's contribution and (in transparency mode) the arithmetic behind it.
 */
export function StressTests({
  results,
  fundLabel,
  scopeLabel,
  benchmarkLabel,
  transparency,
  exportQuery,
  backtesting = true,
  label = STRESS_DETAIL.label,
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
  /** The section's accessible name. */
  label?: string;
  title?: string;
  id?: string;
}) {
  const ok = results.filter((r): r is StressOk => r.status === "ok");
  // The section's link replays the window where today's positions fell furthest.
  const worst = [...ok].sort((a, b) => a.fund - b.fund)[0];
  const download = (file: string, text: string) => (
    <a href={`/api/risk/export?file=${file}${exportQuery ?? ""}`} className="inline-flex items-center gap-1 font-semibold text-foreground underline underline-offset-2" download>
      <Download className="size-3" aria-hidden />
      {text}
    </a>
  );
  return (
    <section id={STRESS_DETAIL.id} aria-label={label} className="mt-[34px] scroll-mt-4">
      <StressHead
        aside={
          backtesting &&
          worst && (
            <Link href={backtestHref(worst)} title={`Opens ${worst.label} in Backtesting with its dates filled in`} className="font-semibold text-foreground hover:underline">
              Replay the worst in Backtesting →
            </Link>
          )
        }
      />
      <div role="table" aria-label="Stress tests" className="mt-2 text-body">
        <StressColumnHeads fundLabel={fundLabel} />
        {results.map((r) =>
          r.status === "ok" ? (
            <StressRow key={r.key} r={r} fundLabel={fundLabel} scopeLabel={scopeLabel} benchmarkLabel={benchmarkLabel} transparency={transparency} backtesting={backtesting} />
          ) : (
            <div key={r.key} role="row" className={cn(STRESS_COLS, "min-h-10 items-center border-b border-row")}>
              <span role="rowheader" className="font-semibold">{r.label}</span>
              <span role="cell" aria-colspan={STRESS_COLUMNS - 1} className="col-span-5 text-muted-foreground">
                {stressDates(r.from, r.to)} · {r.reason}
              </span>
            </div>
          ),
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
        <span>Replays, not forecasts: they show how today&apos;s book would have moved through each episode. Select a window for its path and holdings.</span>
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
  const stoodIn = r.holdings.filter((h) => h.proxied);
  return (
    <ExpandRow
      id={stressAnchor(r.key)}
      grid={STRESS_COLS}
      span={STRESS_COLUMNS}
      name={r.label}
      cells={
        <>
          <span role="cell" className="text-muted-foreground" title={r.note}>{stressDates(r.start, r.end)}</span>
          <Signed role="cell" text={rpct(r.fund)} className="text-right font-semibold" />
          <span role="cell" className="text-right text-muted-foreground">{pctText(r.benchmark)}</span>
          <Signed role="cell" text={r.active === null ? "—" : fmtChangeBp(r.active * 10_000)} className="text-right" />
          <span role="cell" className="text-right">{fmtAccounting(r.dollars, 0)}</span>
        </>
      }
      detail={
        <div className="grid gap-4">
          <p className="text-body text-ink-2">
            {r.note} Bought at the {fmtDate(r.start)} close, valued at the {fmtDate(r.end)} close ({r.sessions} sessions){r.cashWeight > 0 ? `, with ${rpct(r.cashWeight)} in cash at 0%` : ""}. Impact on today&apos;s {scopeLabel}:{" "}
            <b className={cn("font-semibold", tone(r.dollars))}>{rusdFull(r.dollars)}</b>.
          </p>
          <dl className="grid grid-cols-4 gap-x-6 gap-y-3 text-body">
            <Fact label="S&P 500" explain={RISK_EXPLAIN.stressMarket} value={<span className={tone(r.market)}>{rpct(r.market)}</span>} />
            <Fact label="Dollars" explain={RISK_EXPLAIN.stressDollars} value={<span className={tone(r.dollars)}>{rusd(r.dollars)}</span>} />
            <Fact
              label="Worst contributors"
              explain={RISK_EXPLAIN.stressWorst}
              value={r.worst.map((h, i) => (
                <span key={h.ticker}>
                  {i > 0 && ", "}
                  <span className="whitespace-nowrap">
                    {h.ticker} <span className={tone(h.contribution)}>{rpct(h.contribution, 2)}</span>
                  </span>
                </span>
              ))}
            />
            <Fact label="Stood in" explain={RISK_EXPLAIN.stressProxy} value={r.proxied ? String(r.proxied) : "none"} />
          </dl>
          {stoodIn.length > 0 && (
            <p className="text-body">
              <span className="font-semibold">Stood in: </span>
              {stoodIn.map((h, i) => (
                <span key={h.ticker}>
                  {i > 0 && "; "}
                  {h.ticker} uses {h.series} ({h.proxyReason})
                </span>
              ))}
              .
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
            <div className="min-w-0">
              <StressPathChart data={r.path} fundLabel={fundLabel} benchmarkLabel={benchmarkLabel} />
            </div>
            <div className="min-w-0">
              <ContributionTable r={r} />
            </div>
          </div>
          {transparency && <StressWorking r={r} />}
          {backtesting && (
            <div className="text-body">
              <Link href={backtestHref(r)} className="font-semibold underline underline-offset-2 hover:text-foreground">
                Open in Backtesting →
              </Link>
              <span className="text-muted-foreground"> with {fmtDate(r.backtestFrom)} – {fmtDate(r.end)} filled in. Backtesting replays saved weights rebalanced daily, so its result will differ.</span>
            </div>
          )}
        </div>
      }
    />
  );
}

function Fact({ label, explain, value }: { label: string; explain: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-muted-foreground"><Tip label={label}>{explain}</Tip></dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function ContributionTable({ r }: { r: StressOk }) {
  return (
    <div className="max-h-80 overflow-auto bg-background">
      <table className="w-full text-body whitespace-nowrap">
        <thead className="sticky top-0 bg-background text-caption text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="px-2 py-1.5 text-left font-normal">Holding</th>
            <th scope="col" className="px-2 py-1.5 text-right font-normal">Weight</th>
            <th scope="col" className="px-2 py-1.5 text-right font-normal">Return</th>
            <th scope="col" className="px-2 py-1.5 text-right font-normal">
              <Tip label="Contribution">{RISK_EXPLAIN.stressWorst}</Tip>
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-normal">Dollars</th>
          </tr>
        </thead>
        <tbody>
          {r.holdings.map((h) => (
            <tr key={h.ticker} className="border-b border-row">
              <td className="px-2 py-1">
                <span className="font-semibold">{h.ticker}</span>
                {h.proxied && <span className="ml-1.5 text-caption font-semibold text-caution-foreground" title={h.proxyReason ?? undefined}>via {h.series}</span>}
              </td>
              <td className="px-2 py-1 text-right">{rpct(h.weight)}</td>
              <td className={cn("px-2 py-1 text-right", tone(h.ret))}>{rpct(h.ret)}</td>
              <td className={cn("px-2 py-1 text-right font-semibold", tone(h.contribution))}>{rpct(h.contribution, 2)}</td>
              <td className={cn("px-2 py-1 text-right", tone(h.dollars))}>{rusd(h.dollars)}</td>
            </tr>
          ))}
          {r.cashWeight > 0 && (
            <tr className="border-b border-row text-muted-foreground">
              <td className="px-2 py-1">Cash</td>
              <td className="px-2 py-1 text-right">{rpct(r.cashWeight)}</td>
              <td className="px-2 py-1 text-right">0.0%</td>
              <td className="px-2 py-1 text-right">0.00%</td>
              <td className="px-2 py-1 text-right">$0</td>
            </tr>
          )}
        </tbody>
        <tfoot className="sticky bottom-0 bg-background font-semibold">
          <tr className="border-t">
            <td className="px-2 py-1.5">Total</td>
            <td className="px-2 py-1.5 text-right">{rpct(r.cashWeight + r.holdings.reduce((s, h) => s + h.weight, 0))}</td>
            <td />
            <td className={cn("px-2 py-1.5 text-right", tone(r.fund))}>{rpct(r.fund, 2)}</td>
            <td className={cn("px-2 py-1.5 text-right", tone(r.dollars))}>{rusd(r.dollars)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StressWorking({ r }: { r: StressOk }) {
  const pct3 = (v: number) => rpct(v, 3);
  const sum = r.holdings.reduce((s, h) => s + h.contribution, 0);
  const nav = r.fund === 0 ? null : r.dollars / r.fund;
  return (
    <Working>
      <Step label="Portfolio">Σ wᵢ × (Gᵢ − 1) over {r.holdings.length} holdings = {pct3(sum)}{r.cashWeight > 0 ? ` + cash ${rpct(r.cashWeight)} × 0` : ""} = <b className="whitespace-nowrap">{pct3(r.fund)}</b></Step>
      <Step label="Largest terms">{r.holdings.slice(0, 5).map((h) => `${h.ticker} ${rpct(h.weight, 2)} × ${pct3(h.ret)}`).join(" + ")} + …</Step>
      {nav !== null && <Step label="On today's value">{pct3(r.fund)} × {rusdFull(nav)} = <b className="whitespace-nowrap">{rusdFull(r.dollars)}</b></Step>}
      {r.benchmark !== null && (
        <Step label="Sector benchmark">
          {r.benchmarkLegs.map((l) => `${l.etf} ${rpct(l.weight, 1)} × ${pct3(l.ret)}`).join(" + ")} = <b className="whitespace-nowrap">{pct3(r.benchmark)}</b>
        </Step>
      )}
      {r.active !== null && <Step label="Active">{pct3(r.fund)} − {pct3(r.benchmark!)} = <b className="whitespace-nowrap">{rbp(r.active, 1)}</b></Step>}
      <Step label="S&P 500">SPY growth of $1 {fmtDate(r.start)} → {fmtDate(r.end)}, dividends reinvested, − 1 = <b className="whitespace-nowrap">{pct3(r.market)}</b></Step>
      <Step label="Rebalanced daily instead">Π (1 + Σ wᵢ rᵢ,ₜ) − 1 = {pct3(r.rebalanced)} (buy-and-hold minus rebalanced: {rbp(r.fund - r.rebalanced)}). <span className="text-muted-foreground">{RISK_EXPLAIN.stressRebalanced}</span></Step>
      <Source>Gᵢ = Π (closeₜ + dividendₜ) ÷ closeₜ₋₁ from stored Yahoo Finance closes (split-adjusted) and dividends on ex-dates; the Stress results CSV has every term, the Daily paths CSV each series.</Source>
    </Working>
  );
}
