import { ETF_BY_SECTOR, GICS_SECTORS, SECTOR_LABELS, type BucketKey, type GicsSector } from "@/lib/attribution/sectors";
import {
  TRADING_DAYS,
  Z95,
  annualizeVol,
  beta,
  concentration,
  correlationMatrix,
  covarianceMatrix,
  drawdowns,
  historicalVaR,
  mean,
  riskDecomposition,
  stdev,
  sum,
} from "./math";
import { buildFactorReport, type FactorReport, type FactorUnavailable } from "./factors";

/**
 * Holdings-based (ex-ante) risk: today's weights applied to each asset's daily total returns over a
 * trailing window, the standard way a fund reports forward-looking risk. Realized (ex-post) figures
 * come from the Fund's own daily NAV returns and are reported separately.
 */

export const LOOKBACKS = {
  "6m": { days: 126, label: "6 months" },
  "1y": { days: 252, label: "1 year" },
  "2y": { days: 504, label: "2 years" },
} as const;
export type LookbackKey = keyof typeof LOOKBACKS;
export const DEFAULT_LOOKBACK: LookbackKey = "1y";
export const parseLookback = (v: string | undefined): LookbackKey => (v && v in LOOKBACKS ? (v as LookbackKey) : DEFAULT_LOOKBACK);

/** A holding needs this many daily returns of its own in the window; with fewer, its sector ETF stands in. */
export const MIN_OBSERVATIONS = 60;
/** Realized statistics need at least this many daily NAV returns. */
export const MIN_REALIZED_DAYS = 20;
/** Market for beta and the stress test: SPY total return, the investable S&P 500. */
export const MARKET = "SPY";
/** 13-week Treasury bill yield, in percent, used as the risk-free rate. */
export const RISK_FREE = "^IRX";
export const MARKET_SHOCK = -0.1;
export const CORRELATION_LIMIT = 15;
export const VAR_LEVEL = 0.95;

export type RiskHolding = { ticker: string; name: string; teamId: string | null; sector: GicsSector | null; value: number; weight: number };

export type RealizedInput = {
  dates: string[];
  portfolio: number[];
  /** Sector benchmark (the attribution benchmark, or the team's sectors). */
  benchmark: (number | null)[];
  market: (number | null)[];
  /**
   * Market total return since the previous row's date. Same as `market` except after days a team sleeve held
   * nothing (and skipped), where it also carries the market's move over those days. Used for the drawdown line only;
   * beta and the other paired statistics keep one-day returns.
   */
  marketPath?: (number | null)[];
  /** Daily risk-free return on each date (T-bill yield / 252). */
  riskFree: (number | null)[];
};

export type RiskInput = {
  scope: "fund" | "team";
  asOf: string;
  lookback: LookbackKey;
  /** Value of the scope: Fund NAV, or the team's holdings. */
  nav: number;
  cash: { value: number; weight: number };
  holdings: RiskHolding[];
  /** Benchmark sector weights summing to 1, or null when none are saved. */
  benchmarkWeights: Partial<Record<GicsSector, number>> | null;
  /** Return dates in the window and each symbol's raw total daily returns on them (NaN where a close is missing). */
  window: { dates: string[]; returns: Map<string, number[]> };
  riskFree: { annual: number; asOf: string } | null;
  realized: RealizedInput | null;
};

export type SeriesSource = "own" | "proxy" | "excluded";

export type Coverage = {
  ticker: string;
  /** Days in the window with a return of the symbol's own. */
  observations: number;
  /** Days without one, filled from the sector ETF (holdings) or with zero (ETFs, market). */
  filled: number;
  source: SeriesSource;
  proxy: string | null;
};

export type HoldingRisk = RiskHolding & {
  source: SeriesSource;
  proxy: string | null;
  /** Annualized volatility of the holding on its own. */
  vol: number;
  beta: number;
  /** Correlation of the holding with the whole portfolio. */
  corrToPortfolio: number;
  /** Annualized covariance with the portfolio, (Σw)ᵢ × 252. */
  marginal: number;
  /** Points of annualized portfolio volatility from this holding; the column adds up to the portfolio's volatility. */
  contribution: number;
  /** Share of portfolio variance; adds up to 100%. */
  riskShare: number;
  /** Share of tracking-error variance; adds up to 100% with the benchmark ETFs' shares. */
  activeRiskShare: number | null;
  /** Points of annualized tracking error from this holding (activeRiskShare × tracking error); adds up to tracking error with the benchmark legs. */
  teContribution: number | null;
  /**
   * Marginal tracking error, annualized: ∂TE/∂wᵢ = (Σa)ᵢ ÷ TE. Tracking error added per unit of weight moved into this
   * holding from cash, so × 0.01 is the change for 1 percentage point.
   */
  marginalTe: number | null;
};

