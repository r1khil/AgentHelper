import "server-only";
import { ptSheetConfigured, readPtSheet } from "@/lib/pt-sheet/read";
import { earningsFromSheet, weeklyFiguresFromSheet, weeklyMovesFromSheet, type SheetEarnings, type SheetMove, type SheetWeeklyFigures } from "@/lib/pt-sheet/weekly";

export type SheetFiguresRead = SheetWeeklyFigures & { asOf: string };

/** Everything the Sunday build takes from one read of the sheet. */
export type SheetWeeklyRead = {
  figures: SheetFiguresRead;
  moves: { rows: SheetMove[]; blank: string[]; problem: string | null };
  earnings: { rows: SheetEarnings[]; dated: string[]; problem: string | null };
  /** When the app read the sheet: "% 1 Week" is live, so this is what it measured up to. */
  readAt: string;
};

/** A fresh read of the Weekly's three figures from the price target sheet, or null when Drive isn't set up here. */
export async function readSheetWeeklyFigures(): Promise<SheetFiguresRead | null> {
  if (!ptSheetConfigured()) return null;
  const sheet = await readPtSheet({ fresh: true });
  return { ...weeklyFiguresFromSheet(sheet.tabs), asOf: sheet.modifiedTime };
}

/** The figures, each holding's "% 1 Week" and the reports due in `agenda` (the coming Monday to Friday), from one fresh read. */
export async function readSheetWeekly(agenda: { from: string; to: string }): Promise<SheetWeeklyRead | null> {
  if (!ptSheetConfigured()) return null;
  const sheet = await readPtSheet({ fresh: true });
  return {
    figures: { ...weeklyFiguresFromSheet(sheet.tabs), asOf: sheet.modifiedTime },
    moves: weeklyMovesFromSheet(sheet.tabs),
    earnings: earningsFromSheet(sheet.tabs, agenda.from, agenda.to),
    readAt: sheet.fetchedAt,
  };
}

/** "3 figures from the PT sheet (edited …)" or what went wrong, for the pack's step log. */
export function sheetReadDetail(r: SheetFiguresRead): string {
  const n = [r.aumK, r.ytdPct, r.benchmarkYtdPct].filter(Boolean).length;
  return `${n} of 3 figures read${r.problems.length ? `; ${r.problems.join(" ")}` : ""}`;
}
