import { describe, expect, it } from "vitest";
import { computeAttribution, computeTeamAttribution, type AttributionSeries } from "./attribution";
import { buildBenchmarkDays, normaliseWeights } from "./benchmark";
import { brinsonDay } from "./brinson";
import { adjustForSplits, buildPortfolioDays, latestPositions, validateLedger } from "./ledger";
import { carinoCoefficients, compound, priorGrowth } from "./linking";
import { resolvePeriod } from "./periods";
import { DEFAULT_ETF_SECTOR, DEFAULT_TEAM_SECTORS, ETF_BY_SECTOR, GICS_SECTORS, YAHOO_TO_GICS, defaultSector } from "./sectors";
import type { CashFlow, DateSeries, SecurityMeta, Trade } from "./types";

const series = (rows: Record<string, Record<string, number>>): DateSeries =>
  new Map(Object.entries(rows).map(([t, r]) => [t, new Map(Object.entries(r))]));

const D = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];
const buy = (date: string, ticker: string, shares: number, price: number, fees = 0): Trade => ({ date, ticker, side: "buy", shares, price, fees });
const sell = (date: string, ticker: string, shares: number, price: number): Trade => ({ date, ticker, side: "sell", shares, price, fees: 0 });
const deposit = (date: string, amount: number): CashFlow => ({ date, kind: "deposit", amount });

describe("brinsonDay", () => {
  it("matches the hand-computed two-sector example", () => {
    const e = brinsonDay(
      { information_technology: { weight: 0.6, ret: 0.1 }, financials: { weight: 0.4, ret: 0.02 } },
      { information_technology: { weight: 0.5, ret: 0.08 }, financials: { weight: 0.5, ret: 0.04 } },
      0.06,
    );
    expect(e.information_technology!.allocation).toBeCloseTo(0.002, 12);
    expect(e.financials!.allocation).toBeCloseTo(0.002, 12);
    expect(e.information_technology!.selection).toBeCloseTo(0.01, 12);
    expect(e.financials!.selection).toBeCloseTo(-0.01, 12);
    expect(e.information_technology!.interaction).toBeCloseTo(0.002, 12);
    expect(e.financials!.interaction).toBeCloseTo(0.002, 12);
    const total = Object.values(e).reduce((s, x) => s + x.allocation + x.selection + x.interaction, 0);
    expect(total).toBeCloseTo(0.068 - 0.06, 12);
  });

  it("puts a bucket missing from the benchmark (cash) wholly in allocation", () => {
    const e = brinsonDay(
      { energy: { weight: 0.9, ret: 0.02 }, cash: { weight: 0.1, ret: 0 } },
      { energy: { weight: 1, ret: 0.02 } },
      0.02,
    );
    expect(e.cash).toMatchObject({ selection: 0, interaction: 0 });
    expect(e.cash!.allocation).toBeCloseTo(0.1 * (0 - 0.02), 12);
    const total = Object.values(e).reduce((s, x) => s + x.allocation + x.selection + x.interaction, 0);
    expect(total).toBeCloseTo(0.018 - 0.02, 12);
  });

  it("handles a benchmark sector the portfolio does not hold", () => {
    const e = brinsonDay(
      { energy: { weight: 1, ret: 0.01 } },
      { energy: { weight: 0.5, ret: 0.03 }, utilities: { weight: 0.5, ret: -0.01 } },
      0.01,
    );
    expect(e.utilities).toMatchObject({ selection: 0 });
    expect(e.utilities!.interaction).toBeCloseTo(0, 12);
    expect(e.utilities!.allocation).toBeCloseTo(-0.5 * (-0.01 - 0.01), 12);
    const total = Object.values(e).reduce((s, x) => s + x.allocation + x.selection + x.interaction, 0);
    expect(total).toBeCloseTo(0.01 - 0.01, 12);
  });
});

describe("linking", () => {
  it("Carino-linked daily active returns equal the compounded active return", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.06;
    const days = Array.from({ length: 250 }, () => ({ rp: rnd(), rb: rnd() }));
    const coef = carinoCoefficients(days);
    const linked = days.reduce((s, d, i) => s + coef[i] * (d.rp - d.rb), 0);
    expect(linked).toBeCloseTo(compound(days.map((d) => d.rp)) - compound(days.map((d) => d.rb)), 12);
  });

  it("handles equal portfolio and benchmark returns", () => {
    expect(carinoCoefficients([{ rp: 0.01, rb: 0.01 }])).toEqual([1]);
  });

  it("growth-scaled contributions sum to the compounded return", () => {
    const r = [0.01, -0.02, 0.03];
    const g = priorGrowth(r);
    expect(r.reduce((s, x, i) => s + x * g[i], 0)).toBeCloseTo(compound(r), 12);
  });
});

