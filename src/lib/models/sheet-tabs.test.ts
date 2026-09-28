import { describe, expect, it } from "vitest";
import { defaultSheetIndex, primarySheetRank, rankSheets, splitSheetTabs } from "./sheet-tabs";

// The sheet list of the fund's largest model (20 sheets), as the app stored it.
const BIG = ["Intro", "Cover", "Summary", "Model Output", "Football Field", "Integrity", "Revenue Build", "Model", "Segment Analysis", "Drivers", "Comparables", "CIQ ID Locater", "WACC", "Valuation", "Multiples Data", "Charts", "Benchmark", "Pre-Earnings", "Post-Earnings", "Mapping Audit"];
const none = () => 0;
const names = (idx: number[], list = BIG) => idx.map((i) => list[i]);

describe("primarySheetRank", () => {
  it("knows the primary sheets and ranks them DCF, Model, Summary, statements, Valuation, Assumptions", () => {
    const order = ["DCF", "Model", "Summary", "IS", "BS", "CF", "Valuation", "Assumptions"].map(primarySheetRank);
    expect(order.every((r) => r !== null)).toBe(true);
    expect([...order].sort((a, b) => a! - b!)).toEqual(order);
  });

  it("prefers an exact name to one that contains it, and matches whole words only", () => {
    expect(primarySheetRank("Model")!).toBeLessThan(primarySheetRank("Model Output")!);
    expect(primarySheetRank("Income Statement")).not.toBeNull();
    expect(primarySheetRank("Cash Flow Statement")).not.toBeNull();
    expect(primarySheetRank("P&L")).not.toBeNull();
    expect(primarySheetRank("dcf")).toBe(0);
    expect(primarySheetRank("Charts")).toBeNull();
    expect(primarySheetRank("Remodeling")).toBeNull();
    expect(primarySheetRank("Basis")).toBeNull();
    expect(primarySheetRank("Comparables")).toBeNull();
  });
});

describe("rankSheets", () => {
  it("puts sheets with mapped line items first, most mappings first, then primary sheets, then workbook order", () => {
    const counts: Record<string, number> = { Charts: 1, "Revenue Build": 3 };
    const ranked = names(rankSheets(BIG, (n) => counts[n] ?? 0));
    expect(ranked.slice(0, 6)).toEqual(["Revenue Build", "Charts", "Model", "Model Output", "Summary", "Valuation"]);
    expect(ranked.at(-1)).toBe("Mapping Audit");
    expect(ranked).toHaveLength(BIG.length);
  });
});

describe("defaultSheetIndex", () => {
  it("opens the most important sheet, not the cover", () => {
    expect(BIG[defaultSheetIndex(BIG, none)]).toBe("Model");
    expect(BIG[defaultSheetIndex(BIG, (n) => (n === "WACC" ? 2 : 0))]).toBe("WACC");
    expect(defaultSheetIndex([], none)).toBe(0);
    expect(defaultSheetIndex(["Sheet1", "Sheet2"], none)).toBe(0);
  });
});

describe("splitSheetTabs", () => {
  it("shows four sheets that matter as tabs, in workbook order, and the rest in the menu", () => {
    const { tabs, more } = splitSheetTabs(BIG, none, 7);
    expect(names(tabs)).toEqual(["Summary", "Model Output", "Model", "Valuation"]);
    expect(more).toHaveLength(16);
    expect(names(more).slice(0, 3)).toEqual(["Intro", "Cover", "Football Field"]);
    expect([...tabs, ...more].sort((a, b) => a - b)).toEqual(BIG.map((_, i) => i));
  });

  it("gives a sheet chosen from the menu a tab of its own, in its workbook place", () => {
    const { tabs, more } = splitSheetTabs(BIG, none, BIG.indexOf("Charts"));
    expect(names(tabs)).toEqual(["Summary", "Model Output", "Model", "Valuation", "Charts"]);
    expect(more).not.toContain(BIG.indexOf("Charts"));
    expect(more).toHaveLength(15);
  });

  it("keeps mapped sheets among the tabs", () => {
    const { tabs } = splitSheetTabs(BIG, (n) => (n === "Pre-Earnings" ? 4 : 0), 7);
    expect(names(tabs)).toEqual(["Summary", "Model Output", "Model", "Pre-Earnings"]);
  });

  it("shows every sheet when a menu would hold one or none", () => {
    const five = ["Cover", "IS", "BS", "CF", "Notes"];
    expect(splitSheetTabs(five, none, 0)).toEqual({ tabs: [0, 1, 2, 3, 4], more: [] });
    expect(splitSheetTabs(["Sheet1"], none, 0)).toEqual({ tabs: [0], more: [] });
    const six = [...five, "Charts"];
    expect(splitSheetTabs(six, none, 1).more).toHaveLength(2);
  });

  it("fills unused slots in workbook order when few sheets are recognisable", () => {
    const plain = ["Sheet1", "Sheet2", "Sheet3", "Sheet4", "Sheet5", "Sheet6", "Sheet7"];
    expect(splitSheetTabs(plain, none, 0)).toEqual({ tabs: [0, 1, 2, 3], more: [4, 5, 6] });
    expect(splitSheetTabs(plain, none, 6)).toEqual({ tabs: [0, 1, 2, 3, 6], more: [4, 5] });
  });
});
