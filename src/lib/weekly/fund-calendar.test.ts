import { describe, expect, it } from "vitest";
import { agendaLine } from "./format";
import { calendarEntries, calendarProcessUpdates, deckItems } from "./fund-calendar";

// "September 2026" and "October 2026" as exceljs read them from Fall 2026 Calendar.xlsx on 2026-09-27 (rows 9 to 12, and 3 to 4).
const cell = (col: string, r: number, v: string | number) => ({ ref: `${col}${r}`, col, row: r, v, isFormula: false });
const september = {
  name: "September 2026",
  rows: [
    { r: 9, cells: [cell("B", 9, 20), cell("C", 9, 21), cell("D", 9, 22), cell("E", 9, 23), cell("F", 9, 24), cell("G", 9, 25), cell("H", 9, 26)] },
    { r: 10, cells: [cell("C", 10, "Industrials Pitch\n\nDue: IT ICR"), cell("E", 10, "Industrials Follow Up\n\nDue: Healthcare Pre-Pitch"), cell("G", 10, "IT Pitch\n\nDue: C&C ICR")] },
    { r: 11, cells: [cell("B", 11, 27), cell("C", 11, 28), cell("D", 11, 29), cell("E", 11, 30)] },
    { r: 12, cells: [cell("C", 12, "IT Follow Up"), cell("E", 12, "C&C Pitch\n\nDue: FIG ICR")] },
  ],
};
const october = {
  name: "October 2026",
  rows: [
    { r: 3, cells: [cell("F", 3, 1), cell("G", 3, 2), cell("H", 3, 3)] },
    { r: 4, cells: [cell("G", 4, "Fall Wellness Day\nNo Class")] },
  ],
};

describe("the fund calendar", () => {
  it("reads each day's text from the month tabs", () => {
    const entries = calendarEntries([september, october, { name: "Presentation Order", rows: [] }]);
    expect(entries.map((e) => e.date)).toEqual(["2026-09-21", "2026-09-23", "2026-09-25", "2026-09-28", "2026-09-30", "2026-10-02"]);
  });

  it("writes the week of 2026-09-21 as the 21-Sep deck did", () => {
    const items = calendarProcessUpdates(calendarEntries([september]), { from: "2026-09-21", to: "2026-09-25" });
    // The deck left out Monday's Industrials Pitch; everything else matches it word for word.
    expect(agendaLine("Process Updates", items)).toBe(
      "Process Updates: Industrials Pitch, IT ICR Due (Monday), Industrials Follow-Up, Healthcare Pre-Pitch Due (Wednesday), IT Pitch, C&C ICR Due (Friday)",
    );
  });

  it("spans two month tabs for a week that crosses the month", () => {
    const items = calendarProcessUpdates(calendarEntries([september, october]), { from: "2026-09-28", to: "2026-10-02" });
    expect(agendaLine("Process Updates", items)).toBe("Process Updates: IT Follow-Up (Monday), C&C Pitch, FIG ICR Due (Wednesday), Fall Wellness Day, No Class (Friday)");
  });

  it("uses the deck's wording for sector updates, speakers and several deliverables", () => {
    expect(deckItems("Industrials & IT Sector Update Presentations\n\nDue: HC & Commodities Sector Updates")).toEqual(["Industrials and IT Sector Updates", "Healthcare and Commodities Sector Updates Due"]);
    expect(deckItems("C&C & FIG Sector Update Presentations\n\nDue: C&C Pre-Pitch")).toEqual(["C&C and FIG Sector Updates", "C&C Pre-Pitch Due"]);
    expect(deckItems("Speaker Meeting: Andrew Secundo \n\nDue: Industrials ICR")).toEqual(["Andrew Secundo Speaker", "Industrials ICR Due"]);
    expect(deckItems("Industrials Pitch\n\nDue: IT ICR, Healthcare Pre-Pitch")).toEqual(["Industrials Pitch", "IT ICR Due", "Healthcare Pre-Pitch Due"]);
  });

  it("skips a day number in the wrong weekday column", () => {
    // December's tab has a stray "1" under Saturday the 12th.
    const december = { name: "December 2026", rows: [{ r: 5, cells: [cell("H", 5, 1)] }, { r: 6, cells: [cell("H", 6, "Finals")] }] };
    expect(calendarEntries([december])).toEqual([]);
  });
});
