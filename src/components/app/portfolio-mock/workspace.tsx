"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FlaskConical,
  History,
  Layers,
  LayoutDashboard,
  ListFilter,
  Moon,
  PieChart,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  X,
} from "lucide-react";
import {
  ALLOCATION_GRADIENT,
  allocationChange,
  CASH_COLOR,
  CASH_WEIGHT,
  contribution,
  EFFECTIVE_POSITIONS,
  fundReturn,
  HELD_SECTORS,
  HOLDINGS,
  INVESTED_WEIGHT,
  LARGEST_OVERWEIGHT,
  LARGEST_SECTOR,
  money,
  NAV,
  PERIODS,
  SECTOR_ACTIVE_SHARE,
  SECTOR_DIFFERENCES,
  SECTORS,
  sectorShock,
  sectorWeight,
  signed,
  TOP_RISK,
  TOP_THREE,
  topWeight,
  type Holding,
  type Period,
} from "./data";
import {
  fmtAccounting,
  fmtChangeBp,
  fmtChangePct,
  fmtChangeUsd,
  fmtPct,
} from "@/lib/format";
import "./mock.css";

type View =
  | "Overview"
  | "Holdings"
  | "Performance"
  | "Risk"
  | "Exposure"
  | "Scenarios"
  | "Activity";
