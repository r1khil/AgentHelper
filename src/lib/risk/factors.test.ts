import { describe, expect, it } from "vitest";
import { ETF_BY_SECTOR, GICS_SECTORS } from "@/lib/attribution/sectors";
import {
  FACTOR_KEYS,
  FACTORS,
  buildFactorReport,
  describeFactorBeta,
  factorReturns,
  formatBeta,
  invert,
  isFactorReport,
  olsDesign,
  weightedBetas,
  type FactorKey,
  type FactorReport,
} from "./factors";
import { buildRiskReport, MARKET, type RiskInput } from "./model";
import { previewReport } from "./preview";

/** Sylvester Hadamard matrix of order 2^p: columns are ±1, mutually orthogonal, and all but the first sum to zero. */
function hadamard(p: number): number[][] {
  let h = [[1]];
  for (let i = 0; i < p; i++) h = [...h.map((r) => [...r, ...r]), ...h.map((r) => [...r, ...r.map((v) => -v)])];
  return h;
}

function prng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x / 2147483647 - 0.5) * 2;
  };
}

describe("olsDesign", () => {
  it("matches the textbook one-regressor example LINEST gives", () => {
    // LINEST({1,3,2,5,4}, {1,2,3,4,5}, TRUE, TRUE): slope 0.8, intercept 0.6, se 0.34641 / 1.148913, R² 0.64, df 3.
    const d = olsDesign([[1], [2], [3], [4], [5]])!;
    const r = d.fit([1, 3, 2, 5, 4]);
    expect(r.betas[0].beta).toBeCloseTo(0.8, 12);
    expect(r.alpha.beta).toBeCloseTo(0.6, 12);
    expect(r.betas[0].se).toBeCloseTo(Math.sqrt(0.12), 12);
    expect(r.alpha.se).toBeCloseTo(Math.sqrt(1.32), 12);
    expect(r.r2).toBeCloseTo(0.64, 12);
    expect(r.df).toBe(3);
    expect(r.betas[0].t).toBeCloseTo(0.8 / Math.sqrt(0.12), 10);
    expect(r.betas[0].significant).toBe(true);
  });

  it("recovers seven known betas with closed-form standard errors on an orthogonal design", () => {
    // 16 days; factor j is Hadamard column j + 1 scaled to a daily move, and the noise is column 8,
    // orthogonal to every factor and the intercept, so the residuals are exactly the noise.
    const H = hadamard(4);
    const n = 16;
    const scales = [0.01, 0.004, 0.003, 0.005, 0.008, 0.002, 0.02];
    const truth = [1.1, 0.25, -0.4, 0.15, -0.12, 0.05, 0.3];
    const alpha = 0.0002;
    const c = 0.003;
    const x = H.map((row) => scales.map((s, j) => s * row[j + 1]));
    const noise = H.map((row) => c * row[8]);
    const y = x.map((row, t) => alpha + truth.reduce((acc, b, j) => acc + b * row[j], 0) + noise[t]);

    const r = olsDesign(x)!.fit(y);
    const df = n - 8;
    const s2 = (n * c * c) / df;
    truth.forEach((b, j) => {
      expect(r.betas[j].beta).toBeCloseTo(b, 10);
      expect(r.betas[j].se).toBeCloseTo(Math.sqrt(s2 / (n * scales[j] ** 2)), 12);
    });
    expect(r.alpha.beta).toBeCloseTo(alpha, 12);
    expect(r.alpha.se).toBeCloseTo(Math.sqrt(s2 / n), 12);
    const tss = n * truth.reduce((acc, b, j) => acc + (b * scales[j]) ** 2, 0) + n * c * c;
    expect(r.r2).toBeCloseTo(1 - (n * c * c) / tss, 12);
    expect(r.df).toBe(df);
    // Rates beta −0.12 over scale 0.008 with this noise: t = −0.12 / se.
    expect(r.betas[4].t).toBeCloseTo(-0.12 / Math.sqrt(s2 / (n * 0.008 ** 2)), 8);
  });

  it("returns null when a factor is a copy of another", () => {
    const x = Array.from({ length: 30 }, (_, t) => [Math.sin(t), Math.sin(t), Math.cos(t)]);
    expect(olsDesign(x)).toBeNull();
    expect(invert([[1, 2], [2, 4]])).toBeNull();
  });
});