describe("buildPortfolioDays", () => {
  const prices = series({
    AAA: { "2026-01-05": 100, "2026-01-06": 110, "2026-01-07": 99, "2026-01-08": 99 },
    BBB: { "2026-01-05": 50, "2026-01-06": 50, "2026-01-07": 55, "2026-01-08": 44 },
  });

  it("opening day has zero return and contributions add to the NAV return after", () => {
    const { days } = buildPortfolioDays({
      trades: [buy(D[0], "AAA", 50, 100), buy(D[0], "BBB", 60, 50)],
      cashFlows: [deposit(D[0], 10000)],
      prices, dividends: new Map(), days: D,
    });
    expect(days[0].ret).toBe(0);
    expect(days[0].navEnd).toBe(10000);
    expect(days[0].cashWeight).toBeCloseTo(0.2, 12);
    for (const d of days) {
      const sum = d.positions.reduce((s, p) => s + p.contribution, 0) + d.cashContribution;
      expect(sum).toBeCloseTo(d.ret, 12);
      expect(d.positions.reduce((s, p) => s + p.weight, 0) + d.cashWeight).toBeCloseTo(1, 12);
    }
    expect(days[1].ret).toBeCloseTo(500 / 10000, 12);
    expect(days[1].positions[0]).toMatchObject({ ticker: "AAA", weight: 0.5 });
    expect(days[1].positions[0].ret).toBeCloseTo(0.1, 12);
  });

  it("a mid-period buy away from the close keeps the NAV identity", () => {
    const { days } = buildPortfolioDays({
      trades: [buy(D[0], "AAA", 50, 100), buy(D[2], "BBB", 40, 52, 5)],
      cashFlows: [deposit(D[0], 10000)],
      prices, dividends: new Map(), days: D,
    });
    const d = days[2];
    const bbb = d.positions.find((p) => p.ticker === "BBB")!;
    expect(bbb.pnl).toBeCloseTo(40 * (55 - 52) - 5, 10);
    expect(bbb.weight).toBeCloseTo((40 * 52) / d.navStart, 12);
    expect(d.positions.reduce((s, p) => s + p.contribution, 0) + d.cashContribution).toBeCloseTo(d.ret, 12);
    expect(d.navEnd).toBeCloseTo(d.cashEnd + 50 * 99 + 40 * 55, 8);
  });

  it("a full sell removes the position the next day and books execution P&L", () => {
    const { days } = buildPortfolioDays({
      trades: [buy(D[0], "AAA", 50, 100), sell(D[1], "AAA", 50, 112)],
      cashFlows: [deposit(D[0], 10000)],
      prices, dividends: new Map(), days: D,
    });
    expect(days[1].positions[0].pnl).toBeCloseTo(50 * 12, 10);
    expect(days[2].positions).toHaveLength(0);
    expect(days[2].ret).toBe(0);
    expect(days[2].cashWeight).toBeCloseTo(1, 12);
  });

  it("a deposit does not count as return", () => {
    const { days } = buildPortfolioDays({
      trades: [buy(D[0], "AAA", 50, 100)],
      cashFlows: [deposit(D[0], 10000), deposit(D[1], 5000)],
      prices, dividends: new Map(), days: D,
    });
    expect(days[1].extFlow).toBe(5000);
    expect(days[1].ret).toBeCloseTo(500 / 15000, 12);
    expect(days[1].navEnd).toBeCloseTo(15500, 8);
  });

  it("reinvests dividends on the ex-date: total return, more shares, no cash", () => {
    const { days } = buildPortfolioDays({
      trades: [buy(D[0], "AAA", 50, 100)],
      cashFlows: [deposit(D[0], 5000)],
      prices, dividends: series({ AAA: { [D[1]]: 1.1 } }), days: D,
    });
    const p = days[1].positions[0];
    expect(p.ret).toBeCloseTo((110 + 1.1) / 100 - 1, 12);
    expect(p.sharesEnd).toBeCloseTo(50 + (50 * 1.1) / 110, 12);
    expect(days[1].cashEnd).toBe(0);
  });

  it("does not pay the dividend on shares bought on the ex-date", () => {
    const { days } = buildPortfolioDays({
      trades: [buy(D[1], "AAA", 10, 110)],
      cashFlows: [deposit(D[0], 5000)],
      prices, dividends: series({ AAA: { [D[1]]: 1.1 } }), days: D,
    });
    expect(days[1].positions[0].sharesEnd).toBe(10);
  });

  it("carries the last close forward and flags it", () => {
    const gappy = series({ AAA: { [D[0]]: 100, [D[2]]: 104 } });
    const { days, quality } = buildPortfolioDays({
      trades: [buy(D[0], "AAA", 10, 100)], cashFlows: [deposit(D[0], 1000)], prices: gappy, dividends: new Map(), days: D.slice(0, 3),
    });
    expect(days[1].ret).toBe(0);
    expect(days[2].ret).toBeCloseTo(0.04, 12);
    expect(quality.stale).toEqual([{ ticker: "AAA", date: D[1] }]);
  });

  it("flags an oversell", () => {
    const { quality } = buildPortfolioDays({
      trades: [buy(D[0], "AAA", 10, 100), sell(D[1], "AAA", 11, 110)], cashFlows: [deposit(D[0], 1000)], prices, dividends: new Map(), days: D,
    });
    expect(quality.oversold).toHaveLength(1);
    expect(quality.oversold[0]).toMatchObject({ ticker: "AAA", date: D[1] });
  });

  it("reports latest positions with weights of NAV", () => {
    const { days } = buildPortfolioDays({
      trades: [buy(D[0], "AAA", 50, 100)], cashFlows: [deposit(D[0], 10000)], prices, dividends: new Map(), days: D.slice(0, 1),
    });
    expect(latestPositions(days)).toEqual([{ ticker: "AAA", shares: 50, value: 5000, weight: 0.5 }]);
  });
});

