import { describe, expect, it } from "vitest";
import { PT_SHEET_TABS } from "./config";
import { parseTab } from "./parse";
import { compareWithLedger, POSITIONS_TAB, recordedShares, sheetQuantities, tickerKey } from "./reconcile";

// The Portfolio Data tab's shape: sector header rows, holdings, cash and totals rows.
const header = ["", "Ticker", "Quantity", "Current Price", "Total Position", "Owl Fund \nWeights", "S&P Weights"];
const rows = [
  header,
  [],
  ["x", "Consumer Discretionary", "", "", 241485.36, 0.0505, 0.0922],
  ["", "XLY", 757, 110.56, 83693.92, 0.0175],
  ["", "AMZN", 632, 249.67, 157791.44, 0.033],
  ["", "AVGO", 656, 300, 196800, 0.04],
  ["", "BRK.B", 100, 500, 50000, 0.01],
  ["", "SPY", 0, 650, 0, 0],
  ["", "BATS:DRAM", 1702, 61.91, 105370.82, 0.022],
  ["", "Cash", "", "", 109799.22, 0.023],
  ["", "TOTALS:", "", "", 4784010.26, 0.979],
];
const cfg = PT_SHEET_TABS.find((t) => t.name === POSITIONS_TAB)!;
const tab = parseTab(cfg, rows, rows, 1000);

describe("sheetQuantities", () => {
  it("takes holdings with a quantity and skips sector, cash and total rows", () => {
    const { rows: q, problem } = sheetQuantities([tab]);
    expect(problem).toBeNull();
    expect(q).toEqual([
      { ticker: "XLY", qty: 757, ref: "C4" },
      { ticker: "AMZN", qty: 632, ref: "C5" },
      { ticker: "AVGO", qty: 656, ref: "C6" },
      { ticker: "BRK.B", qty: 100, ref: "C7" },
      { ticker: "BATS:DRAM", qty: 1702, ref: "C9" },
    ]);
  });

  it("skips zero-quantity placeholder rows", () => {
    expect(sheetQuantities([tab]).rows.map((r) => r.ticker)).not.toContain("SPY");
  });

  it("reports a missing tab", () => {
    expect(sheetQuantities([]).problem).toMatch(/was not read/);
  });
});

describe("compareWithLedger", () => {
  const sheet = sheetQuantities([tab]).rows;

  it("flags whole-share gaps, one-sided holdings and dividend fractions, worst first", () => {
    const out = compareWithLedger(sheet, [
      { ticker: "XLY", shares: 757 },
      { ticker: "AMZN", shares: 632.4172 },
      { ticker: "AVGO", shares: 631 },
      { ticker: "BRK-B", shares: 100 },
      { ticker: "DRAM", shares: 1702 },
      { ticker: "KRE", shares: 1245 },
    ]);
    expect(out.map((r) => [r.ticker, r.status, r.diff])).toEqual([
      ["AVGO", "mismatch", 25],
      ["KRE", "ledger_only", -1245],
      ["AMZN", "fractional", -0.4172],
      ["BRK-B", "match", 0],
      ["DRAM", "match", 0],
      ["XLY", "match", 0],
    ]);
    expect(out[0].ref).toBe("C6");
  });

  it("lists a holding only the sheet has", () => {
    expect(compareWithLedger([{ ticker: "NEW", qty: 10, ref: "C9" }], [])).toEqual([{ ticker: "NEW", sheet: 10, ledger: null, diff: 10, status: "sheet_only", ref: "C9" }]);
  });

  it("nets recorded trades and ignores voided ones", () => {
    expect(
      recordedShares([
        { ticker: "KRE", side: "buy", shares: "2094" },
        { ticker: "KRE", side: "sell", shares: "849" },
        { ticker: "KRE", side: "sell", shares: "850", voidedAt: new Date() },
        { ticker: "XLP", side: "buy", shares: 2246 },
        { ticker: "XLP", side: "sell", shares: 2260.83 },
      ]),
    ).toEqual([{ ticker: "KRE", shares: 1245 }]);
  });

  it("matches BRK.B to BRK-B", () => {
    expect(tickerKey("brk.b")).toBe("BRK-B");
    expect(tickerKey("BATS:DRAM")).toBe("DRAM");
  });
});
