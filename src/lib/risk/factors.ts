/**
 * Factor and macro sensitivities: one multivariate OLS per holding of its daily total return on seven
 * factor returns, over the Risk page's window. Pure functions, so every beta can be checked in a
 * spreadsheet with LINEST(y, factors, TRUE, TRUE) on the downloadable inputs.
 *
 * Spreads rather than raw ETFs for size, value and momentum: IWM, IVE, IVW and MTUM are each about
 * 0.85–0.95 correlated with SPY, and regressing on them directly gives unstable betas that flip sign.
 */
import { FACTOR_ETFS } from "./factor-symbols";
import { TRADING_DAYS, mean, sum } from "./math";

export { FACTOR_ETFS };

export type FactorKey = "market" | "size" | "value" | "momentum" | "rates" | "dollar" | "oil";

export type FactorDef = {
  key: FactorKey;
  label: string;
  /** The ETF held long in the factor. */
  long: string;
  /** The ETF held short against it, for spreads. */
  short: string | null;
  /** How the factor is built, for tooltips and the CSV. */
  definition: string;
};

export const FACTORS: readonly FactorDef[] = [
  { key: "market", label: "Market", long: "SPY", short: null, definition: "SPY daily total return" },
  { key: "size", label: "Size", long: "IWM", short: "SPY", definition: "IWM − SPY daily total return (small caps over large caps)" },
  { key: "value", label: "Value", long: "IVE", short: "IVW", definition: "IVE − IVW daily total return (S&P 500 value over growth)" },
  { key: "momentum", label: "Momentum", long: "MTUM", short: "SPY", definition: "MTUM − SPY daily total return (recent winners over the market)" },
  { key: "rates", label: "Rates", long: "TLT", short: null, definition: "TLT daily total return (20+ year Treasuries; rises when long yields fall)" },
  { key: "dollar", label: "Dollar", long: "UUP", short: null, definition: "UUP daily total return (US dollar against a basket of major currencies)" },
  { key: "oil", label: "Oil", long: "USO", short: null, definition: "USO daily total return (front-month WTI crude futures)" },
];

export const FACTOR_KEYS = FACTORS.map((f) => f.key);

/** |t| below this and a beta is not statistically distinguishable from zero; the page greys it out. */
export const T_STAT_THRESHOLD = 2;
/** The regression needs at least this many days on which every factor has a return. */
export const MIN_FACTOR_DAYS = 60;

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Each factor's daily return on the window's dates; NaN where a leg has no return that day. */
export function factorReturns(returns: Map<string, number[]>, T: number): Record<FactorKey, number[]> {
  const col = (sym: string) => returns.get(sym) ?? new Array<number>(T).fill(NaN);
  return Object.fromEntries(
    FACTORS.map((f) => {
      const long = col(f.long);
      const short = f.short ? col(f.short) : null;
      return [f.key, Array.from({ length: T }, (_, t) => (finite(long[t]) && (!short || finite(short[t])) ? long[t] - (short ? short[t] : 0) : NaN))];
    }),
  ) as Record<FactorKey, number[]>;
}

/** Inverse of a symmetric positive-definite matrix by Gauss-Jordan with partial pivoting; null when singular. */
export function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...m.map((row, i) => Math.abs(row[i])), 0);
  if (!(scale > 0)) return null;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) <= scale * 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    const pivot = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row) => row.slice(n));
}

export type Coefficient = { beta: number; se: number; t: number; significant: boolean };

export type FactorFit = {
  /** Daily intercept (alpha), and annualized (× 252). */
  alpha: Coefficient;
  alphaAnnual: number;
  betas: Record<FactorKey, Coefficient>;
  r2: number;
  adjR2: number;
  /** Observations and degrees of freedom (n − 8), as in LINEST's fourth row. */
  n: number;
  df: number;
  /** Annualized standard deviation of the residuals: the part the factors don't explain. */
  residualVol: number;
};

/**
 * Ordinary least squares with an intercept, reusable across many y's on the same factor rows. Solved
 * on centered factors for numerical stability, which gives exactly the same coefficients and standard
 * errors as the uncentered normal equations (and as Excel's LINEST with const = TRUE).
 */
