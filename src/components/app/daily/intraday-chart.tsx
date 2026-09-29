"use client";

import { BENCH_LINE, FUND_LINE, LinesChart } from "@/components/app/portfolio/lines-chart";
import type { PathPoint } from "@/lib/attribution/live";
import { fmtChangePct, fmtTime } from "@/lib/format";

type Row = { x: number; portfolio: number; benchmark: number | null };

/**
 * The session so far: both lines in percent from the prior close, on a time axis that runs the whole session so the
 * line grows across the day. `points` are fractions; null while the first fetch is running.
 */
export function IntradayChart({ points, hours, portfolioLabel, benchmarkLabel }: { points: PathPoint[] | null; hours: { open: string; close: string }; portfolioLabel: string; benchmarkLabel: string }) {
  if (points === null) return <div className="flex h-[200px] items-center text-body text-muted-foreground">Loading the day&apos;s prices…</div>;
  const open = Date.parse(hours.open);
  const close = Date.parse(hours.close);
  const rows: Row[] = points.map((p) => ({ x: Date.parse(p.t), portfolio: p.portfolio * 100, benchmark: p.benchmark === null ? null : p.benchmark * 100 }));
  if (!rows.length) return <div className="flex h-[200px] items-center text-body text-muted-foreground">No intraday prices yet for this session.</div>;
  // Every line starts from the prior close at the bell.
  if (rows[0].x > open) rows.unshift({ x: open, portfolio: 0, benchmark: rows[0].benchmark === null ? null : 0 });
  const ticks: number[] = [];
  for (let t = open + 30 * 60_000; t < close; t += 60 * 60_000) ticks.push(t);
  const last = rows.at(-1)!;

  return (
    <LinesChart
      rows={rows}
      xKey="x"
      ariaLabel={`Return through the session, ${portfolioLabel} ${fmtChangePct(last.portfolio)} versus ${benchmarkLabel}${last.benchmark === null ? "" : ` ${fmtChangePct(last.benchmark)}`}`}
      lines={[
        { key: "portfolio", label: portfolioLabel, ...FUND_LINE },
        { key: "benchmark", label: benchmarkLabel, ...BENCH_LINE },
      ]}
      xAxis={{ type: "number", domain: [open, close], ticks, tickFormatter: (x: number) => fmtTime(new Date(x)).replace(" ET", "") }}
      hoverLabel={(r) => fmtTime(new Date(r.x))}
      format={(v) => fmtChangePct(v)}
    />
  );
}
