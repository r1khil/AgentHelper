/** Deterministic, explicitly synthetic data for local browser QA of the Risk page; never used by the real route. */
import { ETF_BY_SECTOR, GICS_SECTORS, type GicsSector } from "@/lib/attribution/sectors";
import type { DateSeries } from "@/lib/attribution/types";
import type { FactorKey } from "./factors";
import { buildRiskReport, LOOKBACKS, MARKET, type LookbackKey, type RiskHolding, type RiskReport } from "./model";
import { runStressTests, STRESS_WINDOWS, stressInputFromReport, type StressResult } from "./stress";

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

/** Sector ETFs' factor tilts: banks are value and short duration, tech is growth and momentum, and so on. */
const SECTOR_TILTS: Partial<Record<GicsSector, Partial<Record<FactorKey, number>>>> = {
  financials: { value: 0.5, rates: -0.35, size: 0.1 },
  information_technology: { value: -0.6, momentum: 0.35, rates: 0.1 },
  utilities: { rates: 0.45 },
  real_estate: { rates: 0.4, size: 0.2 },
  energy: { oil: 0.45, value: 0.3 },
  materials: { oil: 0.15, dollar: -0.3 },
  consumer_staples: { rates: 0.15, dollar: -0.15 },
};
/** Holding-specific tilts on top of their sector's, so the Fund's row differs from the benchmark's. */
const HOLDING_TILTS: Record<string, Partial<Record<FactorKey, number>>> = {
  FXTR: { rates: -1.0, size: 0.5 },
  GOLF: { rates: -0.9 },
  KILO: { size: 0.8, momentum: -0.4 },
  OSCR: { oil: 1.2 },
  JULT: { oil: 0.3, dollar: -0.4 },
  LIMA: { dollar: -0.5 },
  ALFA: { momentum: 0.5 },
};

/**
 * Synthetic factor ETFs: each factor gets its own return stream, and the ETFs are built so the
 * regression's spreads come back out (IWM − SPY is the size factor, IVE − IVW value, and so on).
 */
function previewFactorEtfs(market: number[], returns: Map<string, number[]>): Record<FactorKey, number[]> {
  const n = rng(77);
  const draw = (scale: number) => market.map(() => scale * n());
  const f: Record<FactorKey, number[]> = {
    market,
    size: draw(0.004),
    value: draw(0.004),
    momentum: draw(0.005),
    rates: market.map((m) => -0.15 * m + 0.008 * n()),
    dollar: draw(0.003),
    oil: market.map((m) => 0.4 * m + 0.018 * n()),
  };
  const growth = market.map((m) => m + 0.0015 * n());
  returns.set("IWM", market.map((m, t) => m + f.size[t]));
  returns.set("IVW", growth);
  returns.set("IVE", growth.map((g, t) => g + f.value[t]));
  returns.set("MTUM", market.map((m, t) => m + f.momentum[t]));
  returns.set("TLT", f.rates);
  returns.set("UUP", f.dollar);
  returns.set("USO", f.oil);
  return f;
}