export function olsDesign(x: number[][]) {
  const n = x.length;
  const k = x[0]?.length ?? 0;
  if (n <= k + 1) return null;
  const means = Array.from({ length: k }, (_, j) => mean(x.map((row) => row[j])));
  const xc = x.map((row) => row.map((v, j) => v - means[j]));
  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => sum(xc.map((row) => row[i] * row[j]))));
  const inv = invert(xtx);
  if (!inv) return null;
  // (X'X)⁻¹[0,0] of the design with an intercept column: 1/n + x̄'(Xc'Xc)⁻¹x̄.
  const alphaVarFactor = 1 / n + sum(means.map((mi, i) => sum(means.map((mj, j) => mi * inv[i][j] * mj))));
  const df = n - k - 1;

  function fit(y: number[]) {
    const ym = mean(y);
    const xty = Array.from({ length: k }, (_, j) => sum(xc.map((row, t) => row[j] * (y[t] - ym))));
    const b = inv!.map((row) => sum(row.map((v, j) => v * xty[j])));
    const a = ym - sum(b.map((bj, j) => bj * means[j]));
    let rss = 0;
    let tss = 0;
    for (let t = 0; t < n; t++) {
      const e = y[t] - a - sum(b.map((bj, j) => bj * x[t][j]));
      rss += e * e;
      tss += (y[t] - ym) ** 2;
    }
    const s2 = df > 0 ? rss / df : NaN;
    const coef = (beta: number, v: number): Coefficient => {
      const se = Math.sqrt(s2 * v);
      const t = se > 0 ? beta / se : beta === 0 ? 0 : Infinity * Math.sign(beta);
      return { beta, se, t, significant: Math.abs(t) >= T_STAT_THRESHOLD };
    };
    const r2 = tss > 0 ? 1 - rss / tss : NaN;
    return {
      alpha: coef(a, alphaVarFactor),
      betas: b.map((bj, j) => coef(bj, inv![j][j])),
      r2,
      adjR2: tss > 0 && df > 0 ? 1 - (1 - r2) * ((n - 1) / df) : NaN,
      n,
      df,
      residualVol: Math.sqrt(s2) * Math.sqrt(TRADING_DAYS),
    };
  }
  return { n, k, means, fit };
}

export type FactorSeriesInput = { ticker: string; weight: number; column: number[] };

export type HoldingFactorFit = FactorFit & { ticker: string; weight: number; source: "own" | "proxy" | "excluded"; proxy: string | null };

export type FactorReport = {
  factors: readonly FactorDef[];
  /** The days used: every factor had a return. Holdings use the same filled columns as the rest of the Risk page. */
  sample: { from: string; to: string; n: number; dropped: number; dates: string[] };
  holdings: HoldingFactorFit[];
  /** Regression of the weighted book (cash earns zero). Its betas equal the weight-sum of the holding betas. */
  fund: FactorFit;
  /** Regression of the sector-ETF benchmark at its current weights. */
  benchmark: FactorFit | null;
  /** Regression of Fund − benchmark; its betas are the Fund's minus the benchmark's. */
  active: FactorFit | null;
  /** Every regression's inputs on the sample days, for the CSV: factor returns, the portfolio's and benchmark's returns, and each holding's (in `holdings` order). */
  inputs: { factors: Record<FactorKey, number[]>; portfolio: number[]; benchmark: number[] | null; holdings: number[][] };
};

export type FactorUnavailable = { reason: string; missing: string[]; days: number };

type RawFit = ReturnType<NonNullable<ReturnType<typeof olsDesign>>["fit"]>;

function toFit(raw: RawFit): FactorFit {
  return {
    alpha: raw.alpha,
    alphaAnnual: raw.alpha.beta * TRADING_DAYS,
    betas: Object.fromEntries(FACTORS.map((f, j) => [f.key, raw.betas[j]])) as Record<FactorKey, Coefficient>,
    r2: raw.r2,
    adjR2: raw.adjR2,
    n: raw.n,
    df: raw.df,
    residualVol: raw.residualVol,
  };
}

/**
 * Regress each holding, the weighted book, the benchmark and the active book on the seven factors.
 * `holdings[i].column` must be the holding's filled return column (own returns, or its sector ETF's
 * where history is short, exactly as the Risk page models it), aligned with `dates`.
 */