describe("factorReturns", () => {
  it("builds spreads as return differences and leaves NaN where a leg is missing", () => {
    const returns = new Map<string, number[]>([
      ["SPY", [0.01, 0.02]],
      ["IWM", [0.015, NaN]],
      ["IVE", [0.01, 0.0]],
      ["IVW", [0.02, -0.01]],
      ["MTUM", [0.012, 0.03]],
      ["TLT", [-0.004, 0.001]],
      ["UUP", [0.001, 0.002]],
      ["USO", [0.03, -0.02]],
    ]);
    const f = factorReturns(returns, 2);
    expect(f.market).toEqual([0.01, 0.02]);
    expect(f.size[0]).toBeCloseTo(0.005, 15);
    expect(f.size[1]).toBeNaN();
    expect(f.value[1]).toBeCloseTo(0.01, 15);
    expect(f.momentum[1]).toBeCloseTo(0.01, 15);
    expect(f.rates).toEqual([-0.004, 0.001]);
  });
});

// A synthetic year: factor ETFs built so the seven factor returns are known, holdings with known loadings.
const N = 252;
const dates = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
function synthetic() {
  const rnd = prng(99);
  const f: Record<FactorKey, number[]> = Object.fromEntries(FACTOR_KEYS.map((k, j) => [k, Array.from({ length: N }, () => rnd() * [0.01, 0.004, 0.004, 0.005, 0.008, 0.003, 0.02][j])])) as Record<FactorKey, number[]>;
  const returns = new Map<string, number[]>();
  returns.set("SPY", f.market);
  returns.set("IWM", f.market.map((m, t) => m + f.size[t]));
  returns.set("IVW", f.market.map((m) => m + 0.3 * rnd() * 0.003));
  returns.set("IVE", returns.get("IVW")!.map((g, t) => g + f.value[t]));
  returns.set("MTUM", f.market.map((m, t) => m + f.momentum[t]));
  returns.set("TLT", f.rates);
  returns.set("UUP", f.dollar);
  returns.set("USO", f.oil);
  const load = (b: Partial<Record<FactorKey, number>>, noise: number) => Array.from({ length: N }, (_, t) => FACTOR_KEYS.reduce((s, k) => s + (b[k] ?? 0) * f[k][t], 0) + noise * rnd());
  return { f, returns, load, rnd };
}