export type SectorRisk = {
  key: BucketKey;
  label: string;
  weight: number;
  benchWeight: number | null;
  active: number | null;
  riskShare: number;
  activeRiskShare: number | null;
  tickers: string[];
};

export type RealizedRisk = {
  from: string;
  to: string;
  days: number;
  enough: boolean;
  totalReturn: number | null;
  vol: number | null;
  beta: number | null;
  trackingError: number | null;
  sharpe: number | null;
  /** Mean daily risk-free return used for the Sharpe ratio. */
  riskFreeDaily: number | null;
  drawdown: { dates: string[]; portfolio: number[]; market: number[]; max: number; maxDate: string | null; current: number; marketMax: number };
};

export type RiskReport = {
  scope: "fund" | "team";
  asOf: string;
  lookback: LookbackKey;
  window: { from: string | null; to: string | null; days: number; target: number };
  nav: number;
  cash: { value: number; weight: number };
  holdings: HoldingRisk[];
  sectors: SectorRisk[];
  portfolio: {
    vol: number;
    dailySigma: number;
    dailyVariance: number;
    beta: number;
    /** SPY's own annualized volatility over the same window, for comparison. */
    marketVol: number;
    trackingError: number | null;
    dailyTe: number | null;
    var: {
      level: number;
      pct: number;
      dollars: number;
      es: number;
      esDollars: number;
      parametricPct: number;
      observations: number;
      rank: number;
      tail: { date: string; ret: number }[];
    };
    stress: { shock: number; move: number; dollars: number };
    hhi: number;
    effectiveN: number;
    top5: number;
    top10: number;
    invested: number;
  };
  /** Benchmark ETF legs of the tracking-error calculation (negative active weights). */
  benchmarkLegs: { sector: GicsSector; etf: string; weight: number; activeRiskShare: number; teContribution: number; marginalTe: number }[];
  correlation: { tickers: string[]; matrix: number[][] };
  realized: RealizedRisk | null;
  coverage: Coverage[];
  riskFree: { annual: number; asOf: string } | null;
  notices: string[];
  /** Factor and macro sensitivities over the same window and filled return columns, or why they can't be estimated. */
  factors: FactorReport | FactorUnavailable;
  /** The exact return columns and weights the statistics were computed from, for the downloadable inputs. Server-side only. */
  matrix: { dates: string[]; tickers: string[]; columns: number[][]; weights: number[]; active: number[] | null; covariance: number[][] };
};

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

function fillColumn(own: number[] | undefined, proxy: number[] | undefined, T: number, need: number, isHolding: boolean): { values: number[]; coverage: Omit<Coverage, "ticker" | "proxy"> } {
  const observations = own ? own.filter(finite).length : 0;
  if (!isHolding) {
    return { values: Array.from({ length: T }, (_, t) => (own && finite(own[t]) ? own[t] : 0)), coverage: { observations, filled: T - observations, source: "own" } };
  }
  if (observations >= need && own) {
    const values = own.map((r, t) => (finite(r) ? r : proxy && finite(proxy[t]) ? proxy[t] : 0));
    return { values, coverage: { observations, filled: T - observations, source: "own" } };
  }
  if (proxy) return { values: proxy.map((r) => (finite(r) ? r : 0)), coverage: { observations, filled: T, source: "proxy" } };
  return { values: new Array<number>(T).fill(0), coverage: { observations, filled: T, source: "excluded" } };
}