describe("splits and validation", () => {
  it("restates earlier trades on the post-split basis", () => {
    const adj = adjustForSplits([buy(D[0], "AAA", 10, 200), buy(D[2], "AAA", 5, 101)], [{ ticker: "AAA", date: D[2], ratio: 2 }]);
    expect(adj[0]).toMatchObject({ shares: 20, price: 100 });
    expect(adj[1]).toMatchObject({ shares: 5, price: 101 });
  });

  it("a 2:1 split leaves value and return unchanged", () => {
    // Yahoo restates history, so closes are already on the post-split basis.
    const prices = series({ AAA: { [D[0]]: 100, [D[1]]: 101, [D[2]]: 102 } });
    const trades = adjustForSplits([buy(D[0], "AAA", 10, 200)], [{ ticker: "AAA", date: D[1], ratio: 2 }]);
    const { days } = buildPortfolioDays({ trades, cashFlows: [deposit(D[0], 2000)], prices, dividends: new Map(), days: D.slice(0, 3) });
    expect(days[0].navEnd).toBe(2000);
    expect(days[1].ret).toBeCloseTo(0.01, 12);
  });

  it("rejects future and non-trading dates", () => {
    const issues = validateLedger([buy("2026-01-10", "AAA", 1, 1), buy("2026-02-02", "AAA", 1, 1)], [deposit("2026-03-01", 1)], {
      today: "2026-01-15",
      isTradingDay: (d) => d !== "2026-01-10",
    });
    expect(issues.map((i) => i.level)).toEqual(["error", "error", "error"]);
  });
});

