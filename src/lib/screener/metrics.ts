import { comparableShares, type DerivedYear } from "./line-items";

/*
 * The screen's value and quality metrics, computed in code from reported annual figures (latest fiscal year, not
 * trailing twelve months). Every function here is pure; a metric whose inputs are missing or meaningless (a loss makes
 * EV/EBIT meaningless) is null, never a guess.
 *
 * Units, as stored in screen_hits.metrics: "pct" metrics are fractions (0.052 is 5.2%), and ROIC's trend is a fraction
 * a year (0.012 is 1.2 percentage points a year); "multiple" and "ratio" are plain numbers (8.4 is 8.4×); scores are
 * points (Piotroski 0–9, Altman Z'').
 */

export type MetricTrack = "value" | "garp" | "both";
export type MetricFormat = "multiple" | "pct" | "score" | "ratio";

export type MetricDef = { key: MetricKey; label: string; track: MetricTrack; format: MetricFormat; lowerIsBetter: boolean; help: string };

export const METRIC_KEYS = ["evEbit", "fcfYield", "evEbitVsMedian", "piotroski", "roic", "roicTrend", "altmanZ", "shareChange3y", "netDebtEbitda", "epsGrowth3y"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_DEFS: MetricDef[] = [
  { key: "evEbit", label: "EV/EBIT", track: "value", format: "multiple", lowerIsBetter: true, help: "Enterprise value (market cap plus debt less cash) over the latest fiscal year's operating income. Blank when operating income is zero or negative." },
  { key: "fcfYield", label: "FCF yield", track: "value", format: "pct", lowerIsBetter: false, help: "Operating cash flow less capital expenditure over market cap, latest fiscal year." },
  { key: "evEbitVsMedian", label: "EV/EBIT vs 5y median", track: "value", format: "ratio", lowerIsBetter: true, help: "Today's EV/EBIT over the median of its own EV/EBIT at the previous five fiscal year ends (at least three needed). Under 1.0× is cheaper than its own history." },
  { key: "piotroski", label: "Piotroski F-score", track: "value", format: "score", lowerIsBetter: false, help: "Nine pass/fail tests of profitability, balance-sheet strength and efficiency against the prior year (0–9). Blank when more than one test can't be run." },
  { key: "roic", label: "ROIC", track: "both", format: "pct", lowerIsBetter: false, help: "After-tax operating income over invested capital (equity plus debt less cash) at the fiscal year end." },
  { key: "roicTrend", label: "ROIC 5y trend", track: "both", format: "pct", lowerIsBetter: false, help: "Slope of ROIC across the last five fiscal years, in percentage points a year (at least four years needed)." },
  { key: "altmanZ", label: "Altman Z''", track: "both", format: "score", lowerIsBetter: false, help: "Altman's Z'' for non-manufacturers: 6.56×working capital + 3.26×retained earnings + 6.72×EBIT, each over total assets, + 1.05×book equity over total liabilities. Under 1.1 is the distress zone and is left out of the screen." },
  { key: "shareChange3y", label: "Share count, 3y", track: "both", format: "pct", lowerIsBetter: true, help: "Change in shares outstanding over three fiscal years. Negative means buybacks shrank the count." },
  { key: "netDebtEbitda", label: "Net debt/EBITDA", track: "both", format: "multiple", lowerIsBetter: true, help: "Debt less cash over operating income plus depreciation and amortization. Negative means net cash." },
  { key: "epsGrowth3y", label: "EPS growth, 3y (historical)", track: "garp", format: "pct", lowerIsBetter: false, help: "Compound annual growth of diluted EPS over the last three fiscal years: history, not a forecast. The GARP track ranks it only for names with ROIC above 12% and stable." },
];

export type ScreenMetrics = Record<MetricKey, number | null>;

/** The Altman Z'' distress line: below it a name is left out of the screen. */
export const DISTRESS_Z = 1.1;
/** GARP needs ROIC above this, held steadily (see roicStable). */
export const GARP_ROIC_FLOOR = 0.12;
/** Statutory rate used when a year's effective rate can't be computed (no pretax income, or a loss). */
export const DEFAULT_TAX_RATE = 0.21;

export type CompanyHistory = {
  /** Fiscal years, newest first. */
  years: DerivedYear[];
  /**
   * Share price at each fiscal year end, aligned with `years`, on today's share basis (adjusted for later splits), to
   * pair with share counts put on the same basis by adjustForSplits.
   */
  yearEndPrices: (number | null)[];
  /** Today's price and market cap. */
  price: number | null;
  marketCap: number | null;
};

const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const round = (x: number | null, digits = 4) => (x === null || !Number.isFinite(x) ? null : +x.toFixed(digits));

/** A year's effective tax rate, clamped to 0–35%; the statutory 21% when pretax income is missing or a loss. */
export function effectiveTaxRate(y: Pick<DerivedYear, "incomeTax" | "pretaxIncome">, fallback = DEFAULT_TAX_RATE): number {
  if (!finite(y.incomeTax) || !finite(y.pretaxIncome) || y.pretaxIncome <= 0) return fallback;
  return Math.min(0.35, Math.max(0, y.incomeTax / y.pretaxIncome));
}

/** After-tax operating income. */
export function nopat(y: DerivedYear): number | null {
  return finite(y.ebit) ? y.ebit * (1 - effectiveTaxRate(y)) : null;
}

/** Equity plus debt less cash; null when a part is missing or the total is not positive. */
export function investedCapital(y: Pick<DerivedYear, "equity" | "debt" | "cash">): number | null {
  if (!finite(y.equity) || !finite(y.debt)) return null;
  const ic = y.equity + y.debt - (y.cash ?? 0);
  return ic > 0 ? ic : null;
}

/** Return on invested capital as a fraction (0.15 = 15%). */
export function roic(y: DerivedYear): number | null {
  const np = nopat(y);
  const ic = investedCapital(y);
  return np === null || ic === null ? null : np / ic;
}

/** Ordinary least-squares slope of values over equally spaced years (oldest first), per year. */
export function slope(values: number[]): number | null {
  const k = values.length;
  if (k < 2) return null;
  const xm = (k - 1) / 2;
  const ym = values.reduce((a, b) => a + b, 0) / k;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - xm) * (y - ym);
    den += (x - xm) ** 2;
  });
  return num / den;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** ROIC for the last `n` fiscal years, oldest first, skipping years that can't be computed. */