function realizedRisk(input: RealizedInput, from: string, lookbackDays: number): RealizedRisk {
  const all = input.dates.map((d, i) => ({ d, r: input.portfolio[i], b: input.benchmark[i], m: input.market[i], mp: input.marketPath?.[i] ?? input.market[i], rf: input.riskFree[i] }));
  const win = all.filter((x) => x.d >= from).slice(-lookbackDays);
  const r = win.map((x) => x.r);
  const enough = r.length >= MIN_REALIZED_DAYS;
  const withMarket = win.filter((x) => finite(x.m));
  const withBench = win.filter((x) => finite(x.b));
  const withRf = win.filter((x) => finite(x.rf));
  const excess = withRf.map((x) => x.r - x.rf!);
  const sd = stdev(excess);

  // Over the lookback window like every other realized figure, so the card and chart match the window picked.
  const dd = drawdowns(r);
  const mdd = drawdowns(win.map((x) => (finite(x.mp) ? x.mp : 0)));
  return {
    from: win[0]?.d ?? from,
    to: win.at(-1)?.d ?? from,
    days: r.length,
    enough,
    totalReturn: r.length ? r.reduce((g, x) => g * (1 + x), 1) - 1 : null,
    vol: enough ? annualizeVol(stdev(r)) : null,
    beta: enough && withMarket.length >= MIN_REALIZED_DAYS ? beta(withMarket.map((x) => x.r), withMarket.map((x) => x.m!)) : null,
    trackingError: enough && withBench.length >= MIN_REALIZED_DAYS ? annualizeVol(stdev(withBench.map((x) => x.r - x.b!))) : null,
    sharpe: enough && withRf.length >= MIN_REALIZED_DAYS && sd > 0 ? (mean(excess) * TRADING_DAYS) / (sd * Math.sqrt(TRADING_DAYS)) : null,
    riskFreeDaily: withRf.length ? mean(withRf.map((x) => x.rf!)) : null,
    drawdown: {
      dates: win.map((x) => x.d),
      portfolio: dd.series,
      market: mdd.series,
      max: dd.max,
      maxDate: dd.maxAt >= 0 ? win[dd.maxAt].d : null,
      current: dd.current,
      marketMax: mdd.max,
    },
  };
}