describe("buildBenchmarkDays", () => {
  const etf = series({
    XLK: { "2026-01-02": 100, [D[0]]: 110, [D[1]]: 110, [D[2]]: 121 },
    XLF: { "2026-01-02": 50, [D[0]]: 50, [D[1]]: 51, [D[2]]: 51 },
  });

  it("normalises weights and drifts them with sector returns", () => {
    const { days } = buildBenchmarkDays([{ asOf: "2026-01-02", weights: { information_technology: 30, financials: 30 } }], etf, new Map(), D.slice(0, 2));
    expect(days[0].weights.information_technology).toBeCloseTo(0.5, 12);
    expect(days[0].ret).toBeCloseTo(0.05, 12);
    expect(days[1].weights.information_technology).toBeCloseTo(0.55 / 1.05, 12);
    expect(Object.values(days[1].weights).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 12);
  });

  it("resets on the first day after a new as-of date and includes ETF dividends", () => {
    const { days, quality } = buildBenchmarkDays(
      [
        { asOf: "2026-01-02", weights: { information_technology: 50, financials: 50 } },
        { asOf: D[1], weights: { information_technology: 20, financials: 80 } },
      ],
      etf, series({ XLF: { [D[1]]: 0.5 } }), D.slice(0, 3),
    );
    expect(days[1].returns.financials).toBeCloseTo(51.5 / 50 - 1, 12);
    expect(days[2].weights.information_technology).toBeCloseTo(0.2, 12);
    expect(quality.beforeFirstWeights).toBe(false);
  });

  it("flags days before the first weight set", () => {
    const { quality } = buildBenchmarkDays([{ asOf: D[2], weights: { information_technology: 100 } }], etf, new Map(), D.slice(0, 2));
    expect(quality.beforeFirstWeights).toBe(true);
  });

  it("normaliseWeights returns zeros for an empty set", () => {
    expect(Object.values(normaliseWeights({})).every((w) => w === 0)).toBe(true);
  });
});

describe("computeAttribution", () => {
  const prices = series({
    AAA: { [D[0]]: 100, [D[1]]: 104, [D[2]]: 101, [D[3]]: 107 },
    BBB: { [D[0]]: 50, [D[1]]: 49, [D[2]]: 52, [D[3]]: 51 },
    CCC: { [D[0]]: 20, [D[1]]: 20.5, [D[2]]: 20.1, [D[3]]: 21 },
  });
  const etf = series({
    XLK: { [D[0]]: 200, [D[1]]: 204, [D[2]]: 203, [D[3]]: 210 },
    XLF: { [D[0]]: 40, [D[1]]: 40.2, [D[2]]: 41, [D[3]]: 40.5 },
    XLE: { [D[0]]: 90, [D[1]]: 88, [D[2]]: 89, [D[3]]: 91 },
  });
  const meta = new Map<string, SecurityMeta>([
    ["AAA", { ticker: "AAA", name: "A", sector: "information_technology", teamId: "tech" }],
    ["BBB", { ticker: "BBB", name: "B", sector: "financials", teamId: "fig" }],
    ["CCC", { ticker: "CCC", name: "C", sector: null, teamId: "fig" }],
  ]);
  const build = (): AttributionSeries => {
    const { days } = buildPortfolioDays({
      trades: [buy(D[0], "AAA", 40, 100), buy(D[0], "BBB", 60, 50), buy(D[0], "CCC", 50, 20), sell(D[2], "BBB", 20, 51.5), buy(D[2], "AAA", 5, 102)],
      cashFlows: [deposit(D[0], 10000), { date: D[2], kind: "fee", amount: 3 }],
      prices, dividends: series({ AAA: { [D[3]]: 0.4 } }), days: D,
    });
    const bench = buildBenchmarkDays(
      [{ asOf: D[0], weights: { information_technology: 40, financials: 35, energy: 25 } }], etf, new Map(), D,
    );
    return { portfolio: days, benchmark: bench.days, meta };
  };

  it("effects sum to the compounded active return and contributions to the portfolio return", () => {
    const s = build();
    const r = computeAttribution(s, { start: D[0], end: D[3] });
    expect(r.days).toBe(3);
    const nav = s.portfolio;
    expect(r.portfolioReturn).toBeCloseTo(nav[3].navEnd / nav[0].navEnd - 1, 12);
    const e = r.effects!;
    expect(e.allocation + e.selection + e.interaction).toBeCloseTo(r.activeReturn!, 12);
    expect(r.sectors.reduce((x, y) => x + y.total, 0)).toBeCloseTo(r.activeReturn!, 12);
    expect(r.holdings.reduce((x, h) => x + h.contribution, 0) + r.cashContribution).toBeCloseTo(r.portfolioReturn, 12);
    expect(r.teams.reduce((x, t) => x + t.contribution, 0) + r.cashContribution).toBeCloseTo(r.portfolioReturn, 12);
    expect(r.cumulative).toHaveLength(4);
    expect(r.cumulative.at(-1)!.active).toBeCloseTo(r.activeReturn!, 12);
    expect(r.sectors.map((x) => x.key)).toEqual(["information_technology", "financials", "energy", "unclassified", "cash"]);
    expect(r.sectors.find((x) => x.key === "energy")!.portfolioReturn).toBeNull();
  });

  it("cash drags in a rising market", () => {
    const r = computeAttribution(build(), { start: D[2], end: D[3] });
    expect(r.benchmarkReturn!).toBeGreaterThan(0);
    expect(r.sectors.find((x) => x.key === "cash")!.allocation).toBeLessThan(0);
  });

  it("still reports returns and contribution without a benchmark", () => {
    const s = { ...build(), benchmark: [] };
    const r = computeAttribution(s, { start: D[0], end: D[3] });
    expect(r.benchmarkReturn).toBeNull();
    expect(r.effects).toBeNull();
    expect(r.holdings).toHaveLength(3);
  });

  it("an empty period returns zeros", () => {
    const r = computeAttribution(build(), { start: D[3], end: D[3] });
    expect(r).toMatchObject({ days: 0, portfolioReturn: 0, benchmarkReturn: null });
  });

  it("team sleeve: effects sum to the sleeve's active return vs its sectors", () => {
    const s = build();
    const r = computeTeamAttribution(s, { start: D[0], end: D[3] }, "fig", ["financials", "real_estate"]);
    expect(r.holdings.map((h) => h.ticker).sort()).toEqual(["BBB", "CCC"]);
    const e = r.effects!;
    expect(e.allocation + e.selection + e.interaction).toBeCloseTo(r.activeReturn!, 12);
    expect(r.holdings.reduce((x, h) => x + h.contribution, 0)).toBeCloseTo(r.portfolioReturn, 12);
    const fund = computeAttribution(s, { start: D[0], end: D[3] });
    expect(r.fundContribution).toBeCloseTo(fund.teams.find((t) => t.teamId === "fig")!.contribution, 12);
    // XLF only: real estate has no benchmark weight here.
    expect(r.benchmarkReturn).toBeCloseTo(40.5 / 40 - 1, 12);
  });
});

