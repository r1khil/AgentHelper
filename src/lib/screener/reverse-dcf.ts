import type { DerivedYear } from "./line-items";
import { investedCapital } from "./metrics";

/*
 * Reverse DCF (Module 5): the revenue growth today's price implies, set beside what the company has actually grown
 * and what the Street expects. Numbers only; no model writes anything here.
 *
 * The model, per year t = 1..10 from the latest fiscal year:
 *   growth       g for years 1–5, then a straight line from g to the terminal rate g_T (2.5%) over years 6–10;
 *   revenue      last year's revenue × (1 + g_t);
 *   NOPAT        revenue × EBIT margin (its five-year average) × (1 − tax rate (five-year average, clamped 15–30%));
 *   ROIC         with fade, a straight line from today's ROIC to max(r + 2 points, ROIC / 2) at year 10; without,
 *                today's ROIC throughout;
 *   reinvestment g_t / ROIC_t of NOPAT, capped at 100% in years 6–10 (in years 1–5 it can exceed NOPAT, which is
 *                the negative cash flow of growing faster than returns can fund);
 *   free cash    NOPAT × (1 − reinvestment), discounted at r;
 *   terminal     year-10 NOPAT grown one year at g_T, less reinvestment g_T / ROIC_terminal, over (r − g_T).
 * The sum is enterprise value; the price implies the g where it equals market cap plus net debt. g is found by
 * bisection between −20% and today's ROIC, after checking on a coarse grid that value rises with g (otherwise the
 * answer is "not meaningful").
 */

export const DEFAULT_DISCOUNT_RATE = 0.1;
export const TERMINAL_GROWTH = 0.025;
export const GROWTH_FLOOR = -0.2;
export const SENSITIVITY_RATES = [0.08, 0.09, 0.1, 0.11, 0.12];
const TAX_MIN = 0.15;
const TAX_MAX = 0.3;

export type ReverseDcfInputs = {
  price: number;
  shares: number;
  /** Latest fiscal year's revenue. */
  revenue: number;
  /** Operating (EBIT) margin, five-year average, as a fraction. */
  margin: number;
  /** Effective tax rate, five-year average clamped to 15–30%, as a fraction. */
  taxRate: number;
  /** Today's return on invested capital, as a fraction. */
  roic: number;
  netDebt: number;
  /** Discount rate r. */
  rate: number;
  /** Terminal growth g_T. */
  terminal: number;
  periodEnd: string;
};

export type ReverseDcfResult = {
  status: "ok" | "not_meaningful" | "no_data";
  reason?: string;
  impliedGrowth: number | null;
  hist5: number | null;
  hist10: number | null;
  /** Consensus revenue growth for the next fiscal year ("consensus covers 1–2 years"). */
  consensusNextYear: number | null;
  sensitivity: { rate: number; withFade: number | null; withoutFade: number | null }[];
  inputs: ReverseDcfInputs | null;
  asOf: string;
};

export type SolveResult = { status: "ok" | "not_meaningful"; impliedGrowth: number | null; reason?: string };

/** The growth rate in year t (1..10) when years 1–5 grow at g. */
export function growthAt(t: number, g: number, terminal: number) {
  return t <= 5 ? g : g + ((terminal - g) * (t - 5)) / 5;
}

/** ROIC in year t (1..10), fading to max(r + 2 points, ROIC / 2) by year 10 when `fade`. */
export function roicAt(t: number, roic: number, rate: number, fade: boolean) {
  if (!fade) return roic;
  const end = Math.max(rate + 0.02, roic / 2);
  return roic + ((end - roic) * t) / 10;
}

/** Enterprise value when years 1–5 grow at g. */
export function enterpriseValueAt(g: number, i: Omit<ReverseDcfInputs, "price" | "shares" | "netDebt" | "periodEnd">, fade: boolean): number {
  const { rate: r, terminal } = i;
  let revenue = i.revenue;
  let nopat = 0;
  let pv = 0;
  for (let t = 1; t <= 10; t++) {
    const gt = growthAt(t, g, terminal);
    revenue *= 1 + gt;
    nopat = revenue * i.margin * (1 - i.taxRate);
    let reinvest = gt / roicAt(t, i.roic, r, fade);
    if (t >= 6 && reinvest > 1) reinvest = 1;
    pv += (nopat * (1 - reinvest)) / (1 + r) ** t;
  }
  const roicTerminal = roicAt(10, i.roic, r, fade);
  const tv = (nopat * (1 + terminal) * (1 - terminal / roicTerminal)) / (r - terminal);
  return pv + tv / (1 + r) ** 10;
}