const VIEWS: { name: View; hint: string; icon: typeof Layers }[] = [
  { name: "Overview", hint: "Your starting point", icon: LayoutDashboard },
  { name: "Holdings", hint: "What do we own?", icon: Layers },
  { name: "Performance", hint: "What drove returns?", icon: TrendingUp },
  { name: "Risk", hint: "Where is the risk?", icon: ShieldCheck },
  { name: "Exposure", hint: "Where are we allocated?", icon: PieChart },
  { name: "Scenarios", hint: "What would change?", icon: FlaskConical },
  { name: "Activity", hint: "What happened in the book?", icon: History },
];
const BP = ({ n }: { n: number }) => (
  <span className={n < 0 ? "pm-down" : "pm-up"}>{fmtChangeBp(n, 1)}</span>
);
const Pct = ({ n }: { n: number }) => (
  <span className={n < 0 ? "pm-down" : "pm-up"}>{fmtChangePct(n)}</span>
);
const Button = ({
  children,
  onClick,
  primary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) => (
  <button
    className={`pm-button ${primary ? "pm-primary" : ""}`}
    onClick={onClick}
  >
    {children}
  </button>
);
function Ticker({ holding }: { holding: Holding }) {
  return (
    <span className="pm-security">
      <span
        className="pm-monogram"
        style={{ background: `${holding.color}18`, color: holding.color }}
      >
        {holding.ticker.slice(0, 1)}
      </span>
      <span>
        <strong>{holding.ticker}</strong>
        <small>{holding.name}</small>
      </span>
    </span>
  );
}
function Panel({
  title,
  sub,
  children,
  action,
  className = "",
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`pm-panel ${className}`}>
      <div className="pm-panel-head">
        <div>
          <h2>{title}</h2>
          {sub ? <p>{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Working({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="pm-working">
      <summary>
        <CircleHelp size={15} aria-hidden />
        {title}
        <ChevronDown size={14} aria-hidden />
      </summary>
      <div>{children}</div>
    </details>
  );
}
function Metric({
  label,
  value,
  note,
  children,
}: {
  label: string;
  value: ReactNode;
  note: string;
  children?: ReactNode;
}) {
  return (
    <div className="pm-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
      {children}
    </div>
  );
}
function ReturnsChart({ period }: { period: Period }) {
  const ret = fundReturn(period);
  const bench = PERIODS[period].benchmark;
  const min = period === "ledger" ? -0.3 : -0.04;
  const max = period === "ledger" ? 1.5 : 0.24;
  const y = (v: number) => 188 - ((v - min) / (max - min)) * 166;
  const x = (i: number) => 46 + i * 66;
  const fund = [0, -0.13, 0.1, 0.06, 0.28, 0.47, 0.35, 0.59, 0.68, 0.71, ret];
  const benchmark = [
    0,
    0.08,
    0.17,
    0.23,
    0.41,
    0.58,
    0.55,
    0.71,
    0.94,
    0.97,
    bench,
  ];
  const scale = period === "ledger" ? 1 : 0.16;
  const path = (values: number[]) =>
    values
      .map((v, i) => `${i ? "L" : "M"}${x(i)},${y(i === 10 ? v : v * scale)}`)
      .join(" ");
  const ticks = period === "ledger" ? [0, 0.5, 1, 1.5] : [0, 0.08, 0.16, 0.24];
  return (
    <div className="pm-chart">
      <div className="pm-chart-key">
        <span>
          <i className="pm-key-fund" />
          Fund <b>{fmtChangePct(ret)}</b>
        </span>
        <span>
          <i className="pm-key-bench" />
          S&amp;P 500 <b>{fmtChangePct(bench)}</b>
        </span>
        <small>Illustrative path · recorded-history layout</small>
      </div>
      <svg
        viewBox="0 0 760 228"
        role="img"
        aria-label={`Illustrative cumulative return chart. Fund ${fmtAccounting(ret, 2)} percent; S&P 500 ${fmtAccounting(bench, 2)} percent. ${PERIODS[period].dates}`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1="46"
              x2="716"
              y1={y(v)}
              y2={y(v)}
              className="pm-gridline"
            />
            <text x="0" y={y(v) + 4}>
              {fmtAccounting(v, period === "ledger" ? 1 : 2)}%
            </text>
          </g>
        ))}
        <path d={`${path(fund)} L706,188 L46,188 Z`} fill="url(#pm-fill)" />
        <defs>
          <linearGradient id="pm-fill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--pm-green)" stopOpacity=".13" />
            <stop offset="1" stopColor="var(--pm-green)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path(benchmark)} className="pm-benchmark-line" />
        <path d={path(fund)} className="pm-fund-line" />
        <circle cx="706" cy={y(ret)} r="4" fill="var(--pm-green)" />
        <text x="46" y="218">
          {period === "ledger" ? "Sep 17" : "Sep 28 close"}
        </text>
        <text x="310" y="218">
          {period === "ledger" ? "Sep 23" : ""}
        </text>
        <text x="653" y="218">
          Sep 29
        </text>
      </svg>
    </div>
  );
}
function Contributors({
  period,
  open,
}: {
  period: Period;
  open: (h: Holding) => void;
}) {
  const ordered = [...HOLDINGS].sort(
    (a, b) => contribution(b, period) - contribution(a, period),
  );
  const rows = [...ordered.slice(0, 3), ...ordered.slice(-2).reverse()];
  const largest = Math.max(
    ...rows.map((h) => Math.abs(contribution(h, period))),
  );
  return (
    <div className="pm-contributors">
      {rows.map((h) => (
        <button key={h.ticker} onClick={() => open(h)}>
          <Ticker holding={h} />
          <span className="pm-contribution-track">
            <i
              style={{
                width: `${(Math.abs(contribution(h, period)) / largest) * 100}%`,
              }}
              className={
                contribution(h, period) < 0 ? "pm-bar-down" : "pm-bar-up"
              }
            />
          </span>
          <BP n={contribution(h, period)} />
        </button>
      ))}
    </div>
  );
}
function Overview({
  period,
  navigate,
  open,
}: {
  period: Period;
  navigate: (v: View) => void;
  open: (h: Holding) => void;
}) {
  const ret = fundReturn(period);
  const active = (ret - PERIODS[period].benchmark) * 100;
  return (
    <>
      <div className="pm-overview-heading">
        <div>
          <span className="pm-eyebrow">THE PORTFOLIO AT A GLANCE</span>
          <h1>A clear view of the book.</h1>
          <p>Performance, positioning, and the detail behind them.</p>
        </div>
        <div className="pm-nav-value">
          <span>Portfolio value · Sep 29 close</span>
          <strong>{money(NAV)}</strong>
          <small>
            {HOLDINGS.length} holdings <i /> {fmtAccounting(CASH_WEIGHT, 1)}%
            cash
          </small>
        </div>
      </div>
      <div className="pm-metric-strip">
        <Metric
          label="Fund return"
          value={<Pct n={ret} />}
          note={PERIODS[period].label}
        />
        <Metric
          label="S&P 500 return"
          value={fmtChangePct(PERIODS[period].benchmark)}
          note="Same dates · total return"
        />
        <Metric
          label="Return vs benchmark"
          value={<BP n={active} />}
          note={`${active < 0 ? "Behind" : "Ahead of"} the S&P 500`}
        />
        <Metric
          label="Cash available"
          value={money((NAV * CASH_WEIGHT) / 100)}
          note={`${fmtAccounting(CASH_WEIGHT, 1)}% of portfolio value`}
        />
      </div>
      <div className="pm-overview-grid">
        <div className="pm-main-column">
          <Panel
            title="How are we performing?"
            sub={PERIODS[period].dates}
            action={
              <button
                className="pm-text-button"
                onClick={() => navigate("Performance")}
              >
                Explore performance <ArrowRight size={14} />
              </button>
            }
          >
            <ReturnsChart period={period} />
            <div className="pm-chart-foot">
              <ShieldCheck size={14} />
              Recorded history gets its own view. Hypothetical replay lives in
              Scenarios.
            </div>
          </Panel>
          <Panel
            title="What drove the return?"
            sub={`Largest positive and negative contributions · ${PERIODS[period].label.toLowerCase()}`}
            action={
              <button
                className="pm-text-button"
                onClick={() => navigate("Performance")}
              >
                All contributors <ArrowRight size={14} />
              </button>
            }
          >
            <Contributors period={period} open={open} />
            <div className="pm-panel-foot">
              Contribution combines a holding&apos;s return and size. Select a
              holding to see the working.
            </div>
          </Panel>
        </div>
        <aside className="pm-right-column">
          <Panel
            title="Worth a closer look"
            sub="Positioning facts, ready to inspect"
          >
            <button className="pm-review-row" onClick={() => navigate("Risk")}>
              <span className="pm-review-icon">
                <ShieldCheck size={18} />
              </span>
              <span>
                <strong>One position, {TOP_RISK.risk}% of risk</strong>
                <small>
                  {TOP_RISK.ticker} is {TOP_RISK.weight}% of the portfolio in
                  the sample risk model.
                </small>
                <b>
                  See risk contributors <ArrowRight size={13} />
                </b>
              </span>
            </button>
            <button
              className="pm-review-row"
              onClick={() => navigate("Exposure")}
            >
              <span className="pm-review-icon">
                <PieChart size={18} />
              </span>
              <span>
                <strong>
                  {LARGEST_OVERWEIGHT.name}:{" "}
                  {sectorWeight(LARGEST_OVERWEIGHT.name) -
                    LARGEST_OVERWEIGHT.benchmark}{" "}
                  pp overweight
                </strong>
                <small>
                  {sectorWeight(LARGEST_OVERWEIGHT.name)}% of the portfolio vs{" "}
                  {LARGEST_OVERWEIGHT.benchmark}% of the benchmark.
                </small>
                <b>
                  Explore allocation <ArrowRight size={13} />
                </b>
              </span>
            </button>
            <div className="pm-neutral-note">
              <Check size={15} />
              <span>
                All {HOLDINGS.length} sample holdings have prices.
                <small>No fund limits configured in this mock.</small>
              </span>
            </div>
          </Panel>
          <Panel
            title="Explore a change"
            sub="Compare before you make a decision"
            className="pm-scenario-teaser"
          >
            <span className="pm-teaser-icon">
              <FlaskConical size={24} />
            </span>
            <h3>What if we resize a position?</h3>
            <p>
              Choose a target weight and a funding source. See exactly what
              changes.
            </p>
            <Button primary onClick={() => navigate("Scenarios")}>
              Build a scenario <ArrowRight size={15} />
            </Button>
            <small>Hypothetical · no trades placed</small>
          </Panel>
          <div className="pm-session-note">
            <BookOpen size={16} />
            <div>
              <strong>The last session</strong>
              <p>
                Fund {fmtChangePct(fundReturn("day"))} vs S&amp;P 500{" "}
                {fmtChangePct(PERIODS.day.benchmark)}. Inspect contribution
                before drawing a conclusion about the cause.
              </p>
              <button
                className="pm-text-button"
                onClick={() => navigate("Performance")}
              >
                Open the detail <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
function Holdings({
  query,
  setQuery,
  open,
}: {
  query: string;
  setQuery: (v: string) => void;
  open: (h: Holding) => void;
}) {
  const [team, setTeam] = useState("All teams");
  const [sort, setSort] = useState("weight");
  const [detail, setDetail] = useState(false);
  const rows = HOLDINGS.filter(
    (h) =>
      (team === "All teams" || h.sector === team) &&
      `${h.ticker} ${h.name}`.toLowerCase().includes(query.toLowerCase()),
  ).sort((a, b) =>
    sort === "name"
      ? a.ticker.localeCompare(b.ticker)
      : sort === "return"
        ? b.day - a.day
        : b.weight - a.weight,
  );
  const exportRows = () => {
    const lines = [
      [
        "Ticker",
        "Company",
        "Team",
        "Weight %",
        "Market value USD",
        "Daily return %",
        "Daily contribution bp",
      ],
      ...rows.map((h) => [
        h.ticker,
        h.name,
        h.sector,
        h.weight,
        (NAV * h.weight) / 100,
        h.day,
        contribution(h, "day"),
      ]),
    ];
    const blob = new Blob(
      [
        lines
          .map((row) =>
            row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
          )
          .join("\n"),
      ],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "synthetic-portfolio-holdings.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <PageIntro
        title="What do we own?"
        description="A complete view of positions. Open a holding for returns, sizing, and risk."
      />
      <div className="pm-toolbar">
        <label className="pm-search">
          <Search size={16} />
          <input
            aria-label="Search holdings"
            placeholder="Search ticker or company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="pm-select">
          <ListFilter size={14} />
          <select
            aria-label="Filter holdings by team"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option>All teams</option>
            {SECTORS.filter((s) => sectorWeight(s.name)).map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="pm-select">
          <select
            aria-label="Sort holdings"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="weight">Largest weight first</option>
            <option value="return">Daily return</option>
            <option value="name">Ticker A–Z</option>
          </select>
        </label>
        <button
          className={`pm-button ${detail ? "pm-selected" : ""}`}
          aria-pressed={detail}
          onClick={() => setDetail(!detail)}
        >
          <SlidersHorizontal size={14} />
          {detail ? "Fewer columns" : "More columns"}
        </button>
        <Button onClick={exportRows}>
          <Download size={14} />
          Export
        </Button>
      </div>
      <Panel
        title={`Holdings · ${rows.length} of ${HOLDINGS.length}`}
        sub="Snapshot: Sep 29, 2026 close · weights are % of total NAV"
      >
        <div className="pm-table-scroll">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Holding</th>
                <th>Team</th>
                <th>Weight</th>
                <th>Market value</th>
                <th>Daily return</th>
                <th>
                  Contribution <small>bp</small>
                </th>
                {detail ? (
                  <>
                    <th>Last price</th>
                    <th>Shares</th>
                    <th>Volatility</th>
                  </>
                ) : null}
                <th>
                  <span className="pm-sr-only">Open holding</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.ticker}>
                  <td>
                    <button
                      className="pm-holding-button"
                      onClick={() => open(h)}
                    >
                      <Ticker holding={h} />
                    </button>
                  </td>
                  <td>{h.sector}</td>
                  <td>{fmtAccounting(h.weight, 2)}%</td>
                  <td>{money((NAV * h.weight) / 100)}</td>
                  <td>
                    <Pct n={h.day} />
                  </td>
                  <td>
                    <BP n={contribution(h, "day")} />
                  </td>
                  {detail ? (
                    <>
                      <td>{money(h.price, 2)}</td>
                      <td>
                        {fmtAccounting((NAV * h.weight) / 100 / h.price, 2)}
                      </td>
                      <td>{fmtAccounting(h.vol, 1)}%</td>
                    </>
                  ) : null}
                  <td>
                    <button
                      className="pm-icon-button"
                      onClick={() => open(h)}
                      aria-label={`Open ${h.ticker} detail`}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <div className="pm-empty">
              No holdings match. Try another ticker or team.
            </div>
          ) : null}
        </div>
        <div className="pm-table-total">
          <span>
            {rows.length} displayed holdings{" "}
            <small>· cash shown separately</small>
          </span>
          <strong>
            {fmtAccounting(
              rows.reduce((s, h) => s + h.weight, 0),
              2,
            )}
            % of NAV
          </strong>
          <strong>
            {money((rows.reduce((s, h) => s + h.weight, 0) * NAV) / 100)}
          </strong>
        </div>
      </Panel>
      <div className="pm-cash-row">
        <span className="pm-monogram">$</span>
        <div>
          <strong>Cash</strong>
          <small>Uninvested balance · whole fund</small>
        </div>
        <strong>{fmtAccounting(CASH_WEIGHT, 2)}%</strong>
        <strong>{money((CASH_WEIGHT * NAV) / 100)}</strong>
      </div>
      <Working title="How weights and contributions are calculated">
        <p>
          Market value = shares × last price. Weight = market value ÷ total
          portfolio value. Daily contribution (bp) = weight (%) × daily return
          (%). 100 bp = 1 percentage point. Cash is included in NAV and has zero
          return in these fixtures.
        </p>
      </Working>
    </>
  );
}
function PageIntro({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="pm-page-intro">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {badge ? <span className="pm-badge">{badge}</span> : null}
    </div>
  );
}
function Performance({
  period,
  open,
}: {
  period: Period;
  open: (h: Holding) => void;
}) {
  const [breakdown, setBreakdown] = useState("Holdings");
  const ret = fundReturn(period);
  const active = (ret - PERIODS[period].benchmark) * 100;
  const allocation = period === "day" ? -1.4 : -8;
  const rows = [...HOLDINGS].sort(
    (a, b) => contribution(b, period) - contribution(a, period),
  );
  return (
    <>
      <PageIntro
        title="What drove our returns?"
        description={`Fund and benchmark on the same dates. ${PERIODS[period].dates}.`}
        badge="Actual-history layout"
      />
      <div className="pm-metric-strip">
        <Metric
          label="Fund return"
          value={<Pct n={ret} />}
          note={PERIODS[period].label}
        />
        <Metric
          label="Benchmark return"
          value={fmtChangePct(PERIODS[period].benchmark)}
          note="S&P 500 · total return"
        />
        <Metric
          label="Difference"
          value={<BP n={active} />}
          note="Fund minus benchmark"
        />
        <Metric
          label="Return in dollars"
          value={money((NAV * ret) / 100)}
          note="Illustrative constant-NAV fixture"
        />
      </div>
      <Panel
        title="Fund vs benchmark"
        sub="Cumulative return · both series start at 0%"
      >
        <ReturnsChart period={period} />
      </Panel>
      <div className="pm-two-column">
        <Panel
          title="Where did the difference come from?"
          sub="Illustrative attribution · no causal claim"
        >
          <div className="pm-attribution">
            <div>
              <span>
                Allocation effect<small>Where the fund was weighted</small>
              </span>
              <BP n={allocation} />
            </div>
            <div>
              <span>
                Selection effect<small>Returns within those allocations</small>
              </span>
              <BP n={active - allocation} />
            </div>
            <div className="pm-attribution-total">
              <strong>Total difference</strong>
              <BP n={active} />
            </div>
          </div>
          <Working title="Attribution methodology and reconciliation">
            <p>
              These two effects are illustrative review fixtures and sum to fund
              minus benchmark. Production must retain its existing attribution
              engine, interaction treatment, return basis, and reconciliation. A
              contribution identifies an arithmetic driver; explaining its cause
              remains the analyst&apos;s task.
            </p>
          </Working>
        </Panel>
        <Panel
          title="Largest contributors"
          sub={`Contribution to fund return · ${PERIODS[period].label}`}
        >
          <Contributors period={period} open={open} />
        </Panel>
      </div>
      <Panel
        title="Detailed contribution"
        sub="All holdings remain available beneath the summary"
        action={
          <div className="pm-segments">
            {["Holdings", "Teams"].map((v) => (
              <button
                key={v}
                aria-pressed={breakdown === v}
                className={breakdown === v ? "pm-active" : ""}
                onClick={() => setBreakdown(v)}
              >
                {v}
              </button>
            ))}
          </div>
        }
      >
        <div className="pm-table-scroll">
          <table className="pm-table">
            <thead>
              <tr>
                <th>{breakdown === "Holdings" ? "Holding" : "Team"}</th>
                <th>Weight</th>
                <th>{PERIODS[period].label} return</th>
                <th>Fund contribution · bp</th>
              </tr>
            </thead>
            <tbody>
              {breakdown === "Holdings"
                ? rows.map((h) => (
                    <tr key={h.ticker}>
                      <td>
                        <button
                          className="pm-holding-button"
                          onClick={() => open(h)}
                        >
                          <Ticker holding={h} />
                        </button>
                      </td>
                      <td>{fmtAccounting(h.weight, 1)}%</td>
                      <td>
                        <Pct n={period === "day" ? h.day : h.period} />
                      </td>
                      <td>
                        <BP n={contribution(h, period)} />
                      </td>
                    </tr>
                  ))
                : SECTORS.filter((s) => sectorWeight(s.name)).map((s) => {
                    const c = HOLDINGS.filter(
                      (h) => h.sector === s.name,
                    ).reduce((a, h) => a + contribution(h, period), 0);
                    return (
                      <tr key={s.name}>
                        <td>{s.name}</td>
                        <td>{sectorWeight(s.name)}%</td>
                        <td>
                          <Pct n={c / sectorWeight(s.name)} />
                        </td>
                        <td>
                          <BP n={c} />
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
            <tfoot>
              <tr>
                <td>Fund · including {CASH_WEIGHT}% cash at zero return</td>
                <td>100%</td>
                <td>
                  <Pct n={ret} />
                </td>
                <td>
                  <BP n={ret * 100} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </>
  );
}
function Risk({ open }: { open: (h: Holding) => void }) {
  const [lookback, setLookback] = useState("1 year");
  const [measure, setMeasure] = useState("Risk contribution");
  const factor = lookback === "1 year" ? 1 : 1.08;
  return (
    <>
      <PageIntro
        title="Where is the portfolio’s risk?"
        description="Today’s weights applied to historical returns. Estimates describe variability, not a loss guarantee."
        badge="Model estimate"
      />
      <div className="pm-toolbar">
        <span className="pm-toolbar-label">Estimation window</span>
        <div className="pm-segments">
          {["1 year", "2 years"].map((v) => (
            <button
              key={v}
              aria-pressed={lookback === v}
              className={lookback === v ? "pm-active" : ""}
              onClick={() => setLookback(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="pm-context">
          Daily observations through Sep 29 · sample estimates
        </span>
      </div>
      <div className="pm-metric-strip">
        <Metric
          label="Annualized volatility"
          value={`${fmtAccounting(16.8 * factor, 1)}%`}
          note="Historical variability of portfolio returns"
        />
        <Metric
          label="Tracking error"
          value={`${fmtAccounting(5.2 * factor, 1)}%`}
          note="Annualized variability vs benchmark"
        />
        <Metric
          label="Beta to S&P 500"
          value={fmtAccounting(1.06 * factor, 2)}
          note="Historical market sensitivity"
        />
        <Metric
          label="1-day 95% VaR"
          value={
            <span className="pm-down">{money(-NAV * 0.0182 * factor)}</span>
          }
          note={`${fmtAccounting(1.82 * factor, 2)}% of NAV · not a maximum loss`}
        />
      </div>
      <div className="pm-two-column">
        <Panel
          title="What contributes most to risk?"
          sub="A holding’s share of estimated total portfolio risk"
        >
          <div className="pm-risk-callout">
            <strong>
              {TOP_RISK.ticker} contributes {TOP_RISK.risk}% of risk
            </strong>
            <p>
              Its {TOP_RISK.weight}% portfolio weight is smaller than its
              estimated risk share.
            </p>
          </div>
          <div className="pm-risk-bars">
            {[...HOLDINGS]
              .sort((a, b) => b.risk - a.risk)
              .slice(0, 5)
              .map((h) => (
                <button key={h.ticker} onClick={() => open(h)}>
                  <span>{h.ticker}</span>
                  <div>
                    <i style={{ width: `${(h.risk / 25) * 100}%` }} />
                  </div>
                  <strong>{h.risk}%</strong>
                </button>
              ))}
          </div>
          <div className="pm-panel-foot">
            Sizing, volatility, and correlation all matter. Share of risk is not
            share of NAV.
          </div>
        </Panel>
        <Panel
          title="How could a shock affect the book?"
          sub="Illustrative stress estimates · today’s allocation"
        >
          <div className="pm-stress-list">
            {[
              {
                name: "Broad equity sell-off",
                shock: "S&P 500 −10%",
                value: -10.6 * factor,
              },
              {
                name: "Technology shock",
                shock: "Technology sleeve −15%; others unchanged",
                value: sectorShock("Technology", -15),
              },
              {
                name: "Financials shock",
                shock: "Financials sleeve −10%; others unchanged",
                value: sectorShock("Financials", -10),
              },
            ].map((s) => (
              <div key={s.name}>
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.shock}</small>
                </span>
                <span>
                  <Pct n={s.value} />
                  <small>{money((NAV * s.value) / 100)}</small>
                </span>
              </div>
            ))}
          </div>
          <Working title="Stress assumptions and limitations">
            <p>
              Broad equity shock uses the displayed sample beta × market shock.
              Sector shocks use sector weight × sector shock, with other
              holdings flat. Results exclude nonlinear effects, changing
              correlations, liquidity, and transaction costs. They are scenario
              estimates, not forecasts.
            </p>
          </Working>
        </Panel>
      </div>
      <Panel
        title="Holdings risk detail"
        sub={`${lookback} estimation window · every position`}
        action={
          <label className="pm-select">
            <select
              aria-label="Sort risk detail"
              value={measure}
              onChange={(e) => setMeasure(e.target.value)}
            >
              <option>Risk contribution</option>
              <option>Volatility</option>
              <option>Weight</option>
            </select>
          </label>
        }
      >
        <div className="pm-table-scroll">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Holding</th>
                <th>Weight · NAV</th>
                <th>Volatility · annualized</th>
                <th>Beta</th>
                <th>Share of total risk</th>
              </tr>
            </thead>
            <tbody>
              {[...HOLDINGS]
                .sort((a, b) =>
                  measure === "Volatility"
                    ? b.vol - a.vol
                    : measure === "Weight"
                      ? b.weight - a.weight
                      : b.risk - a.risk,
                )
                .map((h) => (
                  <tr key={h.ticker}>
                    <td>
                      <button
                        className="pm-holding-button"
                        onClick={() => open(h)}
                      >
                        <Ticker holding={h} />
                      </button>
                    </td>
                    <td>{h.weight}%</td>
                    <td>{fmtAccounting(h.vol * factor, 1)}%</td>
                    <td>{fmtAccounting(h.beta * factor, 2)}</td>
                    <td>{h.risk}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Working title="More risk detail: drawdown, expected shortfall, concentration, and coverage">
        <div className="pm-detail-grid">
          <Metric
            label="Modeled max drawdown"
            value={fmtPct(-12.4, 1)}
            note="Current-weight replay · not actual fund drawdown"
          />
          <Metric
            label="95% expected shortfall"
            value={fmtPct(-2.6, 1)}
            note="Average loss in sample worst 5% of days"
          />
          <Metric
            label="Top three holdings"
            value={`${topWeight(3)}%`}
            note={`Share of NAV · ${TOP_THREE.join(", ")}`}
          />
          <Metric
            label="Price coverage"
            value={`${HOLDINGS.length} / ${HOLDINGS.length}`}
            note="All sample positions · cash excluded"
          />
        </div>
        <p>
          Sample risk shares and risk statistics are supplied design fixtures,
          not derived from a covariance matrix. The 2-year control demonstrates
          an alternate fixture. The live implementation must use its existing
          coverage, covariance, and risk calculations.
        </p>
      </Working>
      <Working title="Correlation, active risk, and realized risk">
        <div className="pm-two-column">
          <Panel
            title="Correlation · top three holdings"
            sub="Illustrative coefficients · same estimation window"
          >
            <div className="pm-table-scroll">
              <table className="pm-table">
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th>MSFT</th>
                    <th>GOOG</th>
                    <th>NVDA</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [1, 0.61, 0.72],
                    [0.61, 1, 0.58],
                    [0.72, 0.58, 1],
                  ].map((row, i) => (
                    <tr key={i}>
                      <td>{["MSFT", "GOOG", "NVDA"][i]}</td>
                      {row.map((v, j) => (
                        <td
                          key={j}
                          style={{
                            background: `color-mix(in srgb, var(--pm-green) ${v * 17}%, var(--pm-paper))`,
                          }}
                        >
                          {fmtAccounting(v, 2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pm-panel-foot">
              Closer to +1 means returns tend to move together. Full covariance
              inputs stay available in the live calculation detail.
            </div>
          </Panel>
          <Panel
            title="Realized risk · fund’s own history"
            sub="Separate from today’s weights applied to past returns"
          >
            <div className="pm-neutral-note">
              <CircleHelp size={17} />
              <span>
                Insufficient recorded history in this sample.
                <small>
                  Realized volatility, beta, tracking error, Sharpe, and
                  drawdown remain unavailable. Preserve the live
                  minimum-observation rules and ledger return series.
                </small>
              </span>
            </div>
          </Panel>
        </div>
        <div className="pm-detail-grid">
          <Metric
            label="Top five weight"
            value={`${topWeight(5)}%`}
            note="Concentration as a share of NAV"
          />
          <Metric
            label="Effective equity positions"
            value={fmtAccounting(EFFECTIVE_POSITIONS, 1)}
            note="Inverse sum of squared normalized equity weights"
          />
        </div>
        <p>
          <strong>Active risk detail:</strong> tracking error is about
          differences from the benchmark, not total volatility. The live
          drill-down retains each holding’s active weight, share of active risk,
          marginal tracking error, sector decomposition, covariance inputs, and
          daily returns export. This fixture has no active-risk covariance
          calculation.
        </p>
        <p>
          <strong>Model working:</strong> annualized volatility = √(wᵀΣw) ×
          √252. Beta = covariance with the market ÷ market variance. Historical
          VaR uses the lower-tail daily portfolio returns. Sharpe requires a
          stated risk-free-rate series; it remains unavailable here.
        </p>
      </Working>
    </>
  );
}
function Exposure({
  open,
  navigate,
}: {
  open: (h: Holding) => void;
  navigate: (v: View) => void;
}) {
  const [sector, setSector] = useState<string | null>(null);
  return (
    <>
      <PageIntro
        title="Where are we allocated?"
        description="Compare portfolio weights with the benchmark, then open a sector to inspect the positions."
        badge="Current allocation"
      />
      <div className="pm-metric-strip">
        <Metric
          label="Invested in equities"
          value={`${INVESTED_WEIGHT}%`}
          note={`${CASH_WEIGHT}% cash · included in NAV`}
        />
        <Metric
          label="Largest allocation"
          value={`${sectorWeight(LARGEST_SECTOR.name)}%`}
          note={`${LARGEST_SECTOR.name} · ${LARGEST_SECTOR.benchmark}% in benchmark`}
        />
        <Metric
          label="Largest overweight"
          value={`${signed(sectorWeight(LARGEST_OVERWEIGHT.name) - LARGEST_OVERWEIGHT.benchmark, 0)} pp`}
          note={`${LARGEST_OVERWEIGHT.name} · ${sectorWeight(LARGEST_OVERWEIGHT.name)}% vs ${LARGEST_OVERWEIGHT.benchmark}%`}
        />
        <Metric
          label="Top three holdings"
          value={`${topWeight(3)}%`}
          note={`${TOP_THREE.join(", ")} · % of NAV`}
        />
      </div>
      <div className="pm-two-column">
        <Panel title="Portfolio allocation" sub="Weights sum to 100% of NAV">
          <div className="pm-allocation">
            <div
              className="pm-donut"
              style={{ background: ALLOCATION_GRADIENT }}
            >
              <div>
                <strong>{HOLDINGS.length}</strong>
                <span>holdings</span>
              </div>
            </div>
            <div className="pm-allocation-key">
              {HELD_SECTORS.map((s) => (
                <button key={s.name} onClick={() => setSector(s.name)}>
                  <i style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <strong>{sectorWeight(s.name)}%</strong>
                </button>
              ))}
              <div>
                <i style={{ background: CASH_COLOR }} />
                <span>Cash</span>
                <strong>{CASH_WEIGHT}%</strong>
              </div>
            </div>
          </div>
        </Panel>
        <Panel
          title="Portfolio vs benchmark"
          sub="Percentage points = portfolio weight − benchmark weight"
        >
          <div className="pm-sector-comparison">
            {SECTORS.map((s) => (
              <button key={s.name} onClick={() => setSector(s.name)}>
                <span>{s.name}</span>
                <div className="pm-sector-tracks">
                  <i
                    style={{ width: `${(sectorWeight(s.name) / 35) * 100}%` }}
                  />
                  <i style={{ width: `${(s.benchmark / 35) * 100}%` }} />
                </div>
                <strong>
                  {signed(sectorWeight(s.name) - s.benchmark, 0)} pp
                </strong>
              </button>
            ))}
          </div>
          <div className="pm-comparison-key">
            <span>
              <i />
              Portfolio
            </span>
            <span>
              <i />
              S&amp;P 500
            </span>
          </div>
        </Panel>
      </div>
      <Panel
        title={sector ? `${sector} · holdings` : "Sector allocation detail"}
        sub="Snapshot: Sep 29 close · benchmark weights dated Sep 17"
        action={
          sector ? (
            <button className="pm-text-button" onClick={() => setSector(null)}>
              All sectors <X size={14} />
            </button>
          ) : undefined
        }
      >
        <div className="pm-table-scroll">
          <table className="pm-table">
            <thead>
              <tr>
                <th>{sector ? "Holding" : "Sector"}</th>
                <th>Portfolio weight</th>
                <th>{sector ? "Market value" : "Benchmark weight"}</th>
                <th>{sector ? "Risk share" : "Difference · pp"}</th>
              </tr>
            </thead>
            <tbody>
              {sector
                ? HOLDINGS.filter((h) => h.sector === sector).map((h) => (
                    <tr key={h.ticker}>
                      <td>
                        <button
                          className="pm-holding-button"
                          onClick={() => open(h)}
                        >
                          <Ticker holding={h} />
                        </button>
                      </td>
                      <td>{h.weight}%</td>
                      <td>{money((NAV * h.weight) / 100)}</td>
                      <td>{h.risk}%</td>
                    </tr>
                  ))
                : SECTORS.map((s) => (
                    <tr key={s.name}>
                      <td>
                        <button
                          className="pm-text-button"
                          onClick={() => setSector(s.name)}
                        >
                          {s.name}
                          <ChevronRight size={13} />
                        </button>
                      </td>
                      <td>{sectorWeight(s.name)}%</td>
                      <td>{s.benchmark}%</td>
                      <td>
                        {signed(sectorWeight(s.name) - s.benchmark, 0)} pp
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {sector && HOLDINGS.every((h) => h.sector !== sector) ? (
            <div className="pm-empty">
              No portfolio holdings in these benchmark sectors.
            </div>
          ) : null}
        </div>
      </Panel>
      <Working title="Concentration and allocation working">
        <div className="pm-detail-grid">
          <Metric
            label="Sector-level active share"
            value={`${SECTOR_ACTIVE_SHARE}%`}
            note="Half the absolute weight differences, including cash"
          />
          <Metric
            label="Effective equity positions"
            value={fmtAccounting(EFFECTIVE_POSITIONS, 1)}
            note={`${HOLDINGS.length} names; normalized invested weights`}
          />
        </div>
        <p>
          Sector-level active share = ½ × ({SECTOR_DIFFERENCES.join(" + ")}) ={" "}
          {SECTOR_ACTIVE_SHARE}%. Cash is {CASH_WEIGHT}% in the fund and 0% in
          the equity benchmark. This grouped fixture is not stock-level active
          share.
        </p>
      </Working>
      <Working title="Factor exposure and ETF look-through">
        <p>
          <strong>Factor exposure:</strong> market beta 1.06; other factor
          estimates are unavailable in this fixture. Production should preserve
          the regression detail, factor benchmark, and estimation window.
        </p>
        <p>
          <strong>ETF look-through:</strong> not applicable—this sample has only
          individual equities. Where funds are held, distinguish direct and
          underlying exposure, disclose constituent dates, and show unmapped
          residuals.
        </p>
        <button className="pm-text-button" onClick={() => navigate("Risk")}>
          See how allocation contributes to risk <ArrowRight size={14} />
        </button>
      </Working>
    </>
  );
}
function Scenarios({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [source, setSource] = useState("cash");
  const [target, setTarget] = useState(
    String(HOLDINGS.find((h) => h.ticker === initialTicker)!.weight + 2),
  );
  const [applied, setApplied] = useState<ReturnType<
    typeof allocationChange
  > | null>(null);
  const [kind, setKind] = useState("Resize a holding");
  const current = HOLDINGS.find((h) => h.ticker === ticker)!;
  const result = allocationChange(
    ticker,
    target.trim() === "" ? NaN : Number(target),
    source,
  );
  const change = (fn: () => void) => {
    fn();
    setApplied(null);
  };
  return (
    <>
      <PageIntro
        title="What would change?"
        description="Build a hypothetical allocation. Review the funding and compare it with the current book."
        badge="Hypothetical · no trades"
      />
      <div className="pm-scenario-types">
        {["Resize a holding", "Market shock", "Historical replay"].map(
          (v, i) => (
            <button
              key={v}
              className={kind === v ? "pm-selected" : ""}
              onClick={() => setKind(v)}
            >
              <span>0{i + 1}</span>
              <strong>{v}</strong>
              <small>
                {i === 0
                  ? "Change weights and funding"
                  : i === 1
                    ? "Inspect a defined shock"
                    : "Test an allocation in the past"}
              </small>
            </button>
          ),
        )}
      </div>
      {kind === "Resize a holding" ? (
        <div className="pm-scenario-grid">
          <Panel
            title="1. Define the change"
            sub="Weights are percentages of total portfolio NAV"
          >
            <div className="pm-form">
              <label>
                Holding
                <select
                  value={ticker}
                  onChange={(e) =>
                    change(() => {
                      setTicker(e.target.value);
                      setTarget(
                        String(
                          HOLDINGS.find((h) => h.ticker === e.target.value)!
                            .weight + 2,
                        ),
                      );
                      if (source === e.target.value) setSource("cash");
                    })
                  }
                >
                  {HOLDINGS.map((h) => (
                    <option key={h.ticker} value={h.ticker}>
                      {h.ticker} · {h.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pm-current-weight">
                <span>Current weight</span>
                <strong>{fmtAccounting(current.weight, 1)}%</strong>
              </div>
              <label>
                Target weight (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step=".5"
                  value={target}
                  onChange={(e) => change(() => setTarget(e.target.value))}
                />
              </label>
              <label>
                Fund increase / receive reduction
                <select
                  value={source}
                  onChange={(e) => change(() => setSource(e.target.value))}
                >
                  <option value="cash">Cash · {CASH_WEIGHT}% available</option>
                  {HOLDINGS.filter((h) => h.ticker !== ticker).map((h) => (
                    <option key={h.ticker} value={h.ticker}>
                      {h.ticker} · {h.weight}%
                    </option>
                  ))}
                </select>
              </label>
              <div className="pm-form-hint">
                Increasing a holding reduces the funding source. Reducing it
                returns value to that source.
              </div>
              {!result.ok ? (
                <p className="pm-validation" role="alert">
                  {result.error}
                </p>
              ) : (
                <div className="pm-funding-check">
                  <Check size={16} />
                  <span>Fully funded · portfolio remains 100%</span>
                </div>
              )}
              <button
                className="pm-button pm-primary"
                disabled={!result.ok}
                onClick={() => setApplied(result)}
              >
                Compare allocation <ArrowRight size={15} />
              </button>
            </div>
          </Panel>
          <Panel
            title="2. Review before and after"
            sub={
              applied?.ok
                ? "Your scenario · allocation arithmetic only"
                : "Comparison appears after you review the change"
            }
          >
            {applied?.ok ? (
              <>
                <div className="pm-scenario-result">
                  <span className="pm-eyebrow">PROPOSED WEIGHT CHANGE</span>
                  <strong>
                    {ticker} <span>{current.weight}%</span>{" "}
                    <ArrowRight size={23} /> {Number(target)}%
                  </strong>
                  <p>
                    {source === "cash" ? "Cash" : source} funds{" "}
                    {signed(applied.delta, 1)} pp ·{" "}
                    {money((Math.abs(applied.delta) * NAV) / 100)} changes
                    allocation.
                  </p>
                </div>
                <div className="pm-table-scroll">
                  <table className="pm-table">
                    <thead>
                      <tr>
                        <th>Allocation</th>
                        <th>Current</th>
                        <th>Scenario</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applied.weights
                        .filter(
                          (h) => h.ticker === ticker || h.ticker === source,
                        )
                        .map((h) => (
                          <tr key={h.ticker}>
                            <td>{h.ticker}</td>
                            <td>{h.weight}%</td>
                            <td>{fmtAccounting(h.nextWeight, 2)}%</td>
                            <td>{signed(h.nextWeight - h.weight, 1)} pp</td>
                          </tr>
                        ))}
                      <tr>
                        <td>Cash</td>
                        <td>{CASH_WEIGHT}%</td>
                        <td>{fmtAccounting(applied.cash, 2)}%</td>
                        <td>{signed(applied.cash - CASH_WEIGHT, 1)} pp</td>
                      </tr>
                      <tr>
                        <td>Total NAV</td>
                        <td>100%</td>
                        <td>100%</td>
                        <td>0 pp</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="pm-neutral-note">
                  <CircleHelp size={16} />
                  <span>
                    Risk and return comparison needs the calculation engine.
                    <small>
                      This mock computes weights and funding only; it does not
                      predict performance.
                    </small>
                  </span>
                </div>
              </>
            ) : (
              <div className="pm-scenario-empty">
                <FlaskConical size={34} />
                <h3>Every change has a source.</h3>
                <p>
                  Start with one holding, choose the new size, and decide where
                  the funding comes from.
                </p>
                <div>
                  <span>Current allocation</span>
                  <ArrowRight size={16} />
                  <span>Your scenario</span>
                </div>
              </div>
            )}
          </Panel>
        </div>
      ) : kind === "Market shock" ? (
        <Panel
          title="Market shock · example comparison"
          sub="Predefined sample: technology −15%; other holdings unchanged"
        >
          <div className="pm-metric-strip">
            <Metric
              label="Technology allocation"
              value={`${sectorWeight("Technology")}%`}
              note="Current portfolio"
            />
            <Metric
              label="Applied shock"
              value={fmtPct(-15, 0)}
              note="Technology holdings only"
            />
            <Metric
              label="Portfolio impact"
              value={<Pct n={sectorShock("Technology", -15)} />}
              note={`${sectorWeight("Technology")}% × ${fmtPct(-15, 0)}`}
            />
            <Metric
              label="Estimated dollar change"
              value={money((NAV * sectorShock("Technology", -15)) / 100)}
              note="No correlation or second-order effects"
            />
          </div>
          <Working title="View shocked holdings and assumptions">
            <p>
              {HOLDINGS.filter((h) => h.sector === "Technology")
                .map(
                  (h) =>
                    `${h.ticker}: ${h.weight}% × ${fmtPct(-15, 0)} = ${fmtChangePct(h.weight * -0.15)} of NAV`,
                )
                .join("; ")}
              . Cash and all other holdings remain flat. This is a defined
              arithmetic shock, not a prediction.
            </p>
          </Working>
        </Panel>
      ) : (
        <Panel
          title="Historical replay · review layout"
          sub="Hypothetical allocation applied to a past period"
        >
          <div className="pm-replay-explainer">
            <History size={28} />
            <div>
              <h3>Keep replay separate from actual performance.</h3>
              <p>
                The production replay retains the date range, benchmark, changed
                weights, saved scenarios, contribution differences, daily
                results, and risk comparison. This mock outlines that workflow
                without fabricating replay results.
              </p>
            </div>
          </div>
          <div className="pm-replay-settings">
            <label>
              Start date
              <input type="date" defaultValue="2026-09-17" />
            </label>
            <label>
              End date
              <input type="date" defaultValue="2026-09-29" />
            </label>
            <label>
              Benchmark
              <select defaultValue="SPY">
                <option value="SPY">SPY · S&amp;P 500 total return</option>
              </select>
            </label>
          </div>
          <div className="pm-replay-preview">
            <span className="pm-eyebrow">
              COMPARISON DETAIL · LAYOUT PREVIEW
            </span>
            <div className="pm-table-scroll">
              <table className="pm-table">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>Current-weight replay</th>
                    <th>Modified replay</th>
                    <th>Benchmark</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    "Cumulative return",
                    "Annualized volatility",
                    "Maximum drawdown",
                    "Return vs benchmark",
                  ].map((label) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Choose a historical period, review changed weights, then run the
              production replay. Results are unavailable in this design mock.
            </p>
          </div>
          <Working title="Contribution differences, daily results, and saved scenarios">
            <p>
              The comparison retains holding-level return contributions and
              their change between portfolios; a date-by-date return table;
              current and modified risk; and named scenarios with author, saved
              date, and scope. Results and saved scenarios are unavailable in
              this fixture.
            </p>
            <div className="pm-table-scroll">
              <table className="pm-table">
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th>Current weight</th>
                    <th>Modified weight</th>
                    <th>Contribution difference</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{ticker}</td>
                    <td>{current.weight}%</td>
                    <td>{result.ok ? `${Number(target)}%` : "—"}</td>
                    <td>Not run</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Working>
          <Working title="Replay assumptions that stay visible">
            <p>
              Show the engine&apos;s actual cash treatment, rebalancing rule,
              adjusted-price basis, coverage exclusions, and baseline date. A
              replay using today&apos;s holdings is hypothetical and may have
              hindsight or survivorship bias. It must never appear as the
              fund&apos;s realized return.
            </p>
          </Working>
        </Panel>
      )}
    </>
  );
}
const EVENTS = [
  {
    id: "DEMO-104",
    date: "Sep 29, 2026",
    type: "Buy",
    ticker: "CRM",
    text: "Added to Salesforce",
    detail: "50 shares × $267.20",
    cash: -13360,
    author: "Sample analyst",
    result: "7.00% closing weight",
    status: "Recorded",
  },
  {
    id: "DEMO-103",
    date: "Sep 29, 2026",
    type: "Dividend",
    ticker: "MSFT",
    text: "Microsoft dividend",
    detail: "Cash distribution",
    cash: 1180,
    author: "Sample ledger import",
    result: "Credited to cash",
    status: "Recorded",
  },
  {
    id: "DEMO-102",
    date: "Sep 28, 2026",
    type: "Sell",
    ticker: "NVDA",
    text: "Reduced NVIDIA",
    detail: "75 shares × $184.10",
    cash: 13807.5,
    author: "Sample analyst",
    result: "10.00% closing weight",
    status: "Recorded",
  },
  {
    id: "DEMO-101",
    date: "Sep 25, 2026",
    type: "Cash",
    ticker: "Cash",
    text: "Capital contribution",
    detail: "External inflow · not investment return",
    cash: 25000,
    author: "Sample administrator",
    result: "Credited to cash",
    status: "Recorded",
  },
];
function Activity() {
  const [filter, setFilter] = useState("All activity");
  const [query, setQuery] = useState("");
  const rows = EVENTS.filter(
    (e) =>
      (filter === "All activity" ||
        (filter === "Trades"
          ? ["Buy", "Sell"].includes(e.type)
          : filter === e.type)) &&
      `${e.ticker} ${e.text}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageIntro
        title="What changed in the book?"
        description="A chronological trail of trades, cash movements, and distributions. Expand a record for the full detail."
      />
      <div className="pm-toolbar">
        <div className="pm-segments">
          {["All activity", "Trades", "Cash", "Dividend"].map((v) => (
            <button
              key={v}
              className={filter === v ? "pm-active" : ""}
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}
            >
              {v === "Dividend" ? "Dividends" : v}
            </button>
          ))}
        </div>
        <label className="pm-search">
          <Search size={15} />
          <input
            aria-label="Search activity"
            placeholder="Search ticker or activity…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="pm-context">
          Sep 17 – Sep 29 · illustrative records
        </span>
      </div>
      <Panel
        title={`${rows.length} records`}
        sub="Cash movements are separate from investment returns"
      >
        <div className="pm-events">
          {rows.map((e) => (
            <details key={e.id}>
              <summary>
                <span
                  className={`pm-event-icon ${e.cash > 0 ? "pm-inflow" : ""}`}
                >
                  {e.cash > 0 ? (
                    <ArrowDownLeft size={19} />
                  ) : (
                    <ArrowUpRight size={19} />
                  )}
                </span>
                <span>
                  <strong>{e.text}</strong>
                  <small>
                    {e.date} · {e.detail}
                  </small>
                </span>
                <span className="pm-event-type">{e.type}</span>
                <strong>{fmtChangeUsd(e.cash)}</strong>
                <ChevronDown size={16} />
              </summary>
              <div className="pm-event-detail">
                <dl>
                  <div>
                    <dt>Record ID</dt>
                    <dd>{e.id}</dd>
                  </div>
                  <div>
                    <dt>Recorded by</dt>
                    <dd>{e.author}</dd>
                  </div>
                  <div>
                    <dt>Result</dt>
                    <dd>{e.result}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{e.status} · sample record</dd>
                  </div>
                </dl>
                <p>
                  Design fixture only. These four examples are not a full ledger
                  and do not reconcile the sample portfolio. Production keeps
                  its original history, edit permissions, and void/reversal
                  audit trail.
                </p>
              </div>
            </details>
          ))}
          {rows.length === 0 ? (
            <div className="pm-empty">No records match these filters.</div>
          ) : null}
        </div>
      </Panel>
      <Working title="How trade activity differs from performance">
        <p>
          A purchase exchanges cash for a security; it is not a loss. A sale
          exchanges a security for cash; it is not itself an investment gain.
          External contributions change NAV and must be handled separately in
          the fund&apos;s return calculation.
        </p>
      </Working>
    </>
  );
}
function HoldingDialog({
  holding,
  close,
  navigate,
  explore,
}: {
  holding: Holding | null;
  close: () => void;
  navigate: (v: View) => void;
  explore: (ticker: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (holding) dialog?.showModal();
    else dialog?.close();
  }, [holding]);
  return (
    <dialog
      className="pm-dialog"
      ref={ref}
      onClose={close}
      aria-labelledby="pm-holding-title"
    >
      <div className="pm-dialog-head">
        <span className="pm-eyebrow">HOLDING DETAIL · SAMPLE DATA</span>
        <button
          className="pm-icon-button"
          aria-label="Close holding detail"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {holding ? (
        <>
          <div className="pm-dialog-title">
            <Ticker holding={holding} />
            <h2 id="pm-holding-title">{holding.name}</h2>
            <p>{holding.sector} · Sep 29, 2026 close</p>
          </div>
          <div className="pm-detail-grid">
            <Metric
              label="Weight of NAV"
              value={`${holding.weight}%`}
              note={money((NAV * holding.weight) / 100)}
            />
            <Metric
              label="Last session return"
              value={<Pct n={holding.day} />}
              note={`Last price ${money(holding.price, 2)}`}
            />
            <Metric
              label="Daily contribution"
              value={<BP n={contribution(holding, "day")} />}
              note="Contribution to portfolio return"
            />
            <Metric
              label="Share of modeled risk"
              value={`${holding.risk}%`}
              note="1-year sample estimate"
            />
          </div>
          <Working title="Show the contribution calculation">
            <p>
              {holding.weight}% weight × {fmtChangePct(holding.day)} daily
              return = {signed(contribution(holding, "day"), 2)} basis points of
              portfolio return. Dollar contribution using constant sample NAV:{" "}
              {money((NAV * contribution(holding, "day")) / 10000, 2)}.
            </p>
          </Working>
          <div className="pm-dialog-actions">
            <Button
              onClick={() => {
                close();
                navigate("Risk");
              }}
            >
              Inspect risk <ArrowRight size={14} />
            </Button>
            <Button
              primary
              onClick={() => {
                close();
                explore(holding.ticker);
              }}
            >
              Explore a scenario <FlaskConical size={14} />
            </Button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
function HelpDialog({ open, close }: { open: boolean; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      className="pm-dialog"
      ref={ref}
      onClose={close}
      aria-labelledby="pm-help-title"
    >
      <div className="pm-dialog-head">
        <span className="pm-eyebrow">READING THE PORTFOLIO</span>
        <button
          className="pm-icon-button"
          onClick={close}
          aria-label="Close guide"
        >
          <X size={20} />
        </button>
      </div>
      <h2 id="pm-help-title">Start with a question.</h2>
      <div className="pm-guide-list">
        {VIEWS.map((v) => (
          <div key={v.name}>
            <v.icon size={19} />
            <span>
              <strong>{v.name}</strong>
              <small>{v.hint}</small>
            </span>
          </div>
        ))}
      </div>
      <Working title="Units, dates, and evidence">
        <p>
          1 percentage point (pp) = 100 basis points (bp). Holding return is a
          security&apos;s price/total return; portfolio contribution reflects
          its size. Risk uses its own historical estimation window. Exposure is
          a point-in-time allocation. Scenarios are hypothetical.
        </p>
      </Working>
      <p className="pm-help-note">
        All values are invented design fixtures. No live portfolio, database,
        AI, or trade actions are connected.
      </p>
    </dialog>
  );
}
export function PortfolioMock() {
  const [view, setView] = useState<View>("Overview");
  const [scenarioTicker, setScenarioTicker] = useState("NVDA");
  // Bumped on every "Explore a scenario" so Scenarios restarts on that holding's resize even if the ticker is unchanged.
  const [scenarioRun, setScenarioRun] = useState(0);
  const searchFocusPending = useRef(false);
  useEffect(() => {
    if (view === "Holdings" && searchFocusPending.current) {
      document
        .querySelector<HTMLInputElement>('input[aria-label="Search holdings"]')
        ?.focus();
      searchFocusPending.current = false;
    }
  }, [view]);
  const [period, setPeriod] = useState<Period>("ledger");
  const [dark, setDark] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [holding, setHolding] = useState<Holding | null>(null);
  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const performanceContext = view === "Overview" || view === "Performance";
  return (
    <div className="pm" data-theme={dark ? "dark" : "light"}>
      <aside className="pm-sidebar">
        <a className="pm-brand" href="/portfolio-mock">
          <Image
            src="/hoot/mark.webp"
            alt=""
            width={32}
            height={32}
            unoptimized
          />
          <span>
            Owl Fund<small>THE OWL’S NEST</small>
          </span>
        </a>
        <div className="pm-workspace-label">WORKSPACE</div>
        <button
          className="pm-side-main pm-selected"
          onClick={() => go("Overview")}
        >
          <PieChart size={18} />
          Portfolio
          <span className="pm-live-dot" />
        </button>
        <div className="pm-workspace-label pm-top-gap">PORTFOLIO VIEWS</div>
        <nav aria-label="Portfolio sidebar">
          {VIEWS.map((v) => (
            <button
              key={v.name}
              aria-current={view === v.name ? "page" : undefined}
              className={`pm-side-view ${view === v.name ? "pm-current" : ""}`}
              onClick={() => go(v.name)}
            >
              <v.icon size={16} />
              <span>{v.name}</span>
              {view === v.name ? <ChevronRight size={14} /> : null}
            </button>
          ))}
        </nav>
        <div className="pm-sidebar-bottom">
          <div className="pm-prototype-note">
            <span>
              <FlaskConical size={15} />
              Design preview
            </span>
            <p>Explore the full workflow with invented sample data.</p>
          </div>
          <button className="pm-side-view" onClick={() => setHelp(true)}>
            <CircleHelp size={16} />
            Reading guide
          </button>
          <div className="pm-profile">
            <span>OF</span>
            <div>
              Analyst workspace<small>Sample portfolio</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="pm-shell">
        <header className="pm-header">
          <div className="pm-breadcrumb">
            Portfolio <span>/</span> <strong>Whole fund</strong>
            <span className="pm-header-badge">DESIGN MOCK</span>
          </div>
          <div className="pm-header-actions">
            <button
              className="pm-icon-button"
              aria-label={
                dark ? "Switch to light theme" : "Switch to dark theme"
              }
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Button onClick={() => setHelp(true)}>
              <CircleHelp size={15} />
              Guide
            </Button>
            <Button primary onClick={() => go("Scenarios")}>
              <FlaskConical size={15} />
              New scenario
            </Button>
          </div>
        </header>
        <div className="pm-page-nav">
          <nav aria-label="Portfolio sections">
            {VIEWS.map((v) => (
              <button
                key={v.name}
                className={view === v.name ? "pm-current" : ""}
                aria-current={view === v.name ? "page" : undefined}
                onClick={() => go(v.name)}
              >
                {v.name}
              </button>
            ))}
          </nav>
          <button
            className="pm-text-button"
            onClick={() => {
              // Already on Holdings: focus now. Otherwise the effect focuses the search once Holdings renders.
              const input = document.querySelector<HTMLInputElement>(
                'input[aria-label="Search holdings"]',
              );
              if (input) input.focus();
              else searchFocusPending.current = true;
              go("Holdings");
            }}
          >
            <Search size={15} />
            <span>Find a holding</span>
          </button>
        </div>
        <div className="pm-context-bar">
          <span>
            <span className="pm-status-dot" />
            Sample snapshot · Sep 29, 2026 close
          </span>
          {performanceContext ? (
            <div className="pm-periods">
              {(Object.keys(PERIODS) as Period[]).map((p) => (
                <button
                  key={p}
                  aria-pressed={period === p}
                  className={period === p ? "pm-active" : ""}
                  onClick={() => setPeriod(p)}
                >
                  {PERIODS[p].label}
                </button>
              ))}
            </div>
          ) : (
            <span className="pm-context">
              {view === "Risk"
                ? "Historical risk estimates · today’s weights"
                : view === "Scenarios"
                  ? "Hypothetical allocations · no orders placed"
                  : "Weights measured against whole-fund NAV"}
            </span>
          )}
        </div>
        <main className="pm-content" id="pm-content">
          {view === "Overview" ? (
            <Overview period={period} navigate={go} open={setHolding} />
          ) : view === "Holdings" ? (
            <Holdings query={query} setQuery={setQuery} open={setHolding} />
          ) : view === "Performance" ? (
            <Performance period={period} open={setHolding} />
          ) : view === "Risk" ? (
            <Risk open={setHolding} />
          ) : view === "Exposure" ? (
            <Exposure open={setHolding} navigate={go} />
          ) : view === "Scenarios" ? null : (
            <Activity />
          )}
          <div hidden={view !== "Scenarios"}>
            <Scenarios
              key={`${scenarioTicker}:${scenarioRun}`}
              initialTicker={scenarioTicker}
            />
          </div>
        </main>
        <footer className="pm-footer">
          <span>
            <FlaskConical size={13} />
            Synthetic design mock · calculations and sources stay inspectable
          </span>
          <button className="pm-text-button" onClick={() => setHelp(true)}>
            How to read this <ArrowRight size={13} />
          </button>
        </footer>
      </div>
      <HoldingDialog
        holding={holding}
        close={() => setHolding(null)}
        navigate={go}
        explore={(ticker) => {
          setScenarioTicker(ticker);
          setScenarioRun((n) => n + 1);
          go("Scenarios");
        }}
      />
      <HelpDialog open={help} close={() => setHelp(false)} />
    </div>
  );
}