export function previewReport(lookback: LookbackKey, opts: { team?: boolean } = {}) {
  const T = LOOKBACKS[lookback].days;
  const dates: string[] = [];
  for (let d = new Date(Date.UTC(2026, 8, 24)); dates.length < T; d.setUTCDate(d.getUTCDate() - 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.unshift(d.toISOString().slice(0, 10));
  }
  const noise = rng(42);
  const market = dates.map(() => 0.0004 + 0.009 * noise());
  const sectorFactor = new Map(GICS_SECTORS.map((s) => [s, dates.map(() => 0.005 * noise())]));
  const returns = new Map<string, number[]>([[MARKET, market]]);
  // Factor ETFs from their own stream, so the rest of the synthetic data doesn't change with them.
  const fx = previewFactorEtfs(market, returns);
  const tilt = (loads: Partial<Record<FactorKey, number>> | undefined, t: number) => (loads ? Object.entries(loads).reduce((s, [k, b]) => s + b * fx[k as FactorKey][t], 0) : 0);
  for (const s of GICS_SECTORS) returns.set(ETF_BY_SECTOR[s], market.map((m, t) => m * (s === "utilities" || s === "consumer_staples" ? 0.6 : 1) + sectorFactor.get(s)![t] + tilt(SECTOR_TILTS[s], t)));
  const nav = 4_650_000;
  const holdings: RiskHolding[] = HOLDINGS.map(([ticker, sector, weight, b]) => {
    const r = market.map((m, t) => b * m + sectorFactor.get(sector)![t] + tilt(SECTOR_TILTS[sector], t) + tilt(HOLDING_TILTS[ticker], t) + 0.012 * noise());
    // One newer listing, to show the sector-ETF proxy.
    returns.set(ticker, ticker === "OSCR" ? r.map((x, t) => (t < T - 40 ? NaN : x)) : r);
    return { ticker, name: `Synthetic ${ticker.toLowerCase()}`, teamId: null, sector, value: weight * nav, weight };
  });
  const invested = holdings.reduce((s, h) => s + h.weight, 0);

  const realizedDays = 64;
  const rd = dates.slice(-realizedDays);
  const fund = rd.map((_, i) => holdings.reduce((s, h) => s + h.weight * (returns.get(h.ticker)![T - realizedDays + i] || 0), 0));
  const weights: Partial<Record<GicsSector, number>> = { information_technology: 0.34, financials: 0.13, health_care: 0.09, consumer_discretionary: 0.1, communication_services: 0.1, industrials: 0.08, consumer_staples: 0.05, energy: 0.04, utilities: 0.025, real_estate: 0.02, materials: 0.025 };
  if (opts.team) {
    // A "technology and media" team: its holdings scaled to 100%, no cash, benchmarked on its own two sectors, as loadRisk does for a team.
    const sectors: GicsSector[] = ["information_technology", "communication_services"];
    const own = holdings.filter((h) => h.sector && sectors.includes(h.sector));
    const total = own.reduce((s, h) => s + h.weight, 0);
    const benchTotal = sectors.reduce((s, k) => s + (weights[k] ?? 0), 0);
    return buildRiskReport({
      scope: "team",
      asOf: dates.at(-1)!,
      lookback,
      nav: total * nav,
      cash: { value: 0, weight: 0 },
      holdings: own.map((h) => ({ ...h, teamId: "preview-team", weight: h.weight / total })),
      benchmarkWeights: Object.fromEntries(sectors.map((k) => [k, (weights[k] ?? 0) / benchTotal])),
      window: { dates, returns },
      riskFree: { annual: 0.0407, asOf: dates.at(-1)! },
      realized: null,
    });
  }
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


/**
 * Synthetic closes through each stress window for the preview's holdings: a market move of about the
 * real size, sector shocks (banks in the SVB window), one dividend, and OSCR listing in 2023 so the
 * sector-ETF stand-in shows. Run through the real stress engine.
 */
export function previewStress(report: RiskReport): StressResult[] {
  const moves: Record<string, { market: number; sectors: Partial<Record<GicsSector, number>> }> = {
    covid: { market: -0.34, sectors: { energy: -0.2, real_estate: -0.1, financials: -0.08, health_care: 0.08, consumer_staples: 0.1 } },
    "rates-2022": { market: -0.25, sectors: { information_technology: -0.12, communication_services: -0.15, energy: 0.5, utilities: 0.2, consumer_staples: 0.15 } },
    svb: { market: -0.004, sectors: { financials: -0.1, information_technology: 0.06 } },
    "carry-unwind": { market: -0.06, sectors: { information_technology: -0.04, utilities: 0.05 } },
  };
  const noise = rng(99);
  const prices: DateSeries = new Map();
  const dividends: DateSeries = new Map();
  const put = (s: DateSeries, sym: string, d: string, v: number) => {
    if (!s.has(sym)) s.set(sym, new Map());
    s.get(sym)!.set(d, v);
  };
  const betas = new Map(HOLDINGS.map(([t, , , b]) => [t, b]));
  for (const w of STRESS_WINDOWS) {
    const dates: string[] = [];
    for (let d = new Date(`${w.from}T00:00:00Z`); d.toISOString().slice(0, 10) <= w.to; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(d.toISOString().slice(0, 10));
    }
    const n = dates.length - 1;
    const m = moves[w.key];
    const market = dates.map((_, t) => (t === 0 ? 0 : Math.log(1 + m.market) / n + 0.006 * noise()));
    const sector = new Map(GICS_SECTORS.map((s) => [s, dates.map((_, t) => (t === 0 ? 0 : Math.log(1 + (m.sectors[s] ?? 0)) / n + 0.003 * noise()))]));
    const level = new Map<string, number>();
    const step = (sym: string, t: number, r: number) => {
      const v = (level.get(sym) ?? 100) * Math.exp(r);
      level.set(sym, v);
      put(prices, sym, dates[t], +v.toFixed(4));
    };
    dates.forEach((_, t) => {
      step(MARKET, t, market[t]);
      for (const s of GICS_SECTORS) step(ETF_BY_SECTOR[s], t, market[t] * (s === "utilities" || s === "consumer_staples" ? 0.6 : 1) + sector.get(s)![t]);
      for (const h of report.holdings) {
        if (h.ticker === "OSCR" && w.from < "2023-01-01") continue;
        const s = h.sector ?? "information_technology";
        step(h.ticker, t, t === 0 ? 0 : (betas.get(h.ticker) ?? 1) * market[t] + sector.get(s)![t] + 0.008 * noise());
      }
    });
    if (w.key === "rates-2022") put(dividends, "LIMA", dates[Math.floor(n / 2)], 1.2);
  }
  return runStressTests(stressInputFromReport(report, { prices, dividends, firstClose: new Map([["OSCR", "2023-01-03"]]) }));
}
