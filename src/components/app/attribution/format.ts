/** Engine values are fractions; the UI shows percent and percentage points. */
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : v * 100);

export function fmtWeight(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtSigned(v: number, digits = 2, unit = "%") {
  const n = v * 100;
  const s = n.toFixed(digits);
  return `${n > 0 && Number(s) !== 0 ? "+" : ""}${s}${unit}`;
}