export function roicHistory(years: DerivedYear[], n = 5): number[] {
  return years
    .slice(0, n)
    .map(roic)
    .filter(finite)
    .reverse();
}

/** ROIC trend in fraction a year (0.01 = one point a year); needs four of the last five years. */
export function roicTrend(years: DerivedYear[]): number | null {
  const h = roicHistory(years, 5);
  return h.length >= 4 ? slope(h) : null;
}

/**
 * ROIC is "stable" above the GARP floor when the latest year clears it, at least four of the last five do, and the
 * five-year slope isn't falling faster than two points a year.
 */
export function roicStable(years: DerivedYear[], floor = GARP_ROIC_FLOOR): boolean {
  const latest = years[0] ? roic(years[0]) : null;
  if (latest === null || latest <= floor) return false;
  const h = years.slice(0, 5).map(roic);
  if (h.filter((r) => finite(r) && r > floor).length < 4) return false;
  const t = roicTrend(years);
  return t !== null && t >= -0.02;
}

export function enterpriseValue(marketCap: number | null, y: Pick<DerivedYear, "debt" | "cash">): number | null {
  if (!finite(marketCap) || !finite(y.debt)) return null;
  return marketCap + y.debt - (y.cash ?? 0);
}

/** EV over EBIT; null when EBIT or EV isn't positive. */
export function evToEbit(ev: number | null, ebit: number | null): number | null {
  if (!finite(ev) || !finite(ebit) || ebit <= 0 || ev <= 0) return null;
  return ev / ebit;
}

