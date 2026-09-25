/** The risk model works in fractions; the page shows percentages and dollars. */
export const rpct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`);
export const rsigned = (v: number | null | undefined, digits = 1) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`);
export const rnum = (v: number | null | undefined, digits = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(digits));
export const rusd = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v < 0 ? "−" : ""}$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(v))}`;
export const rusdFull = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
/** Daily decimals in the working panels, shown to enough places to reproduce the next step. */
export const rsci = (v: number, digits = 6) => (Math.abs(v) < 1e-4 && v !== 0 ? v.toExponential(3) : v.toFixed(digits));