export function buildFactorReport(args: {
  dates: string[];
  /** Raw daily total returns by symbol on `dates`, including the factor ETFs. */
  returns: Map<string, number[]>;
  holdings: (FactorSeriesInput & { source: HoldingFactorFit["source"]; proxy: string | null })[];
  /** Benchmark legs (sector ETFs at benchmark weight), or null when no benchmark weights are saved. */
  benchmark: FactorSeriesInput[] | null;
}): FactorReport | FactorUnavailable {
  const T = args.dates.length;
  const f = factorReturns(args.returns, T);
  const missing = FACTOR_ETFS.filter((s) => !(args.returns.get(s) ?? []).some(finite));
  const rows = args.dates.map((_, t) => t).filter((t) => FACTOR_KEYS.every((k) => finite(f[k][t])));
  if (rows.length < MIN_FACTOR_DAYS)
    return {
      reason: missing.length
        ? `No stored closes for ${missing.join(", ")} yet, so factor sensitivities can't be estimated.`
        : `Only ${rows.length} days have a return for every factor ETF (${MIN_FACTOR_DAYS} needed).`,
      missing,
      days: rows.length,
    };
  const x = rows.map((t) => FACTOR_KEYS.map((k) => f[k][t]));
  const design = olsDesign(x);
  if (!design) return { reason: "The factor returns are collinear over this window, so the regression has no unique solution.", missing, days: rows.length };

  const pick = (col: number[]) => rows.map((t) => col[t]);
  const weighted = (legs: FactorSeriesInput[]) => rows.map((t) => sum(legs.map((l) => l.weight * l.column[t])));

  const holdings = args.holdings.map((h) => ({ ...toFit(design.fit(pick(h.column))), ticker: h.ticker, weight: h.weight, source: h.source, proxy: h.proxy }));
  const fundY = weighted(args.holdings);
  const fund = toFit(design.fit(fundY));
  let benchmark: FactorFit | null = null;
  let active: FactorFit | null = null;
  let benchY: number[] | null = null;
  if (args.benchmark) {
    benchY = weighted(args.benchmark);
    benchmark = toFit(design.fit(benchY));
    active = toFit(design.fit(fundY.map((y, i) => y - benchY![i])));
  }
  return {
    factors: FACTORS,
    sample: { from: args.dates[rows[0]], to: args.dates[rows.at(-1)!], n: rows.length, dropped: T - rows.length, dates: rows.map((t) => args.dates[t]) },
    holdings,
    fund,
    benchmark,
    active,
    inputs: {
      factors: Object.fromEntries(FACTOR_KEYS.map((k) => [k, pick(f[k])])) as Record<FactorKey, number[]>,
      portfolio: fundY,
      benchmark: benchY,
      holdings: args.holdings.map((h) => pick(h.column)),
    },
  };
}

export const isFactorReport = (r: FactorReport | FactorUnavailable | null | undefined): r is FactorReport => !!r && "fund" in r;

/** Weight-sum of holding betas: the Fund's exposure built bottom-up. Equals `fund.betas` by linearity of OLS. */
export function weightedBetas(holdings: { weight: number; betas: Record<FactorKey, Coefficient> }[]): Record<FactorKey, number> {
  return Object.fromEntries(FACTOR_KEYS.map((k) => [k, sum(holdings.map((h) => h.weight * h.betas[k].beta))])) as Record<FactorKey, number>;
}

const PLAIN: Record<FactorKey, { instrument: (long: boolean) => string; meaning: (long: boolean) => string; none: string }> = {
  market: { instrument: (l) => `${l ? "long" : "short"} SPY`, meaning: (l) => (l ? "market exposure" : "net short the market"), none: "market" },
  size: { instrument: (l) => (l ? "long IWM against SPY" : "long SPY against IWM"), meaning: (l) => (l ? "a small-cap tilt" : "a large-cap tilt"), none: "size" },
  value: { instrument: (l) => (l ? "long IVE against IVW" : "long IVW against IVE"), meaning: (l) => (l ? "a value tilt" : "a growth tilt"), none: "value/growth" },
  momentum: { instrument: (l) => (l ? "long MTUM against SPY" : "long SPY against MTUM"), meaning: (l) => (l ? "a tilt toward recent winners" : "a tilt away from recent winners"), none: "momentum" },
  rates: { instrument: (l) => `${l ? "long" : "short"} TLT`, meaning: (l) => (l ? "net long duration" : "net short duration"), none: "rates" },
  dollar: { instrument: (l) => `${l ? "long" : "short"} UUP`, meaning: (l) => (l ? "net long the dollar" : "net short the dollar"), none: "dollar" },
  oil: { instrument: (l) => `${l ? "long" : "short"} USO`, meaning: (l) => (l ? "net long oil" : "net short oil"), none: "oil" },
};

/** A market beta within this of 1 moves in line with the market. */
export const MARKET_IN_LINE = 0.05;