/** EV/EBIT at each of the previous five fiscal year ends, from that year's price and share count. */
export function historicalEvEbit(h: CompanyHistory): number[] {
  const out: number[] = [];
  for (let k = 1; k <= 5 && k < h.years.length; k++) {
    const y = h.years[k];
    const px = h.yearEndPrices[k];
    const shares = y.shares ?? y.dilutedShares;
    if (!finite(px) || !finite(shares)) continue;
    const m = evToEbit(enterpriseValue(px * shares, y), y.ebit);
    if (m !== null) out.push(m);
  }
  return out;
}

/**
 * The nine Piotroski tests, latest year against the prior one. Leverage is long-term debt over total assets; "no new
 * shares" compares share counts from the same source. Returns the score and how many tests could be run; the score is
 * reported only when at least eight of nine could.
 */
export function piotroski(cur: DerivedYear, prev: DerivedYear | undefined): { score: number | null; tested: number } {
  if (!prev) return { score: null, tested: 0 };
  const tests: (boolean | null)[] = [];
  const roa = (y: DerivedYear) => (finite(y.netIncome) && finite(y.totalAssets) && y.totalAssets > 0 ? y.netIncome / y.totalAssets : null);
  const ratio = (a: number | null, b: number | null) => (finite(a) && finite(b) && b !== 0 ? a / b : null);
  const cmp = (a: number | null, b: number | null, better: "up" | "down") => (a === null || b === null ? null : better === "up" ? a > b : a < b);
  const r0 = roa(cur);
  const r1 = roa(prev);
  tests.push(r0 === null ? null : r0 > 0);
  tests.push(finite(cur.operatingCashFlow) ? cur.operatingCashFlow > 0 : null);
  tests.push(cmp(r0, r1, "up"));
  tests.push(finite(cur.operatingCashFlow) && finite(cur.netIncome) ? cur.operatingCashFlow > cur.netIncome : null);
  const lev = (y: DerivedYear) => (finite(y.longTermDebt) ? ratio(y.longTermDebt, y.totalAssets) : finite(y.totalAssets) && finite(y.debt) && y.debt === 0 ? 0 : null);
  const l0 = lev(cur);
  const l1 = lev(prev);
  // Leverage fell, or there was no long-term debt in either year.
  tests.push(l0 === null || l1 === null ? null : l0 < l1 || (l0 === 0 && l1 === 0));
  tests.push(cmp(ratio(cur.currentAssets, cur.currentLiabilities), ratio(prev.currentAssets, prev.currentLiabilities), "up"));
  const sh = comparableShares(cur, prev);
  tests.push(sh ? sh[0] <= sh[1] : null);
  tests.push(cmp(ratio(cur.grossProfit, cur.revenue), ratio(prev.grossProfit, prev.revenue), "up"));
  tests.push(cmp(ratio(cur.revenue, cur.totalAssets), ratio(prev.revenue, prev.totalAssets), "up"));
  const tested = tests.filter((t) => t !== null).length;
  return { score: tested >= 8 ? tests.filter((t) => t === true).length : null, tested };
}

/** Altman Z'' (non-manufacturer): 6.56 X1 + 3.26 X2 + 6.72 X3 + 1.05 X4. */
export function altmanZ(y: DerivedYear): number | null {
  const ta = y.totalAssets;
  if (!finite(ta) || ta <= 0 || !finite(y.currentAssets) || !finite(y.currentLiabilities) || !finite(y.retainedEarnings) || !finite(y.ebit) || !finite(y.equity) || !finite(y.totalLiabilities) || y.totalLiabilities <= 0) return null;
  const x1 = (y.currentAssets - y.currentLiabilities) / ta;
  const x2 = y.retainedEarnings / ta;
  const x3 = y.ebit / ta;
  const x4 = y.equity / y.totalLiabilities;
  return 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
}

/** Share count change over three fiscal years, from the same source at both ends. */
export function shareChange3y(years: DerivedYear[]): number | null {
  const sh = comparableShares(years[0], years[3]);
  return sh ? sh[0] / sh[1] - 1 : null;
}

export function netDebtToEbitda(y: DerivedYear): number | null {
  if (!finite(y.debt) || !finite(y.ebit) || !finite(y.depreciation)) return null;
  const ebitda = y.ebit + y.depreciation;
  if (ebitda <= 0) return null;
  return (y.debt - (y.cash ?? 0)) / ebitda;
}

