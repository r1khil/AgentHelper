/**
 * Engine values are fractions; the UI shows returns in percent and effects/contributions in basis points. These convert
 * units only: formatting is `fmtPct` / `fmtBp` / `fmtAccounting` from "@/lib/format".
 */
export function pct(v: number): number;
export function pct(v: number | null | undefined): number | null;
export function pct(v: number | null | undefined) {
  return v === null || v === undefined ? null : v * 100;
}
export function bps(v: number): number;
export function bps(v: number | null | undefined): number | null;
export function bps(v: number | null | undefined) {
  return v === null || v === undefined ? null : v * 10_000;
}
export const BPS_NOTE = "bp = basis points (100 bp = 1 percentage point)";

/** "up" / "down" / null for coloring a figure by its sign (at the precision shown). */
export function toneOf(v: number | null | undefined, scale = 10_000): "up" | "down" | null {
  if (v === null || v === undefined) return null;
  const n = Math.round(v * scale);
  return n > 0 ? "up" : n < 0 ? "down" : null;
}