function marketMeaning(beta: number) {
  if (beta < 0) return "net short the market";
  if (Math.abs(beta - 1) < MARKET_IN_LINE) return "in line with the market";
  if (beta > 1) return "more market-sensitive than the S&P 500";
  return beta < 0.25 ? "little market sensitivity" : "less market-sensitive than the S&P 500";
}

/** The factor's noun in "no clear … exposure": "rates", "value/growth". */
export const factorNoun = (key: FactorKey) => PLAIN[key].none;

/** The factor's short meaning, e.g. "net short duration", or null when the beta rounds to zero. Says nothing about significance. */
export function factorMeaning(key: FactorKey, beta: number): string | null {
  if (!finite(beta) || Math.round(Math.abs(beta) * 100) === 0) return null;
  return key === "market" ? marketMeaning(beta) : PLAIN[key].meaning(beta > 0);
}

/** Whether a beta is a clear exposure: statistically significant (|t| ≥ 2) and not rounding to zero. */
export const isClearExposure = (key: FactorKey, c: { beta: number; t: number }) => factorMeaning(key, c.beta) !== null && Number.isFinite(c.t) && Math.abs(c.t) >= T_STAT_THRESHOLD;

/**
 * Plain English for one beta, descriptive only: a rates beta of −0.12 reads "Moves like being 12% of
 * NAV short TLT (net short duration)". With a t-stat below 2 it says there is no clear exposure rather
 * than describing a position that the data can't tell from zero. `basis` names what the percentage is of.
 */
export function describeFactorBeta(key: FactorKey, beta: number, opts: { t?: number; basis?: string } = {}): string {
  const basis = opts.basis ?? "NAV";
  const noun = PLAIN[key].none;
  if (!finite(beta)) return `No ${noun} estimate`;
  const b = formatBeta(beta, 2, { signed: true });
  if (finite(opts.t) && Math.abs(opts.t) < T_STAT_THRESHOLD) return `No clear ${noun} exposure (β ${b}, t ${formatBeta(opts.t, 1, { signed: true })}; not statistically significant)`;
  const pct = Math.round(Math.abs(beta) * 100);
  if (pct === 0) return `Essentially no ${noun} exposure (β ${b})`;
  const long = beta > 0;
  return `Moves like being ${pct}% of ${basis} ${PLAIN[key].instrument(long)} (${factorMeaning(key, beta)})`;
}

/** "−0.12" with a true minus sign, the way the page prints betas; `signed` adds "+" to positive ones. */
export function formatBeta(beta: number, digits = 2, opts: { signed?: boolean } = {}) {
  if (!finite(beta)) return "—";
  const s = Math.abs(beta).toFixed(digits);
  if (Number(s) === 0) return s;
  return beta < 0 ? `−${s}` : opts.signed ? `+${s}` : s;
}

const labelOf = (key: FactorKey) => FACTORS.find((f) => f.key === key)!.label;

/** An active beta in words: "a growth tilt relative to the benchmark", "less market-sensitive than the benchmark". */
function activeMeaning(key: FactorKey, beta: number) {
  if (key === "market") return beta > 0 ? "more market-sensitive than the benchmark" : "less market-sensitive than the benchmark";
  return `${PLAIN[key].meaning(beta > 0)} relative to the benchmark`;
}

export type FactorReading = { key: FactorKey; label: string; beta: number; t: number; clear: boolean; text: string };

/**
 * The factor section's sentences: each of the portfolio's betas in plain English, the clear active tilts
 * against the benchmark, and which factors show no clear exposure. Descriptive only.
 */
export function factorReadings(f: FactorReport, opts: { basis?: string } = {}) {
  const fund: FactorReading[] = FACTOR_KEYS.map((k) => {
    const c = f.fund.betas[k];
    return { key: k, label: labelOf(k), beta: c.beta, t: c.t, clear: isClearExposure(k, c), text: describeFactorBeta(k, c.beta, { t: c.t, basis: opts.basis }) };
  });
  const active: FactorReading[] = f.active
    ? FACTOR_KEYS.filter((k) => isClearExposure(k, f.active!.betas[k])).map((k) => {
        const c = f.active!.betas[k];
        return { key: k, label: labelOf(k), beta: c.beta, t: c.t, clear: true, text: `${labelOf(k)} ${formatBeta(c.beta, 2, { signed: true })} (t ${formatBeta(c.t, 1, { signed: true })}): ${activeMeaning(k, c.beta)}` };
      })
    : [];
  return { fund, clear: fund.filter((r) => r.clear), unclear: fund.filter((r) => !r.clear), active };
}
