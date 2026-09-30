import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LineChart } from "@/components/app/portfolio/line-chart";
import { OverviewChart } from "@/components/app/portfolio/overview-chart";
import { HoldingChart } from "@/components/app/portfolio/holding-chart";
import {
  LinesChart,
  FUND_LINE,
  BENCH_LINE,
} from "@/components/app/portfolio/lines-chart";
import { PriceChart } from "@/components/app/price-chart";
import { IntradayChart } from "@/components/app/daily/intraday-chart";
import { CumulativeLines } from "@/components/app/attribution/cumulative-active-chart";
import { DrawdownChart } from "@/components/app/risk/drawdown-chart";
import { StressPathChart } from "@/components/app/risk/stress-path-chart";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { fmtChangePct } from "@/lib/format";

// Only synthetic observations. Render the actual production adapters; no app authentication or providers bypassed.
const dates = [
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
];
const rows = dates.map((date, i) => ({
  date,
  portfolio: [0, 10, 21, 15, 20][i],
  benchmark: i === 2 ? null : [0, 5, 8, 10, 15][i],
}));
const daily = dates.map((date, i) => ({
  date,
  value: [100, 110, 121, 115, 120][i],
  replay: i < 2,
}));
const bars = daily.map((p) => ({ date: p.date, close: p.value }));
const prices = [
  { date: "2025-09-19", values: { holding: 80, benchmark: 90 } },
  ...rows.map((r, i) => ({
    date: r.date,
    values: {
      holding: daily[i].value,
      benchmark: r.benchmark === null ? null : 100 + r.benchmark,
    },
  })),
];
const path = rows.map((r, i) => ({
  t: `2026-09-25T${String(14 + i).padStart(2, "0")}:00:00Z`,
  portfolio: r.portfolio / 100,
  benchmark: r.benchmark === null ? null : r.benchmark / 100,
}));
function App() {
  const [replacement, setReplacement] = useState(false);
  const changing = replacement ? rows.slice(-2) : rows;
  return (
    <main style={{ maxWidth: 960, margin: "20px auto", padding: 12 }}>
      <h1>Synthetic chart interaction checks</h1>
      <section id="overview">
        <h2>Fund overview</h2>
        <OverviewChart points={daily} dayBase={100} inception="2026-09-23" />
      </section>
      <section id="holding">
        <h2>Holding</h2>
        <HoldingChart
          ticker="TEST"
          bars={bars}
          marks={[{ date: "2026-09-23", side: "buy", shares: 2, price: 121 }]}
          currency="USD"
        />
      </section>
      <section id="price">
        <PriceChart data={prices} ticker="TEST" currency="USD" />
      </section>
      <section id="intraday">
        <h2>Intraday</h2>
        <IntradayChart
          points={path}
          hours={{
            open: "2026-09-25T13:30:00Z",
            close: "2026-09-25T20:00:00Z",
          }}
          portfolioLabel="Fund"
          benchmarkLabel="Benchmark"
        />
      </section>
      <section id="cumulative">
        <h2>Attribution</h2>
        <CumulativeLines
          data={rows}
          portfolioLabel="Fund"
          benchmarkLabel="Benchmark"
        />
      </section>
      <section id="comparison">
        <h2>Replay comparison</h2>
        <button onClick={() => setReplacement((x) => !x)}>Replace data</button>
        <LinesChart
          rows={changing}
          xKey="date"
          ariaLabel="Replay comparison"
          lines={[
            { key: "portfolio", label: "Fund", ...FUND_LINE },
            { key: "benchmark", label: "Benchmark", ...BENCH_LINE },
          ]}
          xAxis={{}}
          hoverLabel={(r) => r.date}
          format={fmtChangePct}
        />
      </section>
      <section id="drawdown">
        <h2>Drawdown</h2>
        <DrawdownChart
          data={dates.map((date, i) => ({
            date,
            fund: [0, -10, -5, -15, -8][i],
            market: i === 2 ? undefined : -i,
          }))}
          fundLabel="Fund"
        />
      </section>
      <section id="stress">
        <h2>Stress path</h2>
        <StressPathChart
          data={rows.map((r) => ({
            date: r.date,
            fund: r.portfolio / 100,
            market: (r.portfolio - 2) / 100,
            benchmark: r.benchmark === null ? null : r.benchmark / 100,
          }))}
          fundLabel="Fund"
          benchmarkLabel="Benchmark"
        />
      </section>
      <section id="performance">
        <h2>Full comparison</h2>
        <PerformanceChart
          data={prices.slice(1)}
          label="Full comparison"
          series={[
            {
              key: "holding",
              label: "TEST",
              color: FUND_LINE.color,
              currency: "USD",
            },
            { key: "benchmark", label: "Benchmark", color: BENCH_LINE.color },
          ]}
          ranges={false}
          note="Synthetic daily observations"
        />
      </section>
      <section id="zero">
        <h2>Zero baseline</h2>
        <LineChart
          label="Zero price"
          lines={[
            {
              tone: "up",
              points: [
                { t: 1, v: 0 },
                { t: 2, v: 20 },
              ],
            },
          ]}
          formatX={String}
          formatY={String}
        />
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
