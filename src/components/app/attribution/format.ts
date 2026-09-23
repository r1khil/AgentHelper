/** Engine values are fractions; the UI shows returns in percent and effects/contributions in basis points. */
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : v * 100);
export const bps = (v: number | null | undefined) => (v === null || v === undefined ? null : v * 10_000);
export const BPS_NOTE = "bps = basis points (100 bps = 1 percentage point)";

export function fmtWeight(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtBps(v: number, digits = 1) {
  const n = v * 10_000;
  const s = n.toFixed(digits);
  return `${n > 0 && Number(s) !== 0 ? "+" : ""}${s} bps`;
}

export function fmtSigned(v: number, digits = 2, unit = "%") {
  const n = v * 100;
  const s = n.toFixed(digits);
  return `${n > 0 && Number(s) !== 0 ? "+" : ""}${s}${unit}`;
}

/** Basis points without the unit, for inline hints like "Cash drag −68 · sectors +41". */
export function fmtBpsShort(v: number) {
  const n = v * 10_000;
  const s = n.toFixed(0);
  return `${n > 0 && Number(s) !== 0 ? "+" : ""}${s}`;
}
