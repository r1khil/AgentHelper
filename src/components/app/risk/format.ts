import { fixed, fmtPct } from "@/lib/format";

const missing = (v: number | null | undefined): v is null | undefined => v === null || v === undefined || !Number.isFinite(v);
/** Dollars with a true minus, which a value that rounds to $0 never gets. */
const usd = (v: number, opts: Intl.NumberFormatOptions) => {
  const body = Math.abs(v).toLocaleString("en-US", opts);
  return `${v < 0 && /[1-9]/.test(body) ? "−" : ""}$${body}`;
};

/** The risk model works in fractions; the page shows percentages and dollars. */
export const rpct = (v: number | null | undefined, digits = 1) => (missing(v) ? "—" : fmtPct(v * 100, digits, false));
export const rsigned = (v: number | null | undefined, digits = 1) => (missing(v) ? "—" : fmtPct(v * 100, digits));
export const rnum = (v: number | null | undefined, digits = 2) => (missing(v) ? "—" : fixed(v, digits));
export const rusd = (v: number | null | undefined) => (missing(v) ? "—" : usd(v, { notation: "compact", maximumFractionDigits: 1 }));
export const rusdFull = (v: number) => usd(v, { maximumFractionDigits: 0 });
/** Daily decimals in the working panels, shown to enough places to reproduce the next step. */
export const rsci = (v: number, digits = 6) => (Math.abs(v) < 1e-4 && v !== 0 ? v.toExponential(3) : v.toFixed(digits));
