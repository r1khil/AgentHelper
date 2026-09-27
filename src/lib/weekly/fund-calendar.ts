import { DateTime } from "luxon";
import type { SheetInfo } from "@/lib/excel/read";
import type { AgendaItem } from "./types";
import { weekdayLabel } from "./weeks";

/**
 * The fund's semester calendar ("Fall 2026 Calendar.xlsx" in the app's Drive folder): one tab per month ("September 2026"),
 * Sunday to Saturday in columns B to H, and rows that alternate between day numbers and what happens that day, e.g.
 * "Industrials Follow Up\n\nDue: Healthcare Pre-Pitch". Pure, so the deck wording is tested against the real cells.
 */

export type CalendarEntry = { date: string; text: string };

const DAY_COLS = ["B", "C", "D", "E", "F", "G", "H"] as const;
const MONTH_TAB = /^\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s*$/i;

/** Every day's text in every month tab. A day number in the wrong weekday column (a typo in the sheet) is skipped. */
export function calendarEntries(sheets: Pick<SheetInfo, "name" | "rows">[]): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const sheet of sheets) {
    const m = sheet.name.match(MONTH_TAB);
    if (!m) continue;
    const month = DateTime.fromFormat(`${m[1]} ${m[2]}`, "LLLL yyyy");
    if (!month.isValid) continue;
    const byRow = new Map(sheet.rows.map((r) => [r.r, new Map(r.cells.map((c) => [c.col, c.v]))]));
    for (const [r, cells] of byRow) {
      const below = byRow.get(r + 1);
      DAY_COLS.forEach((col, i) => {
        const day = cells.get(col);
        if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31) return;
        const date = month.set({ day });
        // Luxon counts Monday as 1 and Sunday as 7; column B is Sunday.
        if (!date.isValid || date.month !== month.month || date.weekday % 7 !== i) return;
        const text = below?.get(col);
        if (typeof text === "string" && text.trim()) out.push({ date: date.toISODate()!, text });
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The calendar's shorthand as the deck writes it: "Follow-Up", "Sector Updates", "and", "Healthcare", "Jared Swansen Speaker". */
function deckWording(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Speaker Meeting:\s*(.+)$/i, "$1 Speaker")
    .replace(/\bFollow[ -]Up\b/gi, "Follow-Up")
    .replace(/\bSector Update Presentations\b/gi, "Sector Updates")
    .replace(/\bHC\b/g, "Healthcare")
    // "C&C" keeps its ampersand; a spaced one joins two names.
    .replace(/\s+&\s+/g, " and ");
}

/**
 * One calendar day as deck items. What happens that day comes first, then each item after "Due:" with "Due" added:
 * "IT Pitch\n\nDue: C&C ICR" is "IT Pitch", "C&C ICR Due", which the deck writes as "IT Pitch, C&C ICR Due (Friday)".
 */
export function deckItems(text: string): string[] {
  const [happening, due = ""] = text.split(/\bDue:\s*/i);
  const events = happening.split(/\n/).map(deckWording).filter(Boolean);
  const deliverables = due.split(/[,\n]/).map(deckWording).filter(Boolean).map((d) => `${d} Due`);
  return [...events, ...deliverables];
}

/** The calendar's items for a Monday-to-Friday, in date order, ready for the Process Updates line. */
export function calendarProcessUpdates(entries: CalendarEntry[], range: { from: string; to: string }): AgendaItem[] {
  return entries
    .filter((e) => e.date >= range.from && e.date <= range.to)
    .flatMap((e) => deckItems(e.text).map((text) => ({ day: weekdayLabel(e.date), text })));
}