describe("buildFactorReport", () => {
  const { returns, load } = synthetic();
  const bank = load({ market: 1.2, value: 0.8, rates: -0.6, size: 0.3 }, 0.004);
  const oil = load({ market: 0.9, oil: 0.5, dollar: -0.4 }, 0.006);
  const tech = load({ market: 1.4, value: -0.7, momentum: 0.5, rates: 0.2 }, 0.005);
  const xlk = load({ market: 1.2, value: -0.5 }, 0.002);
  const xlf = load({ market: 1.1, value: 0.6, rates: -0.3 }, 0.002);
  const holdings = [
    { ticker: "BANK", weight: 0.3, column: bank, source: "own" as const, proxy: null },
    { ticker: "OILX", weight: 0.2, column: oil, source: "own" as const, proxy: null },
    { ticker: "TECH", weight: 0.4, column: tech, source: "own" as const, proxy: null },
  ];
  const benchmark = [
    { ticker: "XLK", weight: 0.55, column: xlk },
    { ticker: "XLF", weight: 0.45, column: xlf },
  ];
  const report = buildFactorReport({ dates, returns, holdings, benchmark }) as FactorReport;

  it("recovers each holding's loadings", () => {
    expect(isFactorReport(report)).toBe(true);
    const bankFit = report.holdings[0];
    expect(bankFit.betas.market.beta).toBeCloseTo(1.2, 1);
    expect(bankFit.betas.rates.beta).toBeCloseTo(-0.6, 1);
    expect(bankFit.betas.rates.significant).toBe(true);
    expect(Math.abs(bankFit.betas.oil.t)).toBeLessThan(3);
    expect(bankFit.r2).toBeGreaterThan(0.8);
    expect(report.sample.n).toBe(N);
  });

  it("gives the Fund exactly the weight-sum of holding betas, which is the regression of the weighted book", () => {
    const bottomUp = weightedBetas(report.holdings);
    for (const k of FACTOR_KEYS) expect(report.fund.betas[k].beta).toBeCloseTo(bottomUp[k], 12);
    const alphaSum = report.holdings.reduce((s, h) => s + h.weight * h.alpha.beta, 0);
    expect(report.fund.alpha.beta).toBeCloseTo(alphaSum, 14);
    // Cash (10%) earns nothing, so the weights need not sum to one.
    expect(report.fund.n).toBe(report.holdings[0].n);
  });

  it("makes the active row the Fund minus the benchmark", () => {
    for (const k of FACTOR_KEYS) expect(report.active!.betas[k].beta).toBeCloseTo(report.fund.betas[k].beta - report.benchmark!.betas[k].beta, 12);
    expect(report.benchmark!.betas.market.beta).toBeCloseTo(0.55 * 1.2 + 0.45 * 1.1, 1);
  });

  it("drops days where a factor ETF has no close, for every series alike", () => {
    const gappy = new Map(returns);
    gappy.set("UUP", returns.get("UUP")!.map((r, t) => (t % 50 === 0 ? NaN : r)));
    const r = buildFactorReport({ dates, returns: gappy, holdings, benchmark: null }) as FactorReport;
    expect(r.sample.n).toBe(N - 6);
    expect(r.sample.dropped).toBe(6);
    expect(r.holdings.every((h) => h.n === N - 6)).toBe(true);
    expect(r.benchmark).toBeNull();
    expect(r.active).toBeNull();
  });

  it("says why when the factor ETFs have no stored closes", () => {
    const bare = new Map([...returns].filter(([k]) => !["TLT", "USO"].includes(k)));
    const r = buildFactorReport({ dates, returns: bare, holdings, benchmark: null });
    expect(isFactorReport(r)).toBe(false);
    if (!isFactorReport(r)) {
      expect(r.missing).toEqual(["TLT", "USO"]);
      expect(r.reason).toMatch(/TLT, USO/);
    }
  });
});

describe("factor betas in the risk report", () => {
  it("models a holding with too little history with its sector ETF, like the rest of the Risk page", () => {
    const { returns, load } = synthetic();
    const all = new Map(returns);
    GICS_SECTORS.forEach((s) => all.set(ETF_BY_SECTOR[s], load({ market: 1, rates: s === "utilities" ? 0.5 : -0.1 }, 0.003)));
    all.set(MARKET, returns.get("SPY")!);
    all.set("NEWCO", all.get("XLU")!.map((r, t) => (t < N - 30 ? NaN : r + 0.01)));
    all.set("OLDCO", load({ market: 0.8, oil: 0.4 }, 0.005));
    const input: RiskInput = {
      scope: "fund",
      asOf: dates.at(-1)!,
      lookback: "1y",
      nav: 1_000_000,
      cash: { value: 200_000, weight: 0.2 },
      holdings: [
        { ticker: "NEWCO", name: "New", teamId: null, sector: "utilities", value: 300_000, weight: 0.3 },
        { ticker: "OLDCO", name: "Old", teamId: null, sector: "energy", value: 500_000, weight: 0.5 },
      ],
      benchmarkWeights: { utilities: 0.4, energy: 0.6 },
      window: { dates, returns: all },
      riskFree: null,
      realized: null,
    };
    const report = buildRiskReport(input);
    expect(isFactorReport(report.factors)).toBe(true);
    const f = report.factors as FactorReport;
    const newco = f.holdings.find((h) => h.ticker === "NEWCO")!;
    expect(newco.source).toBe("proxy");
    expect(newco.proxy).toBe("XLU");
    const xlu = buildFactorReport({ dates, returns: all, holdings: [{ ticker: "XLU", weight: 1, column: all.get("XLU")!, source: "own", proxy: null }], benchmark: null }) as FactorReport;
    for (const k of FACTOR_KEYS) expect(newco.betas[k].beta).toBeCloseTo(xlu.holdings[0].betas[k].beta, 12);
    // The Fund's market beta here is the same weight-sum logic as Risk's SPY beta, so they agree closely.
    expect(f.fund.betas.market.beta).toBeCloseTo(report.portfolio.beta, 1);
  });

  it("reports why factors are missing without adding a page notice", () => {
    const input: RiskInput = {
      scope: "fund",
      asOf: dates.at(-1)!,
      lookback: "1y",
      nav: 1,
      cash: { value: 0, weight: 0 },
      holdings: [],
      benchmarkWeights: null,
      window: { dates, returns: new Map([[MARKET, synthetic().f.market]]) },
      riskFree: null,
      realized: null,
    };
    const report = buildRiskReport(input);
    expect(isFactorReport(report.factors)).toBe(false);
    expect(report.notices.some((n) => /factor/i.test(n))).toBe(false);
  });
});

