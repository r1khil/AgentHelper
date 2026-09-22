"use client";

import { memo, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { PerformanceChart } from "@/components/charts/performance-chart";
import {
  BENCHMARKS,
  type BacktestResult,
  type Metrics,
  type Snapshot,
} from "@/lib/backtesting/engine";
import { cn } from "@/lib/utils";

const pct = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toFixed(2)}%`;
const pp = (v: number | null) =>
  v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)} pp`;
const tone = (v: number) =>
  v > 1e-12 ? "text-up" : v < -1e-12 ? "text-down" : "text-muted-foreground";
const cell = "px-3 py-2.5 text-right tnum whitespace-nowrap";
const head = "px-3 py-2.5 text-left font-medium text-muted-foreground";
const initialWeights = (snapshot: Snapshot) =>
  Object.fromEntries(
    snapshot.positions.map((p) => [p.id, String(p.weight * 100)]),
  );

type Completed = {
  id: number;
  result: BacktestResult;
  weights: Record<string, string>;
  from: string;
  to: string;
  benchmark: keyof typeof BENCHMARKS;
};
export function BacktestingWorkspace({
  snapshot,
  defaultFrom,
  defaultTo,
  endpoint = "/api/backtesting",
}: {
  snapshot: Snapshot;
  defaultFrom: string;
  defaultTo: string;
  endpoint?: string;
}) {
  const [weights, setWeights] = useState(() => initialWeights(snapshot));
  const [from, setFrom] = useState(defaultFrom),
    [to, setTo] = useState(defaultTo);
  const [benchmark, setBenchmark] = useState<keyof typeof BENCHMARKS>("SPY");
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false),
    runs = useRef(0);
  const values = Object.values(weights);
  const sum = values.reduce((s, w) => s + Number(w), 0);
  const valid =
    values.every(
      (w) =>
        w.trim() !== "" &&
        Number.isFinite(Number(w)) &&
        Number(w) >= 0 &&
        Number(w) <= 100,
    ) && Math.abs(sum - 100) < 1e-6;
  const dirty =
    completed &&
    (completed.from !== from ||
      completed.to !== to ||
      completed.benchmark !== benchmark ||
      JSON.stringify(completed.weights) !== JSON.stringify(weights));
  async function run(event: FormEvent) {
    event.preventDefault();
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          benchmark,
          version: snapshot.version,
          weights: Object.fromEntries(
            Object.entries(weights).map(([id, weight]) => [
              id,
              Number(weight) / 100,
            ]),
          ),
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (
        response.redirected ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new Error(
          "Your session expired. Sign in again, then reload this page.",
        );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Unable to replay this period.");
      setCompleted({
        id: ++runs.current,
        result,
        weights: { ...weights },
        from,
        to,
        benchmark,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to run backtest. Please retry.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Backtesting"
        description="Compare your current allocation with a modified copy, one trading day at a time."
      />
      <Card className="mb-5 gap-3 p-4 text-sm">
        <div className="font-medium">{snapshot.scope}</div>
        <p className="text-muted-foreground">
          Saved weights total {snapshot.savedWeightTotal.toFixed(2)}%. The
          invested holdings are normalized to 100% for this comparison; cash is
          excluded. The original is a snapshot of current holdings, not
          historical holdings. Changes here never update your saved portfolio.
        </p>
        <p className="text-xs text-muted-foreground">
          Fixed weights are rebalanced daily · USD total returns · Dividends
          reinvested · No fees, taxes, or transaction costs
        </p>
      </Card>
      <form onSubmit={run}>
        <Card className="mb-5 gap-4 p-4">
          <SectionTitle>Replay settings</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2 text-sm">
              Start date
              <Input
                aria-label="Start date"
                type="date"
                value={from}
                max={to}
                required
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm">
              End date
              <Input
                aria-label="End date"
                type="date"
                value={to}
                min={from}
                max={defaultTo}
                required
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm">
              Benchmark
              <select
                aria-label="Benchmark"
                value={benchmark}
                onChange={(e) =>
                  setBenchmark(e.target.value as keyof typeof BENCHMARKS)
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {Object.entries(BENCHMARKS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Start date includes that session’s return from the previous trading
            close. Up to five years; completed sessions only.
          </p>
          <details open className="group">
            <summary className="cursor-pointer text-sm font-medium">
              Portfolio weights{" "}
              <span className="text-muted-foreground">
                · edit the modified copy
              </span>
            </summary>
            <div className="mt-3 max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Original and modified portfolio weights
                </caption>
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className={head}>Holding</th>
                    <th className={cell}>Original</th>
                    <th className={cell}>Modified (%)</th>
                    <th className={cell}>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.positions.map((p) => (
                    <tr key={p.id} className="border-t">
                      <th className="px-3 py-2 text-left font-medium">
                        {p.ticker}
                        <span className="mt-1 block max-w-60 truncate text-xs font-normal text-muted-foreground">
                          {p.name}
                        </span>
                      </th>
                      <td className={cell}>{pct(p.weight)}</td>
                      <td className={cell}>
                        <Input
                          className="ml-auto w-28 text-right"
                          aria-label={`${p.ticker} modified weight`}
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          value={weights[p.id]}
                          onChange={(e) =>
                            setWeights({ ...weights, [p.id]: e.target.value })
                          }
                          required
                        />
                      </td>
                      <td
                        className={cn(
                          cell,
                          tone(Number(weights[p.id]) / 100 - p.weight),
                        )}
                      >
                        {pp(Number(weights[p.id]) / 100 - p.weight)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              aria-live="polite"
              className={cn("text-sm tnum", !valid && "text-destructive")}
            >
              Modified total:{" "}
              {Number.isFinite(sum)
                ? sum.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
                : "—"}
              %{!valid && " · must total 100%"}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setWeights(initialWeights(snapshot))}
              >
                Reset weights
              </Button>
              <Button type="submit" disabled={!valid || busy}>
                {busy ? "Replaying…" : "Run backtest"}
              </Button>
            </div>
          </div>
        </Card>
      </form>
      <div
        role="status"
        aria-live="polite"
        className="mb-4 text-sm text-muted-foreground"
      >
        {busy
          ? "Fetching adjusted history and calculating every trading day…"
          : dirty
            ? "Settings changed. Results below show the last completed run; run again to apply changes."
            : completed
              ? `${completed.result.days.length} trading days replayed · ${completed.result.baseline} closing baseline → ${completed.result.days.at(-1)!.date}`
              : "Choose your dates and weights, then run the comparison."}
      </div>
      {error && (
        <Card
          role="alert"
          className="mb-5 border-destructive/40 p-4 text-sm text-destructive"
        >
          {error}
        </Card>
      )}
      {completed && (
        <Results key={completed.id} result={completed.result} />
      )}
    </>
  );
}

const Results = memo(function Results({ result }: { result: BacktestResult }) {
  const [date, setDate] = useState(result.days.at(-1)!.date);
  const [mode, setMode] = useState<
    "originalActive" | "modifiedActive" | "delta"
  >("modifiedActive");
  const selected = result.days.find((d) => d.date === date)!;
  const points = useMemo(
    () => [
      {
        date: result.baseline,
        values: { original: 100, modified: 100, benchmark: 100 },
      },
      ...result.days.map((d) => ({
        date: d.date,
        values: {
          original: (1 + d.originalCumulative) * 100,
          modified: (1 + d.modifiedCumulative) * 100,
          benchmark: (1 + d.benchmarkCumulative) * 100,
        },
      })),
    ],
    [result],
  );
  const months = [...new Set(result.days.map((d) => d.date.slice(0, 7)))];
  const byDate = new Map(result.days.map((d) => [d.date, d]));
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Original return", result.original.totalReturn],
          ["Modified return", result.modified.totalReturn],
          [
            "Weight-change delta",
            result.modified.totalReturn - result.original.totalReturn,
          ],
        ].map(([label, value]) => (
          <Card key={String(label)} className="gap-1 p-4">
            <span className="text-xs text-muted-foreground">{label}</span>
            <strong
              className={cn("text-2xl font-semibold tnum", tone(Number(value)))}
            >
              {label === "Weight-change delta"
                ? pp(Number(value))
                : pct(Number(value))}
            </strong>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <SectionTitle>Cumulative returns</SectionTitle>
        <PerformanceChart
          data={points}
          kind="return"
          ranges={false}
          label="Backtest cumulative returns"
          note="Compounded daily total returns, rebased to the same closing baseline."
          series={[
            { key: "original", label: "Original", color: "var(--foreground)" },
            { key: "modified", label: "Modified", color: "var(--up)" },
            {
              key: "benchmark",
              label: result.benchmark,
              color: "var(--muted-foreground)",
              dashed: true,
            },
          ]}
        />
      </Card>
      <Card className="p-4">
        <SectionTitle>Daily active return</SectionTitle>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2">
            Color by
            <select
              aria-label="Heatmap measure"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              className="rounded border bg-background p-2"
            >
              <option value="modifiedActive">Modified vs benchmark</option>
              <option value="originalActive">Original vs benchmark</option>
              <option value="delta">Modified − original</option>
            </select>
          </label>
          <span className="text-xs text-muted-foreground">
            Red: negative · neutral: zero · green: positive · darker: larger (up
            to 1 pp)
          </span>
        </div>
        <div className="grid max-h-[36rem] gap-6 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
          {months.map((month) => {
            const first = new Date(`${month}-01T00:00:00Z`);
            const count = new Date(
              Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
            ).getUTCDate();
            const offset = (first.getUTCDay() + 6) % 7;
            return (
              <div key={month}>
                <h3 className="mb-2 text-sm font-medium">
                  {first.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </h3>
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                    <span key={i} className="pb-1 text-muted-foreground">
                      {d}
                    </span>
                  ))}
                  {Array.from({ length: offset }, (_, i) => (
                    <span key={`pad${i}`} />
                  ))}
                  {Array.from({ length: count }, (_, i) => {
                    const day = `${month}-${String(i + 1).padStart(2, "0")}`,
                      row = byDate.get(day);
                    if (!row)
                      return (
                        <span
                          key={day}
                          className="grid min-h-8 place-items-center rounded bg-muted/30 text-muted-foreground/60"
                          title="Outside replay or no benchmark session"
                        >
                          {i + 1}
                        </span>
                      );
                    const value = row[mode];
                    const label = `${day}: ${mode === "delta" ? "weight-change delta" : "active return"} ${pp(value)}`;
                    return (
                      <button
                        type="button"
                        key={day}
                        title={label}
                        aria-label={label}
                        aria-pressed={day === date}
                        onClick={() => setDate(day)}
                        className={cn(
                          "min-h-8 rounded border border-transparent text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                          day === date &&
                            "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                        )}
                        style={{
                          backgroundColor:
                            Math.abs(value) < 1e-12
                              ? "var(--muted)"
                              : `color-mix(in srgb, ${value > 0 ? "var(--up)" : "var(--down)"} ${20 + Math.min(Math.abs(value) / 0.01, 1) * 50}%, var(--background))`,
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
        <p className="mt-4 text-xs text-muted-foreground">
          Select a trading day for contributions. Blank sessions are not
          assigned a zero return.
        </p>
      </Card>
      <Card className="p-4" aria-label="Selected day details">
        <SectionTitle>Day detail · {date}</SectionTitle>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={head}>Return</th>
                <th className={cell}>Original</th>
                <th className={cell}>Modified</th>
                <th className={cell}>Difference</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <th className={head}>Portfolio</th>
                <td className={cell}>{pct(selected.original)}</td>
                <td className={cell}>{pct(selected.modified)}</td>
                <td className={cell}>{pp(selected.delta)}</td>
              </tr>
              <tr className="border-t">
                <th className={head}>Benchmark · {result.benchmark}</th>
                <td className={cell}>{pct(selected.benchmark)}</td>
                <td className={cell}>{pct(selected.benchmark)}</td>
                <td className={cell}>{pp(0)}</td>
              </tr>
              <tr className="border-t">
                <th className={head}>Active vs benchmark</th>
                <td className={cell}>{pp(selected.originalActive)}</td>
                <td className={cell}>{pp(selected.modifiedActive)}</td>
                <td className={cell}>{pp(selected.delta)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <caption className="py-3 text-left text-xs text-muted-foreground">
              Holding contributions to daily portfolio return, in percentage
              points.
            </caption>
            <thead>
              <tr>
                <th className={head}>Holding</th>
                <th className={cell}>Holding return</th>
                <th className={cell}>Original</th>
                <th className={cell}>Modified</th>
                <th className={cell}>Difference</th>
              </tr>
            </thead>
            <tbody>
              {selected.contributions.map((c) => (
                <tr key={c.id} className="border-t">
                  <th className={head}>{c.ticker}</th>
                  <td className={cell}>{pct(c.return)}</td>
                  <td className={cell}>{pp(c.original)}</td>
                  <td className={cell}>{pp(c.modified)}</td>
                  <td className={cn(cell, tone(c.delta))}>{pp(c.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-4">
        <SectionTitle>Period summary</SectionTitle>
        <Summary result={result} />
      </Card>
      <Card className="p-4">
        <SectionTitle>
          Contributors, detractors & weight-change impact
        </SectionTitle>
        <Contributors result={result} />
      </Card>
      <details className="rounded-lg border p-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          Calculation notes
        </summary>
        <div className="mt-3 space-y-2">
          <p>
            Returns use Yahoo Finance adjusted closing prices for both holdings
            and the selected ETF benchmark, including dividend and split
            adjustments. Returns are calculated as adjusted close / previous
            adjusted close − 1. Each daily portfolio return is the weighted sum
            of holding returns. Cumulative return is the product of (1 + daily
            return) − 1.
          </p>
          <p>
            Volatility is the sample standard deviation of daily returns × √252.
            Drawdown includes the initial value of 1 and is shown as a negative
            peak-to-trough return. Up/down capture is the ratio of geometric
            mean daily portfolio and benchmark returns on
            benchmark-positive/negative days; unavailable subsets show a dash.
            Flat benchmark days enter neither capture ratio.
          </p>
          <p>
            Daily contributions are weight × holding return. Period
            contributions sum each daily contribution multiplied by the
            portfolio’s value at the start of that day. They reconcile to each
            compounded portfolio return; their differences reconcile to the
            weight-change delta. Active return is portfolio minus benchmark, in
            percentage points; active returns are not compounded separately.
          </p>
          <p>
            This is a hypothetical replay of current holdings. It excludes cash,
            trading costs, taxes and historical changes in membership; current
            selection introduces survivorship and hindsight bias. Missing
            holding prices block a run. The benchmark’s observed sessions define
            the replay calendar.
          </p>
        </div>
      </details>
    </div>
  );
});
function Summary({ result }: { result: BacktestResult }) {
  const rows: [string, keyof Metrics, "return" | "ratio" | "count"][] = [
    ["Cumulative return", "totalReturn", "return"],
    ["Annualized volatility", "volatility", "return"],
    ["Max drawdown", "maxDrawdown", "return"],
    ["Up capture", "upCapture", "ratio"],
    ["Down capture", "downCapture", "ratio"],
    ["Outperforming days", "outDays", "count"],
    ["Underperforming days", "underDays", "count"],
    ["Equal-return days", "equalDays", "count"],
  ];
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={head}>Metric</th>
            <th className={cell}>Original</th>
            <th className={cell}>Modified</th>
            <th className={cell}>Benchmark</th>
            <th className={cell}>Delta (modified − original)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key, kind]) => {
            const a = result.original[key],
              b = result.modified[key],
              d = a === null || b === null ? null : b - a;
            return (
              <tr key={key} className="border-t">
                <th className={head}>{label}</th>
                {[a, b, result.benchmarkMetrics[key]].map((v, i) => (
                  <td key={i} className={cell}>
                    {kind === "count" ? v : pct(v)}
                  </td>
                ))}
                <td className={cell}>
                  {kind === "count" ? `${d! >= 0 ? "+" : ""}${d}` : pp(d)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t">
            <th className={head}>Active return</th>
            <td className={cell}>
              {pp(
                result.original.totalReturn -
                  result.benchmarkMetrics.totalReturn,
              )}
            </td>
            <td className={cell}>
              {pp(
                result.modified.totalReturn -
                  result.benchmarkMetrics.totalReturn,
              )}
            </td>
            <td className={cell}>{pp(0)}</td>
            <td className={cell}>
              {pp(result.modified.totalReturn - result.original.totalReturn)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
function Contributors({ result }: { result: BacktestResult }) {
  const [sort, setSort] = useState<"original" | "modified" | "delta">(
    "modified",
  );
  const sorted = [...result.contributions].sort((a, b) => b[sort] - a[sort]);
  const leaders = sorted.filter((c) => c[sort] > 0).slice(0, 5),
    detractors = sorted
      .filter((c) => c[sort] < 0)
      .reverse()
      .slice(0, 5);
  return (
    <>
      <label className="mb-4 flex items-center gap-2 text-sm">
        Rank by
        <select
          aria-label="Contribution ranking"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded border bg-background p-2"
        >
          <option value="modified">Modified</option>
          <option value="original">Original</option>
          <option value="delta">Weight-change delta</option>
        </select>
      </label>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        {[
          ["Top contributors", leaders],
          ["Top detractors", detractors],
        ].map(([label, rows]) => (
          <div key={String(label)} className="rounded-md bg-muted/40 p-3">
            <h3 className="mb-2 text-sm font-medium">{String(label)}</h3>
            {(rows as typeof leaders).length ? (
              (rows as typeof leaders).map((c) => (
                <div key={c.id} className="flex justify-between py-1 text-sm">
                  <span>{c.ticker}</span>
                  <span className={cn("tnum", tone(c[sort]))}>
                    {pp(c[sort])}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                None in this period.
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={head}>Holding</th>
              <th className={cell}>Original contribution</th>
              <th className={cell}>Modified contribution</th>
              <th className={cell}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id} className="border-t">
                <th className={head}>{c.ticker}</th>
                <td className={cell}>{pp(c.original)}</td>
                <td className={cell}>{pp(c.modified)}</td>
                <td className={cn(cell, tone(c.delta))}>{pp(c.delta)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <th className={head}>Total</th>
              <td className={cell}>{pp(result.original.totalReturn)}</td>
              <td className={cell}>{pp(result.modified.totalReturn)}</td>
              <td className={cell}>
                {pp(result.modified.totalReturn - result.original.totalReturn)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
