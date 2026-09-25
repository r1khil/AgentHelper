/** Deterministic, explicitly synthetic data for local browser QA of the Risk page; never used by the real route. */
import { ETF_BY_SECTOR, GICS_SECTORS, type GicsSector } from "@/lib/attribution/sectors";
import { buildRiskReport, LOOKBACKS, MARKET, type LookbackKey, type RiskHolding } from "./model";

export const previewEnabled = () => process.env.NODE_ENV === "development" && process.env.RISK_PREVIEW === "1";

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    // Sum of uniforms: roughly normal, mean 0, unit variance.
    let s = 0;
    for (let i = 0; i < 6; i++) {
      s += x / 2147483647 - 0.5;
      x = (x * 16807) % 2147483647;
    }
    return s * Math.SQRT2;
  };
}

const HOLDINGS: [string, GicsSector, number, number][] = [
  // ticker, sector, weight, beta
  ["ALFA", "information_technology", 0.08, 1.6],
  ["BRVO", "information_technology", 0.07, 1.4],
  ["CHRL", "information_technology", 0.05, 1.8],
  ["DLTA", "communication_services", 0.07, 1.2],
  ["ECHO", "communication_services", 0.04, 1.1],
  ["FXTR", "financials", 0.06, 1.1],
  ["GOLF", "financials", 0.05, 1.3],
  ["HTEL", "health_care", 0.06, 0.6],
  ["INDA", "health_care", 0.05, 0.4],
  ["JULT", "industrials", 0.06, 1.0],
  ["KILO", "consumer_discretionary", 0.05, 1.3],
  ["LIMA", "consumer_staples", 0.07, 0.5],
  ["MIKE", "utilities", 0.06, 0.4],
  ["NOVR", "real_estate", 0.04, 0.8],
  ["OSCR", "materials", 0.03, 1.2],
];

export function previewReport(lookback: LookbackKey) {
  const T = LOOKBACKS[lookback].days;
  const dates: string[] = [];
  for (let d = new Date(Date.UTC(2026, 8, 24)); dates.length < T; d.setUTCDate(d.getUTCDate() - 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.unshift(d.toISOString().slice(0, 10));
  }
  const noise = rng(42);
  const market = dates.map(() => 0.0004 + 0.009 * noise());
  const sectorFactor = new Map(GICS_SECTORS.map((s) => [s, dates.map(() => 0.005 * noise())]));
  const returns = new Map<string, number[]>([[MARKET, market]]);
  for (const s of GICS_SECTORS) returns.set(ETF_BY_SECTOR[s], market.map((m, t) => m * (s === "utilities" || s === "consumer_staples" ? 0.6 : 1) + sectorFactor.get(s)![t]));
  const nav = 4_650_000;
  const holdings: RiskHolding[] = HOLDINGS.map(([ticker, sector, weight, b]) => {
    const r = market.map((m, t) => b * m + sectorFactor.get(sector)![t] + 0.012 * noise());
    // One newer listing, to show the sector-ETF proxy.
    returns.set(ticker, ticker === "OSCR" ? r.map((x, t) => (t < T - 40 ? NaN : x)) : r);
    return { ticker, name: `Synthetic ${ticker.toLowerCase()}`, teamId: null, sector, value: weight * nav, weight };
  });
  const invested = holdings.reduce((s, h) => s + h.weight, 0);

  const realizedDays = 64;
  const rd = dates.slice(-realizedDays);
  const fund = rd.map((_, i) => holdings.reduce((s, h) => s + h.weight * (returns.get(h.ticker)![T - realizedDays + i] || 0), 0));
  const weights: Partial<Record<GicsSector, number>> = { information_technology: 0.34, financials: 0.13, health_care: 0.09, consumer_discretionary: 0.1, communication_services: 0.1, industrials: 0.08, consumer_staples: 0.05, energy: 0.03, utilities: 0.025, real_estate: 0.02, materials: 0.025 };
  return buildRiskReport({
    scope: "fund",
    asOf: dates.at(-1)!,
    lookback,
    nav,
    cash: { value: (1 - invested) * nav, weight: 1 - invested },
    holdings,
    benchmarkWeights: weights,
    window: { dates, returns },
    riskFree: { annual: 0.0407, asOf: dates.at(-1)! },
    realized: {
      dates: rd,
      portfolio: fund,
      benchmark: rd.map((_, i) => GICS_SECTORS.reduce((s, k) => s + (weights[k] ?? 0) * returns.get(ETF_BY_SECTOR[k])![T - realizedDays + i], 0)),
      market: market.slice(-realizedDays),
      riskFree: rd.map(() => 0.0407 / 252),
    },
  });
}

/** Synthetic return window for a few tickers (the first is high-beta tech, the rest defensive health care), for tests and the Backtesting preview. */
export function previewWindow(tickers: string[], T: number) {
  const dates: string[] = [];
  for (let d = new Date(Date.UTC(2026, 7, 31)); dates.length < T; d.setUTCDate(d.getUTCDate() - 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.unshift(d.toISOString().slice(0, 10));
  }
  const noise = rng(7);
  const market = dates.map(() => 0.0004 + 0.009 * noise());
  const returns = new Map<string, number[]>([[MARKET, market]]);
  for (const s of GICS_SECTORS) returns.set(ETF_BY_SECTOR[s], market.map((m) => m * (s === "health_care" ? 0.6 : 1) + 0.004 * noise()));
  const sectorOf = new Map<string, GicsSector | null>();
  tickers.forEach((t, i) => {
    const tech = i === 0;
    sectorOf.set(t, tech ? "information_technology" : "health_care");
    returns.set(t, market.map((m) => (tech ? 1.5 : 0.5) * m + 0.011 * noise()));
  });
  return { window: { dates, returns }, sectorOf };
}