/** Why the model can't give an answer for these inputs, or null when it can. */
export function notMeaningful(i: ReverseDcfInputs): string | null {
  if (![i.price, i.shares, i.revenue, i.margin, i.taxRate, i.roic, i.netDebt, i.rate, i.terminal].every(Number.isFinite)) return "An input is missing";
  if (i.revenue * i.margin * (1 - i.taxRate) <= 0) return "After-tax operating income is zero or negative";
  if (i.roic <= i.rate) return "ROIC is at or below the discount rate";
  if (i.rate <= i.terminal) return "The discount rate is at or below terminal growth";
  return null;
}

const GRID = 40;

/**
 * The years-1–5 revenue growth today's price implies. Checks on a coarse grid that value rises with growth over the
 * search range before trusting the bisection; outside the range (below −20% or above ROIC) the answer is not
 * meaningful rather than clamped.
 */
export function solveImpliedGrowth(i: ReverseDcfInputs, { fade }: { fade: boolean }): SolveResult {
  const why = notMeaningful(i);
  if (why) return { status: "not_meaningful", impliedGrowth: null, reason: why };
  const target = i.price * i.shares + i.netDebt;
  const lo = GROWTH_FLOOR;
  const hi = i.roic;
  const value = (g: number) => enterpriseValueAt(g, i, fade);
  let prev = value(lo);
  for (let k = 1; k <= GRID; k++) {
    const v = value(lo + ((hi - lo) * k) / GRID);
    if (!(v >= prev - Math.abs(prev) * 1e-9)) return { status: "not_meaningful", impliedGrowth: null, reason: "Value doesn't rise with growth for these inputs" };
    prev = v;
  }
  const vLo = value(lo);
  const vHi = value(hi);
  if (target < vLo) return { status: "not_meaningful", impliedGrowth: null, reason: "The price implies revenue shrinking faster than 20% a year" };
  if (target > vHi) return { status: "not_meaningful", impliedGrowth: null, reason: "The price implies growth above the company's ROIC" };
  let a = lo;
  let b = hi;
  for (let n = 0; n < 100 && b - a > 1e-9; n++) {
    const m = (a + b) / 2;
    if (value(m) < target) a = m;
    else b = m;
  }
  return { status: "ok", impliedGrowth: +((a + b) / 2).toFixed(6) };
}

/** Implied growth at each sensitivity rate, with and without the ROIC fade. */
export function sensitivity(i: ReverseDcfInputs, rates = SENSITIVITY_RATES): ReverseDcfResult["sensitivity"] {
  return rates.map((rate) => ({
    rate,
    withFade: solveImpliedGrowth({ ...i, rate }, { fade: true }).impliedGrowth,
    withoutFade: solveImpliedGrowth({ ...i, rate }, { fade: false }).impliedGrowth,
  }));
}

/** Compound annual growth of revenue over `years` fiscal years (series newest first), or null. */
export function revenueCagr(series: DerivedYear[], years: number): number | null {
  const a = series[0]?.revenue;
  const b = series[years]?.revenue;
  if (a === null || a === undefined || b === null || b === undefined || a <= 0 || b <= 0) return null;
  return +((a / b) ** (1 / years) - 1).toFixed(6);
}

/**
 * The model's inputs from a company's fiscal years (newest first), price and share count. Margin and tax rate are
 * five-year averages (at least three years); ROIC is today's, on the normalized tax rate. Null with a reason when a
 * figure is missing.
 */
export function buildInputs(series: DerivedYear[], price: number | null, shares: number | null, rate: number, terminal = TERMINAL_GROWTH): { inputs: ReverseDcfInputs | null; reason?: string } {
  const y = series[0];
  if (!y) return { inputs: null, reason: "No annual figures on file" };
  if (price === null || !Number.isFinite(price) || price <= 0) return { inputs: null, reason: "No current price" };
  if (shares === null || !Number.isFinite(shares) || shares <= 0) return { inputs: null, reason: "No share count" };
  if (y.revenue === null || y.revenue <= 0) return { inputs: null, reason: "No revenue for the latest fiscal year" };
  const five = series.slice(0, 5);
  const margins = five.filter((s) => s.revenue !== null && s.revenue > 0 && s.ebit !== null).map((s) => s.ebit! / s.revenue!);
  if (margins.length < 3) return { inputs: null, reason: "Fewer than three years of operating margin" };
  const margin = margins.reduce((a, b) => a + b, 0) / margins.length;
  const rates = five.filter((s) => s.pretaxIncome !== null && s.pretaxIncome > 0 && s.incomeTax !== null).map((s) => s.incomeTax! / s.pretaxIncome!);
  const avgTax = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0.21;
  const taxRate = Math.min(TAX_MAX, Math.max(TAX_MIN, avgTax));
  const ic = investedCapital(y);
  if (ic === null || y.ebit === null) return { inputs: null, reason: "No invested capital or operating income for the latest year" };
  if (y.debt === null) return { inputs: null, reason: "No balance sheet for the latest year" };
  const roic = (y.ebit * (1 - taxRate)) / ic;
  return {
    inputs: {
      price,
      shares,
      revenue: y.revenue,
      margin: +margin.toFixed(6),
      taxRate: +taxRate.toFixed(6),
      roic: +roic.toFixed(6),
      netDebt: y.debt - (y.cash ?? 0),
      rate,
      terminal,
      periodEnd: y.end,
    },
  };
}