describe("resolvePeriod", () => {
  const base = { inception: "2025-06-02", latest: "2026-09-16" };
  it("measures MTD, QTD and YTD from the prior period's last trading day", () => {
    expect(resolvePeriod("mtd", base)).toMatchObject({ start: "2026-08-31", end: "2026-09-16", clamped: false });
    expect(resolvePeriod("qtd", base).start).toBe("2026-06-30");
    expect(resolvePeriod("ytd", base).start).toBe("2025-12-31");
  });
  it("1Y lands on a trading day", () => {
    expect(resolvePeriod("1y", base).start).toBe("2025-09-16");
    expect(resolvePeriod("1d", base)).toMatchObject({ start: "2026-09-15", end: "2026-09-16", clamped: false });
    // Sep 9 is a Wednesday, so the trailing week starts at that close.
    expect(resolvePeriod("7d", base)).toMatchObject({ start: "2026-09-09", end: "2026-09-16", clamped: false });
  });
  it("clamps to inception", () => {
    expect(resolvePeriod("ytd", { inception: "2026-09-10", latest: "2026-09-16" })).toMatchObject({ start: "2026-09-10", clamped: true });
    expect(resolvePeriod("itd", base)).toMatchObject({ start: "2025-06-02", clamped: false });
  });
  it("custom ranges start from the day before `from` and never pass latest", () => {
    expect(resolvePeriod("custom", { ...base, from: "2026-09-08", to: "2026-12-01" })).toMatchObject({ start: "2026-09-04", end: "2026-09-16" });
    expect(resolvePeriod("custom", { ...base, from: "2026-09-01", to: "2026-09-12" }).end).toBe("2026-09-11");
  });
});

describe("sectors", () => {
  it("every sector has an ETF and a Yahoo name", () => {
    expect(Object.keys(ETF_BY_SECTOR).sort()).toEqual([...GICS_SECTORS].sort());
    expect(new Set(Object.values(YAHOO_TO_GICS)).size).toBe(GICS_SECTORS.length);
  });
  it("assigns each sector to exactly one team by default", () => {
    const all = Object.values(DEFAULT_TEAM_SECTORS).flat();
    expect(all.sort()).toEqual([...GICS_SECTORS].sort());
  });
  it("prefers the ETF default, then Yahoo, else unclassified", () => {
    expect(defaultSector("kre")).toEqual({ sector: "financials", source: "default" });
    expect(DEFAULT_ETF_SECTOR.XLRE).toBe("real_estate");
    expect(defaultSector("MSFT", "Technology")).toEqual({ sector: "information_technology", source: "yahoo" });
    expect(defaultSector("ZZZ", "Conglomerates")).toBeNull();
  });
});
