import { describe, expect, it } from "vitest";
import { computeAttribution, computeTeamAttribution, type AttributionResult, type AttributionSeries } from "./attribution";
import { buildBenchmarkDays } from "./benchmark";
import { brinsonDay } from "./brinson";
import { buildPortfolioDays } from "./ledger";
import { carinoK } from "./linking";
import { buildSectorLineage } from "./lineage";
import type { CashFlow, DateSeries, SecurityMeta, Trade } from "./types";

const series = (rows: Record<string, Record<string, number>>): DateSeries =>
  new Map(Object.entries(rows).map(([t, r]) => [t, new Map(Object.entries(r))]));

const D = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];
const buy = (date: string, ticker: string, shares: number, price: number, fees = 0): Trade => ({ date, ticker, side: "buy", shares, price, fees });
const sell = (date: string, ticker: string, shares: number, price: number): Trade => ({ date, ticker, side: "sell", shares, price, fees: 0 });
const deposit = (date: string, amount: number): CashFlow => ({ date, kind: "deposit", amount });

// Same fixture as attribution.test.ts, with a missing close for BBB on D[2] to exercise provenance.
const prices = series({
  AAA: { [D[0]]: 100, [D[1]]: 104, [D[2]]: 101, [D[3]]: 107 },
  BBB: { [D[0]]: 50, [D[1]]: 49, [D[3]]: 51 },
  CCC: { [D[0]]: 20, [D[1]]: 20.5, [D[2]]: 20.1, [D[3]]: 21 },
  XLK: { [D[0]]: 200, [D[1]]: 204, [D[2]]: 203, [D[3]]: 210 },
  XLF: { [D[0]]: 40, [D[1]]: 40.2, [D[2]]: 41, [D[3]]: 40.5 },
  XLE: { [D[0]]: 90, [D[1]]: 88, [D[3]]: 91 },
});
const dividends = series({ AAA: { [D[3]]: 0.4 } });
const meta = new Map<string, SecurityMeta>([
  ["AAA", { ticker: "AAA", name: "A", sector: "information_technology", teamId: "tech" }],
  ["BBB", { ticker: "BBB", name: "B", sector: "financials", teamId: "fig" }],
  ["CCC", { ticker: "CCC", name: "C", sector: null, teamId: "fig" }],
]);
const weightSets = [{ asOf: D[0], weights: { information_technology: 40, financials: 35, energy: 25 } }];
const trades = [buy(D[0], "AAA", 40, 100), buy(D[0], "BBB", 60, 50), buy(D[0], "CCC", 50, 20), sell(D[2], "BBB", 20, 51.5), buy(D[2], "AAA", 5, 102)];
const cashFlows: CashFlow[] = [deposit(D[0], 10000), { date: D[2], kind: "fee", amount: 3 }];

function build(): { series: AttributionSeries; portfolio: ReturnType<typeof buildPortfolioDays>; benchmark: ReturnType<typeof buildBenchmarkDays> } {
  const portfolio = buildPortfolioDays({ trades, cashFlows, prices, dividends, days: D });
  const benchmark = buildBenchmarkDays(weightSets, prices, new Map(), D);
  return { series: { portfolio: portfolio.days, benchmark: benchmark.days, meta }, portfolio, benchmark };
}

const range = { start: D[0], end: D[3] };

function checkBreakdownAgainstResult(r: AttributionResult) {
  const b = r.breakdown!;
  expect(b).toBeDefined();
  for (const row of r.sectors) {
    const sec = b.sectors.find((s) => s.key === row.key)!;
    expect(sec, row.key).toBeDefined();
    const sum = sec.days.reduce(
      (s, d) => ({
        allocation: s.allocation + (d.bench?.scaled.allocation ?? 0),
        selection: s.selection + (d.bench?.scaled.selection ?? 0),
        interaction: s.interaction + (d.bench?.scaled.interaction ?? 0),
        contribution: s.contribution + d.contributionScaled,
      }),
      { allocation: 0, selection: 0, interaction: 0, contribution: 0 },
    );
    expect(sum.allocation).toBeCloseTo(row.allocation, 12);
    expect(sum.selection).toBeCloseTo(row.selection, 12);
    expect(sum.interaction).toBeCloseTo(row.interaction, 12);
    expect(sum.contribution).toBeCloseTo(row.contribution, 12);
    expect(sec.sums).toMatchObject({ allocation: expect.closeTo(row.allocation, 12), contribution: expect.closeTo(row.contribution, 12) });
    // Average weights come from the same daily weights.
    expect(sec.days.reduce((s, d) => s + d.wp, 0) / r.days).toBeCloseTo(row.avgPortfolioWeight, 12);
    expect(sec.days.reduce((s, d) => s + (d.bench?.wb ?? 0), 0) / r.days).toBeCloseTo(row.avgBenchmarkWeight, 12);
  }
  if (r.effects) {
    const all = b.sectors.flatMap((s) => s.days).reduce((s, d) => s + (d.bench ? d.bench.scaled.allocation + d.bench.scaled.selection + d.bench.scaled.interaction : 0), 0);
    expect(all).toBeCloseTo(r.activeReturn!, 12);
  }
}