describe("preview data", () => {
  it("gives the /dev preview a factor section with clear and unclear betas", () => {
    const f = previewReport("1y").factors;
    expect(isFactorReport(f)).toBe(true);
    if (!isFactorReport(f)) return;
    expect(f.fund.betas.rates.beta).toBeLessThan(0);
    expect(f.fund.betas.rates.significant).toBe(true);
    expect(FACTOR_KEYS.some((k) => !f.fund.betas[k].significant)).toBe(true);
    expect(f.holdings.some((h) => h.source === "proxy")).toBe(true);
    expect(f.active).not.toBeNull();
  });
});

describe("describeFactorBeta", () => {
  it("reads a negative rates beta as short TLT and short duration", () => {
    expect(describeFactorBeta("rates", -0.12)).toBe("Moves like being 12% of NAV short TLT (net short duration)");
  });

  it("phrases each factor descriptively", () => {
    expect(describeFactorBeta("market", 1.08)).toBe("Moves like being 108% of NAV long SPY (more market-sensitive than the S&P 500)");
    expect(describeFactorBeta("market", 0.85)).toBe("Moves like being 85% of NAV long SPY (less market-sensitive than the S&P 500)");
    expect(describeFactorBeta("size", 0.2)).toBe("Moves like being 20% of NAV long IWM against SPY (a small-cap tilt)");
    expect(describeFactorBeta("size", -0.2)).toBe("Moves like being 20% of NAV long SPY against IWM (a large-cap tilt)");
    expect(describeFactorBeta("value", -0.31)).toBe("Moves like being 31% of NAV long IVW against IVE (a growth tilt)");
    expect(describeFactorBeta("momentum", 0.1)).toBe("Moves like being 10% of NAV long MTUM against SPY (a tilt toward recent winners)");
    expect(describeFactorBeta("dollar", -0.05)).toBe("Moves like being 5% of NAV short UUP (net short the dollar)");
    expect(describeFactorBeta("oil", 0.07, { basis: "the team's book" })).toBe("Moves like being 7% of the team's book long USO (net long oil)");
  });

  it("flags weak estimates and near-zero betas", () => {
    expect(describeFactorBeta("rates", -0.12, { t: -1.4 })).toBe("Moves like being 12% of NAV short TLT (net short duration); not statistically clear (|t| < 2)");
    expect(describeFactorBeta("oil", 0.003)).toBe("Essentially no oil exposure");
  });

  it("never recommends a trade", () => {
    for (const f of FACTORS) for (const b of [-0.5, 0.5]) expect(describeFactorBeta(f.key, b)).not.toMatch(/\b(buy|sell|hedge|should|consider|reduce|add)\b/i);
  });

  it("formats betas with a true minus sign", () => {
    expect(formatBeta(-0.12)).toBe("−0.12");
    expect(formatBeta(0.004)).toBe("0.00");
    expect(formatBeta(-0.001)).toBe("0.00");
  });
});
