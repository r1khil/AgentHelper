import { describe, expect, it } from "vitest";
import {
  metrics,
  normalizePrices,
  replay,
  validateRange,
  validateWeights,
  type Position,
} from "./engine";
import { snapshotPositions } from "./snapshot";
const positions: Position[] = [
  { id: "a", ticker: "A", name: "A", weight: 0.5 },
  { id: "b", ticker: "B", name: "B", weight: 0.5 },
];
const dates = ["2026-01-02", "2026-01-05", "2026-01-06"];
const bars = (values: number[]) =>
  values.map((close, i) => ({ date: dates[i], close }));
const prices = {
  A: bars([100, 110, 99]),
  B: bars([100, 100, 120]),
  SPY: bars([100, 102, 100]),
};
const run = (weights = { a: 0.5, b: 0.5 }) =>
  replay(positions, weights, prices, "SPY", dates[1], dates[2]);
describe("fixed weight replay", () => {
  it("compounds daily weighted returns and includes the first requested day's return", () => {
    const r = run();
    expect(r.baseline).toBe(dates[0]);
    expect(r.days[0].original).toBeCloseTo(0.05, 12);
    expect(r.days[1].original).toBeCloseTo(0.05, 12);
    expect(r.original.totalReturn).toBeCloseTo(0.1025, 12);
    expect(r.benchmarkMetrics.totalReturn).toBeCloseTo(0, 12);
    expect(r.days[1].originalActive).toBeCloseTo(0.05 - (100 / 102 - 1), 12);
  });
  it("identical weights yield identical replays and zero deltas", () => {
    const r = run();
    expect(r.original).toEqual(r.modified);
    expect(
      r.days.every(
        (d) => d.delta === 0 && d.originalCumulative === d.modifiedCumulative,
      ),
    ).toBe(true);
    expect(r.contributions.every((c) => c.delta === 0)).toBe(true);
  });
  it("reconciles every daily and wealth-linked period contribution and delta", () => {
    const r = run({ a: 0.8, b: 0.2 });
    expect(r.modified.totalReturn).toBeCloseTo(1.08 * 0.96 - 1, 12);
    for (const d of r.days) {
      expect(d.contributions.reduce((s, c) => s + c.original, 0)).toBeCloseTo(
        d.original,
        12,
      );
      expect(d.contributions.reduce((s, c) => s + c.modified, 0)).toBeCloseTo(
        d.modified,
        12,
      );
      expect(d.contributions.reduce((s, c) => s + c.delta, 0)).toBeCloseTo(
        d.delta,
        12,
      );
    }
    expect(r.contributions.reduce((s, c) => s + c.original, 0)).toBeCloseTo(
      r.original.totalReturn,
      12,
    );
    expect(r.contributions.reduce((s, c) => s + c.modified, 0)).toBeCloseTo(
      r.modified.totalReturn,
      12,
    );
    expect(r.contributions.reduce((s, c) => s + c.delta, 0)).toBeCloseTo(
      r.modified.totalReturn - r.original.totalReturn,
      12,
    );
  });
  it("does not mutate saved positions or submitted weights", () => {
    const snapshot = structuredClone(positions),
      weights = { a: 1, b: 0 };
    const r = run(weights);
    expect(positions).toEqual(snapshot);
    expect(weights).toEqual({ a: 1, b: 0 });
    expect(r.modified.totalReturn).toBeCloseTo(-0.01, 12);
  });
  it("blocks missing data instead of turning multi-day changes into daily returns", () => {
    expect(() =>
      replay(
        positions,
        { a: 1, b: 0 },
        { ...prices, A: prices.A.filter((p) => p.date !== dates[1]) },
        "SPY",
        dates[1],
        dates[2],
      ),
    ).toThrow(/A: missing adjusted close/);
    const earlyCash = replay(positions, { a: 1, b: 0 }, { ...prices, B: [] }, "SPY", dates[1], dates[2]);
    expect(earlyCash.days.every((d) => d.contributions[1].return === 0)).toBe(true);
    expect(earlyCash.cashSubstitutions).toEqual([{ ticker: "B", through: dates[2] }]);
  });
  it("keeps unavailable prelisting weight in cash, then starts returns after the first close", () => {
    const cashPositions: Position[] = [
      { id: "a", ticker: "A", name: "A", weight: 0.5 },
      { id: "b", ticker: "B", name: "B", weight: 0.4 },
      { id: "cash", ticker: "CASH", name: "Cash", weight: 0.1, kind: "cash" },
    ];
    const extended = ["2026-01-07", "2026-01-08"];
    const r = replay(cashPositions, { a: 0.6, b: 0.4, cash: 0 }, {
      A: [...prices.A, { date: extended[0], close: 99 }, { date: extended[1], close: 99 }],
      B: [{ date: dates[2], close: 100 }, { date: extended[0], close: 110 }, { date: extended[1], close: 121 }],
      SPY: [...prices.SPY, { date: extended[0], close: 100 }, { date: extended[1], close: 100 }],
    }, "SPY", dates[1], extended[1]);
    expect(r.days[0].contributions[1].return).toBe(0);
    expect(r.days[1].contributions[1].return).toBe(0);
    expect(r.days[2].contributions[1].return).toBeCloseTo(0.1);
    expect(r.days[2].original).toBeCloseTo(0.04);
    expect(r.days[2].modified).toBeCloseTo(0.04);
    expect(r.cashSubstitutions).toEqual([{ ticker: "B", through: dates[2] }]);
    expect(r.days.every((d) => d.contributions[2].return === 0)).toBe(true);
    expect(() => replay(cashPositions, { a: 0.6, b: 0.4, cash: 0 }, {
      ...prices,
      B: [{ date: dates[0], close: 100 }, { date: dates[2], close: 110 }],
    }, "SPY", dates[1], dates[2])).toThrow(/B: missing adjusted close/);
  });
  it("blocks a missing benchmark session that is observed in holding history", () => {
    expect(() =>
      replay(
        positions,
        { a: 0.5, b: 0.5 },
        { ...prices, SPY: prices.SPY.filter((p) => p.date !== dates[1]) },
        "SPY",
        dates[1],
        dates[2],
      ),
    ).toThrow(/missing benchmark close/);
  });
  it("does not request history for holdings with zero weight in both portfolios", () => {
    const r = replay(
      [
        { ...positions[0], weight: 1 },
        { ...positions[1], weight: 0 },
      ],
      { a: 1, b: 0 },
      { ...prices, B: [] },
      "SPY",
      dates[1],
      dates[2],
    );
    expect(r.days.every((d) => d.contributions[1].original === 0)).toBe(true);
  });
  it("uses the prior observed close for a weekend start; needs a prior close and completed session", () => {
    expect(
      replay(
        positions,
        { a: 0.5, b: 0.5 },
        prices,
        "SPY",
        "2026-01-03",
        dates[2],
      ).baseline,
    ).toBe(dates[0]);
    expect(() =>
      replay(positions, { a: 0.5, b: 0.5 }, prices, "SPY", dates[0], dates[2]),
    ).toThrow(/prior closing price/);
    expect(() =>
      replay(
        positions,
        { a: 0.5, b: 0.5 },
        prices,
        "SPY",
        "2026-01-03",
        "2026-01-04",
      ),
    ).toThrow(/completed benchmark sessions/);
  });
  it("accepts duplicate tickers as separate holding rows without double-fetch assumptions", () => {
    const r = replay(
      [{ ...positions[0] }, { ...positions[1], ticker: "A" }],
      { a: 0.4, b: 0.6 },
      prices,
      "SPY",
      dates[1],
      dates[2],
    );
    expect(r.modified.totalReturn).toBeCloseTo(-0.01, 12);
  });
});
describe("summary statistics", () => {
  it("uses sample volatility, initial NAV for drawdown, geometric captures and flat-day separation", () => {
    const r = metrics([-0.1, 0.1, 0], [-0.2, 0.05, 0]);
    expect(r.volatility).toBeCloseTo(0.1 * Math.sqrt(252), 12);
    expect(r.maxDrawdown).toBeCloseTo(-0.1, 12);
    expect(r.upCapture).toBeCloseTo(2, 12);
    expect(r.downCapture).toBeCloseTo(0.5, 12);
    expect([r.outDays, r.underDays, r.equalDays]).toEqual([2, 0, 1]);
  });
  it("returns unavailable capture for absent subsets and unavailable volatility for one day", () => {
    expect(metrics([0.1], [0])).toMatchObject({
      volatility: null,
      upCapture: null,
      downCapture: null,
    });
    expect(metrics([0.1, 0.2], [0.1, 0.2])).toMatchObject({
      upCapture: 1,
      downCapture: null,
      maxDrawdown: 0,
      equalDays: 2,
    });
  });
  it("tracks recovery and a later deeper drawdown", () => {
    expect(
      metrics([0.2, -0.1, 0.2, -0.3], [0.1, -0.1, 0.1, -0.1]).maxDrawdown,
    ).toBeCloseTo(-0.3, 12);
  });
});
describe("input normalization", () => {
  it("sorts and deduplicates without filling days or mutating input", () => {
    const input = [prices.A[2], prices.A[0], prices.A[0]];
    expect(normalizePrices(input)).toEqual([prices.A[0], prices.A[2]]);
    expect(input).toHaveLength(3);
    expect(() =>
      normalizePrices([...input, { date: dates[0], close: 20 }]),
    ).toThrow(/Conflicting/);
    for (const close of [0, -1, NaN, Infinity])
      expect(() => normalizePrices([{ date: dates[0], close }])).toThrow(
        /invalid/,
      );
  });
  it("rejects invalid dates, reversed and oversized windows", () => {
    for (const [a, b] of [
      ["2026-02-30", dates[2]],
      [dates[2], dates[0]],
      ["2010-01-01", "2026-01-01"],
    ])
      expect(() => validateRange(a, b)).toThrow();
  });
  it("rejects nonfinite, leveraged, short, partial and foreign weight maps", () => {
    for (const weights of [
      { a: 0.5, b: 0.4 },
      { a: -0.1, b: 1.1 },
      { a: NaN, b: 0.5 },
      { a: Infinity, b: 0.5 },
      { a: 0.5, b: 0.5, c: 0 },
    ] as Record<string, number>[])
      expect(() => validateWeights(positions, weights)).toThrow();
    expect(() => validateWeights(positions, { a: 1 })).toThrow();
  });
  it("keeps saved percentages unnormalized and adds the remaining cash weight", () => {
    const row = { id: "a", ticker: "A", companyName: "A", weightPct: "20" };
    expect(
      snapshotPositions([row, { ...row, id: "b", weightPct: "30" }]),
    ).toMatchObject({
      savedWeightTotal: 50,
      positions: [{ weight: 0.2 }, { weight: 0.3 }, { ticker: "CASH", weight: 0.5 }],
    });
    expect(() => snapshotPositions([{ ...row, weightPct: null }])).toThrow(
      /missing/,
    );
    expect(snapshotPositions([{ ...row, weightPct: "0" }]).positions.at(-1)?.weight).toBe(1);
    expect(() => snapshotPositions([row, { ...row, id: "b", weightPct: "81" }])).toThrow(/exceed 100/);
    expect(() => snapshotPositions([])).toThrow(/No active/);
  });
});