describe("attribution breakdown", () => {
  it("is absent unless requested and does not change the result", () => {
    const s = build().series;
    const plain = computeAttribution(s, range);
    const withB = computeAttribution(s, range, { breakdown: true });
    expect(plain.breakdown).toBeUndefined();
    const { breakdown, ...rest } = withB;
    expect(breakdown).toBeDefined();
    expect(rest).toEqual(plain);
  });

  it("daily scaled effects and contributions recombine into every sector row and the active return", () => {
    checkBreakdownAgainstResult(computeAttribution(build().series, range, { breakdown: true }));
  });

  it("each day's raw effects are exactly the Brinson formula on the row's own inputs, scaled by its coef", () => {
    const r = computeAttribution(build().series, range, { breakdown: true });
    for (const sec of r.breakdown!.sectors) {
      for (const d of sec.days) {
        const b = d.bench!;
        const recomputed = brinsonDay({ [sec.key]: { weight: d.wp, ret: d.rp } }, { [sec.key]: { weight: b.wb, ret: b.rb } }, b.Rb)[sec.key]!;
        expect(b.raw.allocation).toBeCloseTo(recomputed.allocation, 12);
        expect(b.raw.selection).toBeCloseTo(recomputed.selection, 12);
        expect(b.raw.interaction).toBeCloseTo(recomputed.interaction, 12);
        expect(b.scaled.allocation).toBeCloseTo(b.raw.allocation * b.coef, 12);
        expect(b.scaled.selection).toBeCloseTo(b.raw.selection * b.coef, 12);
        expect(b.scaled.interaction).toBeCloseTo(b.raw.interaction * b.coef, 12);
        // Written out: allocation = (wp - wb)(rb - Rb), selection = wb (rp - rb), interaction = (wp - wb)(rp - rb).
        expect(b.raw.allocation).toBeCloseTo((d.wp - b.wb) * (b.rb - b.Rb), 12);
        expect(b.raw.selection).toBeCloseTo(b.wb * (d.rp - b.rb), 12);
        expect(b.raw.interaction).toBeCloseTo((d.wp - b.wb) * (d.rp - b.rb), 12);
      }
    }
    const energy = r.breakdown!.sectors.find((s) => s.key === "energy")!;
    expect(energy.days.every((d) => d.wp === 0 && d.bench!.borrowed === "rp" && d.positions.length === 0)).toBe(true);
    const cash = r.breakdown!.sectors.find((s) => s.key === "cash")!;
    expect(cash.days.every((d) => d.bench!.wb === 0 && d.bench!.borrowed === "rb")).toBe(true);
  });

  it("exposes the Carino linking pieces: coef = k/K and linked daily active returns equal Rp - Rb", () => {
    const r = computeAttribution(build().series, range, { breakdown: true });
    const l = r.breakdown!.linking;
    expect(l.Rp).toBeCloseTo(r.portfolioReturn, 12);
    expect(l.Rb!).toBeCloseTo(r.benchmarkReturn!, 12);
    expect(l.K!).toBeCloseTo(carinoK(l.Rp, l.Rb!), 12);
    let linked = 0;
    l.days.forEach((d, i) => {
      expect(d.k!).toBeCloseTo(carinoK(d.rp, d.rb!), 12);
      expect(d.coef!).toBeCloseTo(d.k! / l.K!, 12);
      linked += d.coef! * (d.rp - d.rb!);
      const sec = r.breakdown!.sectors[0].days[i];
      expect(sec.bench!.coef).toBeCloseTo(d.coef!, 12);
      expect(sec.growth).toBeCloseTo(d.growth, 12);
    });
    expect(linked).toBeCloseTo(r.activeReturn!, 12);
  });

  it("per day, constituent weights and contributions add up to the sector's", () => {
    const r = computeAttribution(build().series, range, { breakdown: true });
    for (const sec of r.breakdown!.sectors) {
      if (sec.key === "cash") continue;
      for (const d of sec.days) {
        expect(d.positions.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(d.wp, 12);
        expect(d.positions.reduce((s, p) => s + p.contribution, 0)).toBeCloseTo(d.contributionRaw, 12);
        expect(d.contributionScaled).toBeCloseTo(d.contributionRaw * d.growth, 12);
        for (const p of d.positions) expect(typeof p.pnl).toBe("number");
      }
    }
  });

  it("carries provenance: a missing close on a trade day is valued at the trade price and the ETF stale day is recorded", () => {
    const { series: s, portfolio, benchmark } = build();
    const bbb = portfolio.days[2].positions.find((p) => p.ticker === "BBB")!;
    expect(bbb.priced).toBe("trade");
    expect(portfolio.days[3].positions.find((p) => p.ticker === "BBB")!.priced).toBe("close");
    expect(benchmark.days[2].staleEtfs).toEqual(["XLE"]);
    expect(benchmark.days.every((b) => b.weightSetAsOf === D[0])).toBe(true);
    const r = computeAttribution(s, range, { breakdown: true });
    const fin = r.breakdown!.sectors.find((x) => x.key === "financials")!;
    expect(fin.days.find((d) => d.date === D[2])!.positions[0].priced).toBe("trade");
  });

  it("works without a benchmark: rows carry weights and contributions, no effects", () => {
    const s = { ...build().series, benchmark: [] };
    const r = computeAttribution(s, range, { breakdown: true });
    expect(r.effects).toBeNull();
    checkBreakdownAgainstResult(r);
    expect(r.breakdown!.linking.Rb).toBeNull();
    expect(r.breakdown!.sectors.every((sec) => sec.days.every((d) => d.bench === null))).toBe(true);
  });

  it("team sleeve breakdown recombines the same way", () => {
    const r = computeTeamAttribution(build().series, range, "fig", ["financials", "real_estate"], { breakdown: true });
    checkBreakdownAgainstResult(r);
    const plain = computeTeamAttribution(build().series, range, "fig", ["financials", "real_estate"]);
    expect(plain.breakdown).toBeUndefined();
    expect(plain.sectors).toEqual(r.sectors);
  });
});

describe("buildSectorLineage", () => {
  it("lists closes, events, ETF coverage, weight sets and flags for a sector", () => {
    const { series: s, benchmark } = build();
    const r = computeAttribution(s, range, { breakdown: true });
    const inputs = { prices, dividends, splits: [{ ticker: "AAA", date: D[1], ratio: 2 }], weightSets, portfolio: s.portfolio, benchmark: benchmark.days };
    const fin = buildSectorLineage(inputs, "financials", range, r.breakdown!.sectors.find((x) => x.key === "financials")!);
    expect(fin.tickers).toEqual(["BBB"]);
    expect(fin.closes).toEqual([{ ticker: "BBB", from: D[1], to: D[3], rows: 2, missingDays: [D[2]] }]);
    expect(fin.benchmark).toEqual({ etf: "XLF", from: D[1], to: D[3], rows: 3, staleDays: [] });
    expect(fin.weightSets).toEqual([{ asOf: D[0], weight: 35, appliedFrom: D[1], appliedTo: D[3] }]);
    expect(fin.flags).toEqual([{ date: D[2], kind: "unpriced", ticker: "BBB" }]);
    expect(fin.events).toEqual([]);

    const tech = buildSectorLineage(inputs, "information_technology", range, r.breakdown!.sectors.find((x) => x.key === "information_technology")!);
    expect(tech.events).toEqual([
      { ticker: "AAA", date: D[1], kind: "split", ratio: 2 },
      { ticker: "AAA", date: D[3], kind: "dividend", amount: 0.4 },
    ]);
    const energy = buildSectorLineage(inputs, "energy", range, r.breakdown!.sectors.find((x) => x.key === "energy")!);
    expect(energy.tickers).toEqual([]);
    expect(energy.benchmark!.staleDays).toEqual([D[2]]);
    expect(energy.flags).toEqual([{ date: D[2], kind: "etf-stale", ticker: "XLE" }]);
    const cash = buildSectorLineage(inputs, "cash", range, r.breakdown!.sectors.find((x) => x.key === "cash")!);
    expect(cash.benchmark).toBeNull();
    expect(cash.weightSets[0].weight).toBeNull();
  });

  it("flags days before the first weight set", () => {
    const { series: s } = build();
    const late = buildBenchmarkDays([{ asOf: D[1], weights: { financials: 100 } }], prices, new Map(), D);
    const r = computeAttribution({ ...s, benchmark: late.days }, range, { breakdown: true });
    const inputs = { prices, dividends, splits: [], weightSets: [{ asOf: D[1], weights: { financials: 100 } }], portfolio: s.portfolio, benchmark: late.days };
    const fin = buildSectorLineage(inputs, "financials", range, r.breakdown!.sectors.find((x) => x.key === "financials")!);
    expect(fin.flags.filter((f) => f.kind === "before-first-weights").map((f) => f.date)).toEqual([D[1]]);
    expect(fin.weightSets).toEqual([{ asOf: D[1], weight: 100, appliedFrom: D[1], appliedTo: D[3] }]);
  });
});
