import { describe, expect, it } from "vitest";
import { PT_SHEET_TABS } from "./config";
import { parseTab } from "./parse";
import { WEEKLY_TAB, weeklyFiguresFromSheet } from "./weekly";

// The tab as the Sheets API returned it on 2026-09-26 (raw values; percents are fractions).
const header = ["", "Date", "Beginning Value", "Ending Portfolio Value Before AUM Infusion", "Index", "True Ticker", "AUM Infusion", "Value After AUM Infusion", "Holding Period Return (HPR)", "HPR + 1"];
const raw = [
  header,
  ["", "1/2/2025", 2970530, 3333691.55, "", "", 1000000, 4333691.55, 0.1223, 1.12],
  ["", "9/26/2026", 4333691.55, 4674211.03, "", "", "", "", 0.0786, 1.08],
  [],
  [],
  ["", "", "", "Owl Fund YTD Performance:", "", "", 0.0634],
  [],
  ["", "", "", "SPX YTD Performance:", "", "", 0.129],
  [],
  ["", "", "", "Owl Fund Relative Performance:", "", "", -0.0656],
];
const cfg = PT_SHEET_TABS.find((t) => t.name === WEEKLY_TAB)!;
const tab = (rows: unknown[][] = raw) => parseTab(cfg, rows, rows, 1000);

describe("weeklyFiguresFromSheet", () => {
  it("reads AUM, fund YTD and the benchmark YTD from the tab's real layout", () => {
    const f = weeklyFiguresFromSheet([tab()]);
    expect(f.problems).toEqual([]);
    expect(f.ytdPct).toEqual({ value: 6.34, ref: "G6" });
    expect(f.benchmarkYtdPct).toEqual({ value: 12.9, ref: "G8" });
    expect(f.benchmarkLabel).toBe("SPX YTD Performance");
    expect(f.aumK).toEqual({ value: 4674.21, ref: "D3" });
  });

  it("uses the value after an AUM infusion when the latest period had one", () => {
    const rows = raw.map((r, i) => (i === 2 ? ["", "9/26/2026", 4333691.55, 4674211.03, "", "", 250000, 4924211.03, 0.0786, 1.08] : r));
    expect(weeklyFiguresFromSheet([tab(rows)]).aumK).toEqual({ value: 4924.21, ref: "H3" });
  });

  it("says what is missing instead of guessing", () => {
    const rows = raw.filter((_, i) => i !== 7);
    const f = weeklyFiguresFromSheet([tab(rows)]);
    expect(f.benchmarkYtdPct).toBeNull();
    expect(f.problems).toEqual(['No "SPX YTD Performance" figure.']);
    expect(weeklyFiguresFromSheet([]).problems[0]).toMatch(/was not read/);
  });

  it("refuses a tab whose layout changed", () => {
    const moved = [header.map((h) => (h === "Beginning Value" ? "Start" : h)), ...raw.slice(1)];
    expect(weeklyFiguresFromSheet([tab(moved)]).problems[0]).toMatch(/layout changed/);
  });
});
