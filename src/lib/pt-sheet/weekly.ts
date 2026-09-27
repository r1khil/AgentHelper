import type { PtCell, PtTab } from "./parse";

/**
 * The Weekly update's three headline figures, as the execs keep them in the sheet's "2025 Time-Weighted Returns" tab:
 * the latest fund value (AUM), "Owl Fund YTD Performance:" and "SPX YTD Performance:". Pure, so it can be tested
 * against the tab's real layout.
 */

export const WEEKLY_TAB = "2025 Time-Weighted Returns";

export type SheetFigure = { value: number; ref: string };

export type SheetWeeklyFigures = {
  aumK: SheetFigure | null;
  ytdPct: SheetFigure | null;
  benchmarkYtdPct: SheetFigure | null;
  /** The sheet's own label for the benchmark figure, so the page can show what it calls it. */
  benchmarkLabel: string | null;
  problems: string[];
};

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/:$/, "").trim().toLowerCase();
const isNum = (c: PtCell | undefined): c is PtCell & { v: number } => typeof c?.v === "number" && Number.isFinite(c.v);
/** Percent cells come back as fractions (6.34% is 0.0634). */
const pct = (v: number) => Math.round(v * 1e6) / 1e4;

/** The first number to the right of a cell whose text is `label` (the tab writes "Label:" then the value a few columns over). */
function valueAfterLabel(tab: PtTab, label: string): { cell: PtCell & { v: number }; label: string } | null {
  for (const row of tab.rows) {
    const i = row.cells.findIndex((c) => typeof c.v === "string" && norm(c.v) === norm(label));
    if (i < 0) continue;
    const cell = row.cells.slice(i + 1).find(isNum);
    if (cell) return { cell, label: String(row.cells[i].v).replace(/:$/, "").trim() };
  }
  return null;
}

export function weeklyFiguresFromSheet(tabs: PtTab[]): SheetWeeklyFigures {
  const out: SheetWeeklyFigures = { aumK: null, ytdPct: null, benchmarkYtdPct: null, benchmarkLabel: null, problems: [] };
  const tab = tabs.find((t) => t.name === WEEKLY_TAB);
  if (!tab) {
    out.problems.push(`The "${WEEKLY_TAB}" tab was not read.`);
    return out;
  }
  if (tab.status !== "ok") {
    out.problems.push(`The "${WEEKLY_TAB}" tab's layout changed.`);
    return out;
  }

  const ytd = valueAfterLabel(tab, "Owl Fund YTD Performance");
  if (ytd) out.ytdPct = { value: pct(ytd.cell.v), ref: ytd.cell.ref };
  else out.problems.push('No "Owl Fund YTD Performance" figure.');

  const bench = valueAfterLabel(tab, "SPX YTD Performance");
  if (bench) {
    out.benchmarkYtdPct = { value: pct(bench.cell.v), ref: bench.cell.ref };
    out.benchmarkLabel = bench.label;
  } else out.problems.push('No "SPX YTD Performance" figure.');

  // The latest dated period: its value after any AUM infusion, else its ending value before one.
  const byLabel = (row: PtTab["rows"][number], label: string) => row.cells.find((c) => c.label && norm(c.label) === norm(label));
  const periods = tab.rows.filter((r) => {
    const d = byLabel(r, "Date");
    return typeof d?.v === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d.v.trim());
  });
  const last = periods.at(-1);
  const after = last && byLabel(last, "Value After AUM Infusion");
  const ending = last && byLabel(last, "Ending Portfolio Value Before AUM Infusion");
  const aum = isNum(after) ? after : isNum(ending) ? ending : null;
  if (aum) out.aumK = { value: Math.round(aum.v / 10) / 100, ref: aum.ref };
  else out.problems.push("No dated fund value to take AUM from.");

  return out;
}
