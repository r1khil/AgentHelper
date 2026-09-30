import { frameId, type FrameRequest, type FrameRow } from "@/lib/providers/edgar-frames";
import { LINE_ITEMS, resolveFiscalYears, splitConcept, type FactLookup, type PeriodValue } from "./line-items";

/*
 * Which frames a screen run downloads, and how the saved frames turn back into each company's fiscal years.
 *
 * SEC files a fiscal year under the calendar year it overlaps most, so a company's latest year is this calendar year
 * (a fiscal year that ended by mid-year) or last year. Durations therefore reach back seven calendar years for the
 * lines behind five-year figures, and three for the rest.
 *
 * Instants are the hard part: a frame "CY2025Q4I" holds each filer's balance nearest December 31, which for a
 * September or June year end is a 10-Q balance, not the 10-K one. So the two most recent calendar years are fetched
 * at every quarter end (each company's balance sheet then lands on its own year end), and older years at December
 * only, where a non-December company's balance sheet can sit up to six months from its year end. Each year records
 * the balance-sheet date it used.
 *
 * About 360 requests a run at the default settings, under the ~400 budget.
 */

/** How far from a fiscal year end a frames balance sheet may sit (older years only have December instants). */
export const FRAMES_INSTANT_WINDOW_DAYS = 190;
/** Fiscal years a company needs: the latest plus five before it. */
export const HISTORY_YEARS = 6;

const quarterEnd = (year: number, q: number) => `${year}-${["03-31", "06-30", "09-30", "12-31"][q - 1]}`;

/** The instant periods for each use: every ended quarter of this year and last, December of the older years. */
export function instantPeriods(today: string, use: "history" | "recent"): string[] {
  const cur = Number(today.slice(0, 4));
  const out: string[] = [];
  for (let q = 1; q <= 4; q++) if (quarterEnd(cur, q) < today) out.push(`CY${cur}Q${q}I`);
  for (let q = 1; q <= 4; q++) out.push(`CY${cur - 1}Q${q}I`);
  if (use === "history") for (let y = cur - 2; y >= cur - HISTORY_YEARS; y--) out.push(`CY${y}Q4I`);
  return out;
}

/** The duration periods for each use: this calendar year back seven (history) or three (recent). */
export function durationPeriods(today: string, use: "history" | "recent"): string[] {
  const cur = Number(today.slice(0, 4));
  const back = use === "history" ? HISTORY_YEARS : 2;
  const out: string[] = [];
  for (let y = cur; y >= cur - back; y--) out.push(`CY${y}`);
  return out;
}

/** Every frames request of a run, in a stable order (so a checkpoint's list of done ids stays meaningful). */
export function buildFramesPlan(today: string): FrameRequest[] {
  const out: FrameRequest[] = [];
  const seen = new Set<string>();
  for (const item of LINE_ITEMS) {
    if (item.frames === "none") continue;
    const aliases = item.concepts.slice(0, "framesAliases" in item ? item.framesAliases : item.concepts.length);
    const periods = item.kind === "duration" ? durationPeriods(today, item.frames) : instantPeriods(today, item.frames);
    for (const c of aliases) {
      const { taxonomy, concept } = splitConcept(c);
      for (const period of periods) {
        const req: FrameRequest = { taxonomy, concept, unit: item.unit, period };
        const id = frameId(req);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(req);
      }
    }
  }
  return out;
}

/** Concepts whose accession numbers are kept (the annual report behind a hit); every other saved row is CIK, value, end. */
const ACCESSION_CONCEPTS = new Set(["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "OperatingIncomeLoss", "NetIncomeLoss", "Assets"]);

/** A frame as saved in Storage: [cik, value, period end] rows, plus the accession for a few anchor concepts. */
export type SavedFrame = { id: string; period: string; rows: [number, number, string, string?][] };

export function compactFrame(req: FrameRequest, rows: FrameRow[], keep?: Set<number>): SavedFrame {
  const withAccn = ACCESSION_CONCEPTS.has(req.concept);
  const out: SavedFrame["rows"] = [];
  for (const r of rows) {
    if (keep && !keep.has(r.cik)) continue;
    out.push(withAccn ? [r.cik, r.val, r.end, r.accn] : [r.cik, r.val, r.end]);
  }
  return { id: frameId(req), period: req.period, rows: out };
}

/** Saved frames merged into one lookup per company: concept ("dei:X" or a bare us-gaap tag) → CIK → values. */
export type MergedFrames = Map<string, Map<number, PeriodValue[]>>;

export function mergeFrames(frames: SavedFrame[]): MergedFrames {
  const merged: MergedFrames = new Map();
  for (const f of frames) {
    const [taxonomy, concept] = f.id.split("/");
    const key = taxonomy === "dei" ? `dei:${concept}` : concept;
    const byCik = merged.get(key) ?? new Map<number, PeriodValue[]>();
    merged.set(key, byCik);
    const instant = f.period.endsWith("I");
    for (const [cik, val, end, accn] of f.rows) {
      // Annual frames hold full-year durations only; the start is implied a year before the end.
      const start = instant ? undefined : new Date(Date.parse(end) - 364 * 86_400_000).toISOString().slice(0, 10);
      const list = byCik.get(cik) ?? [];
      if (!list.some((v) => v.end === end && Boolean(v.start) === !instant)) list.push({ end, ...(start ? { start } : {}), val, ...(accn ? { accn } : {}) });
      byCik.set(cik, list);
    }
  }
  for (const byCik of merged.values()) for (const list of byCik.values()) list.sort((a, b) => (a.end < b.end ? 1 : -1));
  return merged;
}

export function framesLookup(merged: MergedFrames, cik: number): FactLookup {
  return (c: string) => merged.get(c)?.get(cik) ?? [];
}

/** One company's fiscal years from the merged frames, newest first. */
export function framesFiscalYears(merged: MergedFrames, cik: number) {
  return resolveFiscalYears(framesLookup(merged, cik), { instantWindowDays: FRAMES_INSTANT_WINDOW_DAYS, years: HISTORY_YEARS + 1 });
}