/** The whole result from its parts: pure, so the loader below is only data fetching. */
export function reverseDcf(p: { series: DerivedYear[]; price: number | null; shares: number | null; rate: number; consensusNextYear: number | null; asOf: string }): ReverseDcfResult {
  const hist5 = revenueCagr(p.series, 5);
  const hist10 = revenueCagr(p.series, 10);
  const base = { hist5, hist10, consensusNextYear: p.consensusNextYear, asOf: p.asOf };
  const { inputs, reason } = buildInputs(p.series, p.price, p.shares, p.rate);
  if (!inputs) return { status: "no_data", reason, impliedGrowth: null, sensitivity: [], inputs: null, ...base };
  const solved = solveImpliedGrowth(inputs, { fade: true });
  return { status: solved.status, ...(solved.reason ? { reason: solved.reason } : {}), impliedGrowth: solved.impliedGrowth, sensitivity: sensitivity(inputs), inputs, ...base };
}

/**
 * Load everything for one company and run the reverse DCF. `rate` overrides the fund-wide discount rate for this name
 * (app_settings `screener_discount_rate`, 10% by default).
 */
export async function loadReverseDcf(ticker: string, cik: string, opts: { rate?: number } = {}): Promise<ReverseDcfResult> {
  const [{ getCompanyFacts }, { getEstimates, getQuote }, { annualSeries }, { todayNY }] = await Promise.all([
    import("@/lib/providers/edgar"),
    import("@/lib/providers/yahoo"),
    import("./line-items"),
    import("@/lib/providers/calendar"),
  ]);
  const asOf = todayNY();
  const empty = (reason: string): ReverseDcfResult => ({ status: "no_data", reason, impliedGrowth: null, hist5: null, hist10: null, consensusNextYear: null, sensitivity: [], inputs: null, asOf });
  let facts;
  try {
    facts = await getCompanyFacts(cik);
  } catch {
    return empty("SEC company facts unavailable");
  }
  const series = annualSeries(facts, 11);
  const quote = await getQuote(ticker).catch(() => null);
  const estimates = await getEstimates(ticker).catch(() => null);
  const rate = opts.rate ?? (await (await import("./discount-rate")).getScreenerDiscountRate());
  const shares = latestCoverShares(facts) ?? (quote?.marketCap && quote.price ? quote.marketCap / quote.price : null) ?? series[0]?.shares ?? null;
  const row = estimates?.trend.find((t) => t.period === "current fiscal year" && t.revenue.growthPct !== null) ?? estimates?.trend.find((t) => t.period === "next fiscal year" && t.revenue.growthPct !== null);
  const consensusNextYear = row?.revenue.growthPct !== null && row?.revenue.growthPct !== undefined ? +(row.revenue.growthPct / 100).toFixed(4) : null;
  return reverseDcf({ series, price: quote?.price ?? null, shares, rate, consensusNextYear, asOf });
}

/** The most recent cover-page share count (dei), summed across share classes reported on the same date. */
export function latestCoverShares(facts: { facts: Record<string, Record<string, { units: Record<string, { end: string; val: number; filed: string }[]> }>> }): number | null {
  const rows = facts.facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
  if (!rows.length) return null;
  const latestEnd = rows.reduce((m, r) => (r.end > m ? r.end : m), "");
  const onDate = rows.filter((r) => r.end === latestEnd);
  const latestFiled = onDate.reduce((m, r) => (r.filed > m ? r.filed : m), "");
  const total = onDate.filter((r) => r.filed === latestFiled).reduce((s, r) => s + r.val, 0);
  return total > 0 ? total : null;
}
