import { describe, expect, it } from "vitest";
import { PT_SHEET_TABS, type PtTabConfig } from "./config";
import { cleanLabel, colLetter, displayValue, parseTab, quoteTab, rangesFor, renderTab } from "./parse";

const cfg: PtTabConfig = { name: "Price Targets", headerRow: 1, required: ["Ticker", "Target Price", "Owl Fund Weights"], about: "Targets." };

describe("rangesFor", () => {
  it("requests only allowlisted tabs, whole tabs, and reports missing ones", () => {
    const { present, missing } = rangesFor(["Price Targets", "Credit Spreads", "Secret Tab", "Portfolio Data"]);
    expect(present.map((p) => p.range)).toEqual(["'Price Targets'", "'Portfolio Data'"]);
    expect(missing).toContain("Weightings");
    expect(missing).not.toContain("Credit Spreads");
  });

  it("never allowlists the tabs left out on purpose", () => {
    const names = PT_SHEET_TABS.map((t) => t.name);
    expect(names).not.toContain("Credit Spreads");
    expect(names).not.toContain("Sells/Unbought Pitches");
    expect(rangesFor(["Sells/Unbought Pitches"]).present).toEqual([]);
  });

  it("quotes tab names for A1 notation", () => {
    expect(quoteTab("Sells/Unbought Pitches")).toBe("'Sells/Unbought Pitches'");
    expect(quoteTab("Rikhil's tab")).toBe("'Rikhil''s tab'");
  });
});

describe("parseTab", () => {
  const shown = [
    ["", "Ticker", "Current Price", "Target Price", "% Off Target", "Owl Fund \nWeights"],
    [],
    ["x", "Consumer Discretionary"],
    ["", "AMZN", "$249.67", "$271.00", "(7.9%)", "3.30%"],
    ["", "XLY", "$110.56", "NA", "#N/A", "1.75%"],
  ];
  const raw = [
    ["", "Ticker", "Current Price", "Target Price", "% Off Target", "Owl Fund \nWeights"],
    [],
    ["x", "Consumer Discretionary"],
    ["", "AMZN", 249.67, 271, -0.079, 0.033],
    ["", "XLY", 110.56, "NA", "#N/A", 0.0175],
  ];

  it("labels cells by header, keeps raw numbers and the sheet's display", () => {
    const tab = parseTab(cfg, raw, shown, 1000);
    expect(tab.status).toBe("ok");
    expect(tab.columns.find((c) => c.col === "F")?.label).toBe("Owl Fund Weights");
    const amzn = tab.rows.find((r) => r.row === 4)!;
    const off = amzn.cells.find((c) => c.col === "E")!;
    expect(off).toMatchObject({ ref: "E4", label: "% Off Target", v: -0.079, text: "(7.9%)" });
    expect(displayValue(off)).toBe("-7.9%");
    expect(amzn.cells.find((c) => c.col === "B")).toMatchObject({ v: "AMZN" });
    expect(amzn.cells.find((c) => c.col === "B")?.text).toBeUndefined();
  });

  it("turns error cells into no value, never a number", () => {
    const tab = parseTab(cfg, raw, shown, 1000);
    const err = tab.rows.find((r) => r.row === 5)!.cells.find((c) => c.col === "E")!;
    expect(err.v).toBeNull();
    expect(err.error).toBe("#N/A");
    expect(tab.errorCells).toBe(1);
    expect(displayValue(err)).toBe("#N/A (error)");
  });

  it("skips empty rows and cells, and the header row itself", () => {
    const tab = parseTab(cfg, raw, shown, 1000);
    expect(tab.rows.map((r) => r.row)).toEqual([3, 4, 5]);
    expect(tab.rows[0].cells.map((c) => c.ref)).toEqual(["A3", "B3"]);
  });

  it("treats cells holding only spaces as empty", () => {
    const tab = parseTab(cfg, [...raw, ["", "  "]], [...shown, ["", "  "]], 1000);
    expect(tab.rows.map((r) => r.row)).toEqual([3, 4, 5]);
  });

  it("refuses a tab whose required labels are gone", () => {
    const moved = shown.map((r, i) => (i === 0 ? r.map((c) => (c === "Target Price" ? "PT" : c)) : r));
    const tab = parseTab(cfg, raw, moved, 1000);
    expect(tab.status).toBe("layout_changed");
    expect(tab.missingLabels).toEqual(["Target Price"]);
    expect(tab.rows).toEqual([]);
    expect(renderTab(tab)).toMatch(/layout changed.*Target Price/);
  });

  it("reads a header that sits below row 1", () => {
    const tab = parseTab({ ...cfg, headerRow: 2 }, [[], ...raw], [[], ...shown], 1000);
    expect(tab.status).toBe("ok");
    expect(tab.rows[0].row).toBe(4);
  });

  it("stops at the cell cap and says so", () => {
    const tab = parseTab(cfg, raw, shown, 4);
    expect(tab.truncated).toBe(true);
    expect(tab.rows.flatMap((r) => r.cells)).toHaveLength(4);
    expect(renderTab(tab)).toMatch(/cut short/);
  });

  it("renders rows with cell references", () => {
    const text = renderTab(parseTab(cfg, raw, shown, 1000));
    expect(text).toContain("Columns: B=Ticker, C=Current Price, D=Target Price, E=% Off Target, F=Owl Fund Weights");
    expect(text).toContain("r4: B=AMZN | C=$249.67 | D=$271.00 | E=-7.9% | F=3.30%");
  });
});

describe("helpers", () => {
  it("names columns past Z", () => {
    expect([0, 25, 26, 37, 701, 702].map(colLetter)).toEqual(["A", "Z", "AA", "AL", "ZZ", "AAA"]);
  });

  it("cleans header labels", () => {
    expect(cleanLabel("Total \nOW / UW ")).toBe("Total OW / UW");
  });
});
