import { fixed } from "@/lib/format";

/** Engine values are fractions; the UI shows returns in percent and effects/contributions in basis points. */
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : v * 100);
export const bps = (v: number | null | undefined) => (v === null || v === undefined ? null : v * 10_000);
export const BPS_NOTE = "bps = basis points (100 bps = 1 percentage point)";

export function fmtWeight(v: number) {
  return `${fixed(v * 100, 1)}%`;
}

export function fmtBps(v: number, digits = 1) {
  const n = v * 10_000;
  const s = fixed(n, digits);
  return `${n > 0 && Number(s) !== 0 ? "+" : ""}${s} bps`;
}

export function fmtSigned(v: number, digits = 2, unit = "%") {
  const n = v * 100;
  const s = fixed(n, digits);
  return `${n > 0 && Number(s) !== 0 ? "+" : ""}${s}${unit}`;
}

/** Basis points without the unit, for inline hints like "Cash drag −68 · sectors +41". */
export function fmtBpsShort(v: number) {
  const n = v * 10_000;
  const s = fixed(n, 0);
  return `${n > 0 && Number(s) !== 0 ? "+" : ""}${s}`;
}

/** Signed basis points with the unit the redesign uses, e.g. "+61 bp"; "—" when there is no figure. */
export function fmtBp(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : `${fmtBpsShort(v)} bp`;
}

/** "up" / "down" / null for coloring a figure by its sign (at the precision shown). */
export function toneOf(v: number | null | undefined, scale = 10_000): "up" | "down" | null {
  if (v === null || v === undefined) return null;
  const n = Math.round(v * scale);
  return n > 0 ? "up" : n < 0 ? "down" : null;
}
