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

/** True once every figure holds a number an exec actually entered. */
export function figuresComplete(f: WeeklyFigures): boolean {
  return [f.aumK, f.ytdPct, f.benchmarkYtdPct].every((v) => v.value !== null && v.source === "entered");
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
    const { value, source } = v as { value?: unknown; source?: unknown };
    base[key] = {
      value: typeof value === "number" && Number.isFinite(value) ? value : null,
      source: source === "carried" ? "carried" : "entered",
    };
  }
  return base;
}