export function buildRiskReport(input: RiskInput): RiskReport {
  const { dates } = input.window;
  const T = dates.length;
  const target = LOOKBACKS[input.lookback].days;
  const need = Math.min(MIN_OBSERVATIONS, Math.max(2, Math.ceil(T * 0.8)));
  const notices: string[] = [];
  if (T < target) notices.push(`Only ${T} trading days of stored prices cover this window (${LOOKBACKS[input.lookback].label} is ${target}). Older closes load with the nightly price run.`);

  const etfs = GICS_SECTORS.map((s) => ETF_BY_SECTOR[s]);
  const etfReturns = new Map(etfs.map((e) => [e, input.window.returns.get(e)]));

  // Column order: holdings, then the 11 sector ETFs, then the market.
  const coverage: Coverage[] = [];
  const columns: number[][] = [];
  for (const h of input.holdings) {
    const proxy = h.sector ? ETF_BY_SECTOR[h.sector] : null;
    const { values, coverage: c } = fillColumn(input.window.returns.get(h.ticker), proxy ? etfReturns.get(proxy) : undefined, T, need, true);
    columns.push(values);
    coverage.push({ ticker: h.ticker, proxy: c.source === "proxy" ? proxy : null, ...c });
  }
  for (const sym of [...etfs, MARKET]) {
    const { values, coverage: c } = fillColumn(input.window.returns.get(sym), undefined, T, need, false);
    columns.push(values);
    coverage.push({ ticker: sym, proxy: null, ...c });
  }
  const H = input.holdings.length;
  const marketIdx = columns.length - 1;
  const etfIdx = (s: GicsSector) => H + GICS_SECTORS.indexOf(s);

  const cov = T >= 2 ? covarianceMatrix(columns) : columns.map(() => columns.map(() => 0));
  const w = [...input.holdings.map((h) => h.weight), ...etfs.map(() => 0), 0];
  const dec = riskDecomposition(w, cov);
  const marketVar = cov[marketIdx][marketIdx];
  const betas = columns.map((_, i) => (marketVar > 0 ? cov[i][marketIdx] / marketVar : NaN));
  const portfolioBeta = sum(w.map((wi, i) => wi * (finite(betas[i]) ? betas[i] : 0)));

  // Active weights: holdings long, the benchmark's sector ETFs short. Cash has no variance.
  let te: ReturnType<typeof riskDecomposition> | null = null;
  let active: number[] | null = null;
  const bench = input.benchmarkWeights;
  if (bench) {
    active = [...w];
    for (const s of GICS_SECTORS) active[etfIdx(s)] = -(bench[s] ?? 0);
    te = riskDecomposition(active, cov);
  } else {
    notices.push("No S&P 500 sector weights are saved, so tracking error and active weights cannot be calculated.");
  }

  // Marginal tracking error per unit of weight, annualized: (Σa)ᵢ ÷ TE_daily × √252.
  const sqrtYear = Math.sqrt(TRADING_DAYS);
  const marginalTe = (i: number) => (te && te.sigma > 0 ? (te.marginal[i] / te.sigma) * sqrtYear : te ? 0 : null);
  const teContribution = (i: number) => (te ? te.contribution[i] * sqrtYear : null);

  const holdings: HoldingRisk[] = input.holdings.map((h, i) => {
    const c = coverage[i];
    const sd = Math.sqrt(cov[i][i]);
    return {
      ...h,
      source: c.source,
      proxy: c.proxy,
      vol: annualizeVol(sd),
      beta: betas[i],
      corrToPortfolio: sd > 0 && dec.sigma > 0 ? dec.marginal[i] / (sd * dec.sigma) : NaN,
      marginal: dec.marginal[i] * TRADING_DAYS,
      contribution: annualizeVol(dec.contribution[i]),
      riskShare: dec.share[i],
      activeRiskShare: te ? te.share[i] : null,
      teContribution: teContribution(i),
      marginalTe: marginalTe(i),
    };
  });
  holdings.sort((a, b) => b.riskShare - a.riskShare);

  const proxied = coverage.filter((c) => c.source === "proxy");
  if (proxied.length) notices.push(`Not enough price history for ${proxied.map((c) => `${c.ticker} (${c.observations} days)`).join(", ")}; each is modeled with its sector ETF (${proxied.map((c) => c.proxy).join(", ")}).`);
  const backfilled = coverage.slice(0, H).filter((c) => c.source === "own" && c.filled > T * 0.05);
  if (backfilled.length) notices.push(`${backfilled.map((c) => `${c.ticker} has its own closes for ${c.observations} of ${T} days`).join("; ")}. The missing days use the sector ETF's return.`);
  const excluded = coverage.filter((c) => c.source === "excluded");
  if (excluded.length) notices.push(`${excluded.map((c) => c.ticker).join(", ")} ${excluded.length === 1 ? "has" : "have"} no price history and no sector, so ${excluded.length === 1 ? "it is" : "they are"} treated as riskless. Set a sector on the ledger to model ${excluded.length === 1 ? "it" : "them"}.`);

  const gappy = coverage.slice(H).filter((c) => c.filled > 0);
  if (gappy.length) notices.push(`Stored closes are missing on some days for ${gappy.map((c) => `${c.ticker} (${c.filled} of ${T} days)`).join(", ")}; those days count as a 0% return, which slightly understates volatility and tracking error.`);

  // Sectors: the Fund's weight, the benchmark's, and each one's share of total and active risk.
  const buckets = new Map<BucketKey, SectorRisk>();
  const bucket = (key: BucketKey) => {
    let b = buckets.get(key);
    if (!b) {
      const benchWeight = key === "cash" || key === "unclassified" ? (bench ? 0 : null) : bench ? (bench[key] ?? 0) : null;
      b = { key, label: key === "cash" ? "Cash" : key === "unclassified" ? "Unclassified" : SECTOR_LABELS[key], weight: 0, benchWeight, active: null, riskShare: 0, activeRiskShare: te ? 0 : null, tickers: [] };
      buckets.set(key, b);
    }
    return b;
  };
  for (const h of holdings) {
    const b = bucket(h.sector ?? "unclassified");
    b.weight += h.weight;
    b.riskShare += h.riskShare;
    if (b.activeRiskShare !== null && h.activeRiskShare !== null) b.activeRiskShare += h.activeRiskShare;
    b.tickers.push(h.ticker);
  }
  const benchmarkLegs: RiskReport["benchmarkLegs"] = [];
  if (bench && te) {
    for (const s of GICS_SECTORS) {
      if (!(bench[s] ?? 0)) continue;
      const b = bucket(s);
      b.activeRiskShare = (b.activeRiskShare ?? 0) + te.share[etfIdx(s)];
      benchmarkLegs.push({ sector: s, etf: ETF_BY_SECTOR[s], weight: -(bench[s] ?? 0), activeRiskShare: te.share[etfIdx(s)], teContribution: teContribution(etfIdx(s))!, marginalTe: marginalTe(etfIdx(s))! });
    }
  }
  // Negative cash (overdrawn) is kept too, or holdings would add to more than 100% with nothing offsetting them.
  if (input.cash.weight !== 0) bucket("cash").weight += input.cash.weight;
  const sectors = [...buckets.values()]
    .map((b) => ({ ...b, active: b.benchWeight === null ? null : b.weight - b.benchWeight }))
    .sort((a, b) => (a.key === "cash" ? 1 : b.key === "cash" ? -1 : b.weight + (b.benchWeight ?? 0) - (a.weight + (a.benchWeight ?? 0))));

  // Historical simulation: today's weights times each day's returns.
  const simulated = dates.map((d, t) => ({ date: d, ret: sum(input.holdings.map((h, i) => h.weight * columns[i][t])) }));
  const hv = historicalVaR(simulated.map((s) => s.ret), VAR_LEVEL);
  // Enough of the worst days to show both sides of the percentile interpolation.
  const tail = [...simulated].sort((a, b) => a.ret - b.ret).slice(0, Math.max(hv.tailCount, Math.floor((1 - VAR_LEVEL) * (T - 1)) + 2, 5));

  const weightsDesc = input.holdings.map((h) => h.weight).sort((a, b) => b - a);
  const conc = concentration(weightsDesc);

  const corrTickers = input.holdings
    .map((h, i) => ({ h, i }))
    .filter(({ i }) => coverage[i].source !== "excluded")
    .sort((a, b) => b.h.weight - a.h.weight)
    .slice(0, CORRELATION_LIMIT)
    .sort((a, b) => (a.h.sector ?? "~").localeCompare(b.h.sector ?? "~") || b.h.weight - a.h.weight);
  const corrAll = correlationMatrix(cov);
  const correlation = { tickers: corrTickers.map((x) => x.h.ticker), matrix: corrTickers.map((a) => corrTickers.map((b) => corrAll[a.i][b.i])) };

  if (!input.riskFree) notices.push("No Treasury bill yield (^IRX) is stored yet, so the Sharpe ratio is not shown.");
  // Factor betas regress the same filled columns (own returns, or the sector ETF where history is short).
  const factors = buildFactorReport({
    dates,
    returns: input.window.returns,
    holdings: input.holdings.map((h, i) => ({ ticker: h.ticker, weight: h.weight, column: columns[i], source: coverage[i].source, proxy: coverage[i].proxy })),
    benchmark: bench ? GICS_SECTORS.filter((s) => (bench[s] ?? 0) > 0).map((s) => ({ ticker: ETF_BY_SECTOR[s], weight: bench[s] ?? 0, column: columns[etfIdx(s)] })) : null,
  });

  const realized = input.realized ? realizedRisk(input.realized, dates[0] ?? input.realized.dates[0] ?? input.asOf, target) : null;

  return {
    scope: input.scope,
    asOf: input.asOf,
    lookback: input.lookback,
    window: { from: dates[0] ?? null, to: dates.at(-1) ?? null, days: T, target },
    nav: input.nav,
    cash: input.cash,
    holdings,
    sectors,
    portfolio: {
      vol: annualizeVol(dec.sigma),
      dailySigma: dec.sigma,
      dailyVariance: dec.variance,
      beta: portfolioBeta,
      marketVol: annualizeVol(Math.sqrt(Math.max(0, marketVar))),
      trackingError: te ? annualizeVol(te.sigma) : null,
      dailyTe: te ? te.sigma : null,
      var: {
        level: VAR_LEVEL,
        pct: hv.var,
        dollars: hv.var * input.nav,
        es: hv.es,
        esDollars: hv.es * input.nav,
        parametricPct: Z95 * dec.sigma,
        observations: hv.observations,
        rank: (1 - VAR_LEVEL) * (hv.observations - 1),
        tail,
      },
      stress: { shock: MARKET_SHOCK, move: portfolioBeta * MARKET_SHOCK, dollars: portfolioBeta * MARKET_SHOCK * input.nav },
      hhi: conc.hhi,
      effectiveN: conc.effectiveN,
      top5: sum(weightsDesc.slice(0, 5)),
      top10: sum(weightsDesc.slice(0, 10)),
      invested: sum(weightsDesc),
    },
    benchmarkLegs,
    correlation,
    realized,
    coverage,
    riskFree: input.riskFree,
    notices,
    factors,
    matrix: { dates, tickers: coverage.map((c) => c.ticker), columns, weights: w, active, covariance: cov },
  };
}
