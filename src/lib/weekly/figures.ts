import { emptyFigures, type FigureValue, type WeeklyFigures } from "./types";

/**
 * Accepts whatever an exec pastes out of the price target sheet: "4646.9", "$4,646.9k",
 * "6.8%", "(5.7%)", "-5.7". Anything that is not a number returns undefined, so the caller can
 * tell "left blank" (null) from "typed something unusable" (undefined).
 */
export function parseFigureInput(raw: string | null | undefined): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const body = trimmed
    .replace(/^\(|\)$/g, "")
    .replace(/[$,%\s]/g, "")
    .replace(/[kK]$/, "");
  if (!/^[+-]?\d*\.?\d+$/.test(body)) return undefined;
  const n = Number(body);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -Math.abs(n) : n;
}

/** The deck's relative return: the fund's YTD less the benchmark's. */
export function deriveRelative(ytd: number | null | undefined, benchmark: number | null | undefined): number | null {
  if (ytd === null || ytd === undefined || benchmark === null || benchmark === undefined) return null;
  if (!Number.isFinite(ytd) || !Number.isFinite(benchmark)) return null;
  return Math.round((ytd - benchmark) * 1e6) / 1e6;
}

const carry = (v: FigureValue | undefined): FigureValue =>
  v && v.value !== null && v.value !== undefined ? { value: v.value, source: "carried" } : { value: null, source: "entered" };

/**
 * Last week's numbers become this week's placeholders, flagged so the page can say "carried from
 * last week" until an exec saves them.
 */
export function carryForward(prev: WeeklyFigures | null | undefined): WeeklyFigures {
  if (!prev) return emptyFigures();
  return { aumK: carry(prev.aumK), ytdPct: carry(prev.ytdPct), benchmarkYtdPct: carry(prev.benchmarkYtdPct) };
}

/** True once every figure holds a number an exec entered or the app read from the sheet (nothing carried). */
export function figuresComplete(f: WeeklyFigures): boolean {
  return [f.aumK, f.ytdPct, f.benchmarkYtdPct].every((v) => v.value !== null && v.source !== "carried");
}

/**
 * Merge a fresh sheet read into the pack's figures: an exec's own entry always wins, then the sheet, then whatever
 * was there (a carried placeholder). `force` (an exec pressed "Refresh from PT sheet") lets the sheet replace entries too.
 */
export function withSheetFigures(
  current: WeeklyFigures,
  sheet: Partial<Record<keyof WeeklyFigures, { value: number; ref: string } | null>>,
  asOf: string,
  opts: { force?: boolean } = {},
): WeeklyFigures {
  const next = { ...current };
  for (const key of Object.keys(current) as (keyof WeeklyFigures)[]) {
    const s = sheet[key];
    if (!s) continue;
    if (!opts.force && current[key].source === "entered" && current[key].value !== null) continue;
    next[key] = { value: s.value, source: "sheet", ref: s.ref, asOf };
  }
  return next;
}

/** Figures still showing last week's numbers, for the page's warning. */
export function carriedFigureKeys(f: WeeklyFigures): string[] {
  const labels: Record<keyof WeeklyFigures, string> = { aumK: "AUM", ytdPct: "YTD return", benchmarkYtdPct: "SPXTR YTD" };
  return (Object.keys(labels) as (keyof WeeklyFigures)[]).filter((k) => f[k]?.source === "carried" && f[k]?.value !== null).map((k) => labels[k]);
}

/** Read a figures blob that may predate a field, without trusting its shape. */
export function normalizeFigures(raw: unknown): WeeklyFigures {
  const base = emptyFigures();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<Record<keyof WeeklyFigures, unknown>>;
  for (const key of Object.keys(base) as (keyof WeeklyFigures)[]) {
    const v = src[key];
    if (!v || typeof v !== "object") continue;
    const { value, source, ref, asOf } = v as { value?: unknown; source?: unknown; ref?: unknown; asOf?: unknown };
    base[key] = {
      value: typeof value === "number" && Number.isFinite(value) ? value : null,
      source: source === "carried" ? "carried" : source === "sheet" ? "sheet" : "entered",
      ...(source === "sheet" && typeof ref === "string" ? { ref } : {}),
      ...(source === "sheet" && typeof asOf === "string" ? { asOf } : {}),
    };
  }
  return base;
}
