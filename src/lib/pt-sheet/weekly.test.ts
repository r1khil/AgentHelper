import { describe, expect, it } from "vitest";
import { PT_SHEET_TABS } from "./config";
import { parseTab } from "./parse";
import { PRICE_TARGETS_TAB, WEEKLY_TAB, earningsFromSheet, weeklyFiguresFromSheet, weeklyMovesFromSheet } from "./weekly";

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

// Price Targets as the Sheets API returned it on 2026-09-27: a sector header row (col A "x"), then holdings. Col H has no label.
const ptHeader = ["", "Ticker", "Current Price", "Cost Basis", "Target Price", "% Off Target", "% Return", "", "% 1 Week", "", "Mkt Cap ($B)", "Stock Beta", "Initial Purchase Date", "52-Wk High", "% Off High", "52-Wk Low", "% Off Low", "Earnings Date", "Status", "After/Before"];
const ptRow = (ticker: string, week: number | string, earnings = "-", status = "-", timing = "-") => ["", ticker, 100, 90, 120, -0.1, 0.1, 7, week, 0, 10, 1, "1/1/2025", 1, 1, 1, 1, earnings, status, timing];
const ptRaw = [
  ptHeader,
  [],
  ["x", "Consumer Discretionary"],
  ptRow("XLY", -0.01488015682081445),
  ptRow("AMZN", -0.033971754691429656, "10/29/2026", "Expected", "After"),
  [],
  ["x", "Information Technology"],
  ptRow("AVGO", 0.044, "10/1/2026", "Confirmed", "Before"),
  ptRow("BATS:DRAM", 0.02, "9/30/2026"),
  ptRow("AMZN", -0.033971754691429656, "10/29/2026", "Expected", "After"),
  ptRow("SOXX", "#N/A"),
  ptRow("XLK", 0, "-"),
  ptRow("MSFT", 0.029, "10/1/26", "Expected", "After Close"),
];
const ptCfg = PT_SHEET_TABS.find((t) => t.name === PRICE_TARGETS_TAB)!;
const ptTab = (rows: unknown[][] = ptRaw) => parseTab(ptCfg, rows, rows, 1000);

describe("weeklyMovesFromSheet", () => {
  it("leaves out rows Portfolio Data holds no shares of, such as a benchmark", () => {
    const pdCfg = PT_SHEET_TABS.find((t) => t.name === "Portfolio Data")!;
    const pdRows = [["", "Ticker", "Quantity", "Current Price", "Total Position", "Owl Fund Weights", "S&P Weights"], ["", "AVGO", 656], ["", "SPY", 0], ["", "BATS:DRAM", 10]];
    const withSpy = [...ptRaw, ptRow("SPY", 0.01)];
    const { rows, blank } = weeklyMovesFromSheet([ptTab(withSpy), parseTab(pdCfg, pdRows, pdRows, 1000)]);
    expect(rows.map((r) => r.ticker)).toEqual(["AVGO", "DRAM"]);
    expect(blank).toEqual([]);
  });


  it("reads each holding's % 1 Week once, in percent, and lists rows with no value (an error or a flat 0) as blank", () => {
    const { rows, blank, problem } = weeklyMovesFromSheet([ptTab()]);
    expect(problem).toBeNull();
    expect(rows.map((r) => [r.ticker, r.pct])).toEqual([
      ["XLY", -1.488],
      ["AMZN", -3.3972],
      ["AVGO", 4.4],
      ["DRAM", 2],
      ["MSFT", 2.9],
    ]);
    expect(blank).toEqual(["SOXX", "XLK"]);
    expect(rows[0].ref).toBe("I4");
  });

  it("says so when the tab is missing", () => {
    expect(weeklyMovesFromSheet([]).problem).toMatch(/was not read/);
  });
});

describe("earningsFromSheet", () => {
  it("keeps holdings reporting in the week, reads two-digit years, and lists every holding the sheet dates", () => {
    const { rows, dated } = earningsFromSheet([ptTab()], "2026-09-28", "2026-10-02");
    expect(rows).toEqual([
      { ticker: "DRAM", date: "2026-09-30", status: null, timing: null },
      { ticker: "AVGO", date: "2026-10-01", status: "Confirmed", timing: "Before" },
      { ticker: "MSFT", date: "2026-10-01", status: "Expected", timing: "After Close" },
    ]);
    expect(dated).toEqual(["AMZN", "AVGO", "DRAM", "MSFT"]);
  });
});

describe("the relative return", () => {
  it("is read when the tab has it, without making it required", () => {
    expect(weeklyFiguresFromSheet([tab()]).relativePct).toEqual({ value: -6.56, ref: "G10" });
    expect(weeklyFiguresFromSheet([tab(raw.slice(0, 8))]).relativePct).toBeNull();
    expect(weeklyFiguresFromSheet([tab(raw.slice(0, 8))]).problems).toEqual([]);
  });
});
