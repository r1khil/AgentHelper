import { fmtAccounting, fmtBp, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/format";

/*
 * The risk model works in fractions. These convert to the page's units (percent, basis points, dollars) and format
 * with the app's shared accounting style from "@/lib/format"; they hold no formatting rules of their own.
 */
const scaled = (v: number | null | undefined, k: number) => (v === null || v === undefined ? null : v * k);

/** A return, weight or risk figure as a fraction: -0.123 → "(12.3%)". */
export const rpct = (v: number | null | undefined, digits = 1) => fmtPct(scaled(v, 100), digits);
/** An active (relative) figure as a fraction: -0.0123 → "(123 bp)". */
export const rbp = (v: number | null | undefined, digits = 0) => fmtBp(scaled(v, 10_000), digits);
/** A plain ratio such as a beta or correlation: -0.5 → "(0.50)". */
export const rnum = (v: number | null | undefined, digits = 2) => fmtAccounting(v, digits);
/** Compact dollars: -1500 → "($1.5K)". */
export const rusd = (v: number | null | undefined) => fmtUsdCompact(v);
/** Whole dollars: -1234.4 → "($1,234)". */
export const rusdFull = (v: number) => fmtUsd(v, 0);
/** Daily decimals in the working panels, shown to enough places to reproduce the next step. */
export const rsci = (v: number, digits = 6) => (Math.abs(v) < 1e-4 && v !== 0 ? v.toExponential(3) : v.toFixed(digits));