/** Three-year compound growth of diluted EPS; null unless both ends are positive. */
export function epsGrowth3y(years: DerivedYear[]): number | null {
  const a = years[0]?.eps;
  const b = years[3]?.eps;
  if (!finite(a) || !finite(b) || a <= 0 || b <= 0) return null;
  return (a / b) ** (1 / 3) - 1;
}

export function freeCashFlow(y: Pick<DerivedYear, "operatingCashFlow" | "capex">): number | null {
  if (!finite(y.operatingCashFlow) || !finite(y.capex)) return null;
  return y.operatingCashFlow - y.capex;
}

export type ScreenResult = {
  metrics: ScreenMetrics;
  /** Altman Z'' under 1.1. */
  distress: boolean;
  /** ROIC above 12% and stable: eligible for the GARP track. */
  garpEligible: boolean;
  /**
   * Whether each metric's inputs were reported, whatever the result: a loss leaves EV/EBIT blank but resolved. The
   * coverage report counts this, so a metric isn't dropped from the ranking because many companies lose money.
   */
  resolved: Record<MetricKey, boolean>;
};

/** Every screen metric for one company. */
export function computeScreenMetrics(h: CompanyHistory): ScreenResult {
  const y = h.years[0];
  const empty = Object.fromEntries(METRIC_KEYS.map((k) => [k, null])) as ScreenMetrics;
  const none = Object.fromEntries(METRIC_KEYS.map((k) => [k, false])) as Record<MetricKey, boolean>;
  if (!y) return { metrics: empty, distress: false, garpEligible: false, resolved: none };
  const ev = enterpriseValue(h.marketCap, y);
  const evEbit = evToEbit(ev, y.ebit);
  const hist = historicalEvEbit(h);
  const med = hist.length >= 3 ? median(hist) : null;
  const fcf = freeCashFlow(y);
  const r = roic(y);
  const trend = roicTrend(h.years);
  const z = altmanZ(y);
  const garpEligible = roicStable(h.years);
  const metrics: ScreenMetrics = {
    evEbit: round(evEbit, 2),
    fcfYield: round(fcf !== null && finite(h.marketCap) && h.marketCap > 0 ? fcf / h.marketCap : null),
    evEbitVsMedian: round(evEbit !== null && med !== null && med > 0 ? evEbit / med : null, 3),
    piotroski: piotroski(y, h.years[1]).score,
    roic: round(r),
    roicTrend: round(trend),
    altmanZ: round(z, 2),
    shareChange3y: round(shareChange3y(h.years)),
    netDebtEbitda: round(netDebtToEbitda(y), 2),
    epsGrowth3y: round(epsGrowth3y(h.years)),
  };
  const has = (...xs: (number | null | undefined)[]) => xs.every(finite);
  const y3 = h.years[3] as DerivedYear | undefined;
  const histInputs = h.years.slice(1, 6).filter((p, i) => has(h.yearEndPrices[i + 1], p.shares ?? p.dilutedShares, p.debt, p.ebit)).length;
  const resolved: Record<MetricKey, boolean> = {
    evEbit: has(h.marketCap, y.debt, y.ebit),
    fcfYield: has(h.marketCap, y.operatingCashFlow, y.capex),
    evEbitVsMedian: has(h.marketCap, y.debt, y.ebit) && histInputs >= 3,
    piotroski: piotroski(y, h.years[1]).tested >= 8,
    roic: has(y.ebit, y.equity, y.debt),
    roicTrend: h.years.slice(0, 5).filter((p) => has(p.ebit, p.equity, p.debt)).length >= 4,
    altmanZ: has(y.totalAssets, y.currentAssets, y.currentLiabilities, y.retainedEarnings, y.ebit, y.equity, y.totalLiabilities),
    shareChange3y: comparableShares(y, y3) !== null,
    netDebtEbitda: has(y.debt, y.ebit, y.depreciation),
    epsGrowth3y: Boolean(y3) && has(y.eps, y3?.eps),
  };
  return { metrics, distress: z !== null && z < DISTRESS_Z, garpEligible, resolved };
}
