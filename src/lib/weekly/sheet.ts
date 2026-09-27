import "server-only";
import { ptSheetConfigured, readPtSheet } from "@/lib/pt-sheet/read";
import { weeklyFiguresFromSheet, type SheetWeeklyFigures } from "@/lib/pt-sheet/weekly";

export type SheetFiguresRead = SheetWeeklyFigures & { asOf: string };

/** A fresh read of the Weekly's three figures from the price target sheet, or null when Drive isn't set up here. */
export async function readSheetWeeklyFigures(): Promise<SheetFiguresRead | null> {
  if (!ptSheetConfigured()) return null;
  const sheet = await readPtSheet({ fresh: true });
  return { ...weeklyFiguresFromSheet(sheet.tabs), asOf: sheet.modifiedTime };
}

/** "3 figures from the PT sheet (edited …)" or what went wrong, for the pack's step log. */
export function sheetReadDetail(r: SheetFiguresRead): string {
  const n = [r.aumK, r.ytdPct, r.benchmarkYtdPct].filter(Boolean).length;
  return `${n} of 3 figures read${r.problems.length ? `; ${r.problems.join(" ")}` : ""}`;
}
