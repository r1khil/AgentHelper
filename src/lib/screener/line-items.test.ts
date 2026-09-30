import { describe, expect, it } from "vitest";
import type { CompanyFacts } from "@/lib/providers/edgar";
import { adjustForSplits, annualSeries, comparableShares, COVERAGE_ITEMS, deriveYear, LINE_ITEMS, lineItemCoverage, resolveFiscalYears, splitConcept, totalDebt, type FactLookup, type PeriodValue } from "./line-items";
import { blankYear } from "./test-fixtures";

const annual = (end: string, val: number, accn?: string): PeriodValue => ({ start: new Date(Date.parse(end) - 364 * 86_400_000).toISOString().slice(0, 10), end, val, ...(accn ? { accn } : {}) });
const instant = (end: string, val: number): PeriodValue => ({ end, val });
const lookupOf = (data: Record<string, PeriodValue[]>): FactLookup => (c) => data[c] ?? [];

describe("LINE_ITEMS", () => {
  it("has unique keys and several aliases for the spec's key lines", () => {
    const keys = LINE_ITEMS.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ["revenue", "netIncome", "cash", "capex", "interestExpense", "depreciation"]) expect(LINE_ITEMS.find((l) => l.key === k)!.concepts.length).toBeGreaterThan(1);
    // Debt: eight tags across its parts.
    const debtTags = new Set(LINE_ITEMS.filter((l) => l.key.startsWith("debt") || l.key === "shortTermBorrowings").flatMap((l) => [...l.concepts]));
    expect(debtTags.size).toBeGreaterThanOrEqual(8);
    expect(COVERAGE_ITEMS.length).toBe(28);
  });
  it("marks cover-page tags as dei", () => {
    expect(splitConcept("dei:EntityCommonStockSharesOutstanding")).toEqual({ taxonomy: "dei", concept: "EntityCommonStockSharesOutstanding" });
    expect(splitConcept("Assets")).toEqual({ taxonomy: "us-gaap", concept: "Assets" });
  });
});

describe("resolveFiscalYears", () => {
  it("takes the first alias that has a value for each year (tags switch over time)", () => {
    const years = resolveFiscalYears(
      lookupOf({
        SalesRevenueNet: [annual("2017-12-31", 800)],
        RevenueFromContractWithCustomerExcludingAssessedTax: [annual("2019-12-31", 1000, "a-2019"), annual("2018-12-31", 900)],
        OperatingIncomeLoss: [annual("2019-12-31", 100), annual("2018-12-31", 90), annual("2017-12-31", 80)],
      }),
    );
    expect(years.map((y) => [y.end, y.values.revenue, y.concepts.revenue])).toEqual([
      ["2019-12-31", 1000, "RevenueFromContractWithCustomerExcludingAssessedTax"],
      ["2018-12-31", 900, "RevenueFromContractWithCustomerExcludingAssessedTax"],
      ["2017-12-31", 800, "SalesRevenueNet"],
    ]);
    expect(years[0].accessions).toEqual(["a-2019"]);
  });
  it("treats year ends within ten days as one year (52/53-week calendars)", () => {
    const years = resolveFiscalYears(lookupOf({ Revenues: [annual("2025-09-27", 10)], NetIncomeLoss: [annual("2025-09-30", 1)] }));
    expect(years).toHaveLength(1);
  });
  it("picks the nearest instant inside the window and records its date", () => {
    const data = { Revenues: [annual("2025-06-30", 10)], Assets: [instant("2025-12-31", 99), instant("2025-06-30", 50)], AssetsCurrent: [instant("2025-12-31", 20)] };
    const tight = resolveFiscalYears(lookupOf(data));
    expect(tight[0].values.totalAssets).toBe(50);
    expect(tight[0].values.currentAssets).toBeUndefined();
    const wide = resolveFiscalYears(lookupOf(data), { instantWindowDays: 190 });
    expect(wide[0].values.currentAssets).toBe(20);
    expect(wide[0].bsEnd).toBe("2025-06-30");
  });
  it("ignores quarterly durations", () => {
    const years = resolveFiscalYears(lookupOf({ Revenues: [{ start: "2025-10-01", end: "2025-12-31", val: 5 }] }));
    expect(years).toEqual([]);
  });
});

describe("totalDebt", () => {
  it("adds short-term borrowings to LongTermDebt (which includes current maturities)", () => {
    expect(totalDebt({ debtLongTermTotal: 100, debtLongTermCurrent: 10, shortTermBorrowings: 5 })).toBe(105);
  });
  it("adds DebtCurrent to noncurrent debt without double-counting borrowings", () => {
    expect(totalDebt({ debtLongTermNoncurrent: 90, debtCurrentTotal: 15, shortTermBorrowings: 5 })).toBe(105);
  });
  it("adds the current portion and borrowings when DebtCurrent is absent", () => {
    expect(totalDebt({ debtLongTermNoncurrent: 90, debtLongTermCurrent: 10, shortTermBorrowings: 5 })).toBe(105);
  });
  it("reads only current debt", () => {
    expect(totalDebt({ shortTermBorrowings: 7 })).toBe(7);
  });
  it("reads no debt line as zero debt when there's a balance sheet, else null", () => {
    expect(totalDebt({ totalAssets: 1000 })).toBe(0);
    expect(totalDebt({})).toBeNull();
  });
});

describe("deriveYear", () => {
  it("backs out gross profit, EBIT and liabilities when untagged", () => {
    const d = deriveYear({ end: "2025-12-31", bsEnd: "2025-12-31", concepts: {}, accessions: [], values: { revenue: 100, costOfRevenue: 60, pretaxIncome: 20, interestExpense: 5, liabilitiesAndEquity: 500, equity: 200, debtLongTermTotal: 80, debtLongTermCurrent: 10 } });
    expect([d.grossProfit, d.ebit, d.totalLiabilities, d.longTermDebt, d.debt]).toEqual([40, 25, 300, 70, 80]);
  });
  it("labels where the share count came from", () => {
    const base = { end: "2025-12-31", bsEnd: null, accessions: [] };
    expect(deriveYear({ ...base, values: { shares: 10 }, concepts: { shares: "dei:EntityCommonStockSharesOutstanding" } }).sharesSource).toBe("dei");
    expect(deriveYear({ ...base, values: { shares: 10 }, concepts: { shares: "CommonStockSharesOutstanding" } }).sharesSource).toBe("balance");
    const d = deriveYear({ ...base, values: { dilutedShares: 11 }, concepts: {} });
    expect([d.shares, d.sharesSource, d.dilutedShares]).toEqual([11, "diluted", 11]);
  });
});

describe("adjustForSplits", () => {
  // NVIDIA-like: 10-for-1 in mid-2024; years reported only before it are a tenth of today's count.
  const ys = [
    blankYear("2026-01-25", { dilutedShares: 24.5e9, shares: 24.3e9, eps: 4.9 }),
    blankYear("2025-01-26", { dilutedShares: 24.8e9, shares: 24.4e9, eps: 2.94 }),
    blankYear("2024-01-28", { dilutedShares: 24.9e9, shares: 2.47e9, eps: 1.19 }),
    blankYear("2023-01-29", { dilutedShares: 2.507e9, shares: null, eps: 1.74 }),
  ];
  it("scales older years onto today's basis, each series on its own", () => {
    const out = adjustForSplits(ys, [10]);
    expect(out[2].shares).toBeCloseTo(24.7e9, -6);
    expect(out[2].dilutedShares).toBe(24.9e9);
    expect(out[3].dilutedShares).toBeCloseTo(25.07e9, -6);
    expect(out[3].eps).toBeCloseTo(0.174, 6);
    expect(out[3].splitFactor).toBe(10);
    expect(out[0]).toBe(ys[0]);
  });
  it("finds common splits without a split history, but never a 1.5× jump", () => {
    expect(adjustForSplits(ys)[3].dilutedShares).toBeCloseTo(25.07e9, -6);
    const merger = [blankYear("2025-12-31", { dilutedShares: 150 }), blankYear("2024-12-31", { dilutedShares: 100 })];
    expect(adjustForSplits(merger)[1].dilutedShares).toBe(100);
  });
  it("handles reverse splits", () => {
    const rev = [blankYear("2025-12-31", { dilutedShares: 10 }), blankYear("2024-12-31", { dilutedShares: 100, eps: -2 })];
    const out = adjustForSplits(rev);
    expect(out[1].dilutedShares).toBeCloseTo(10);
    expect(out[1].eps).toBeCloseTo(-20);
  });
});

describe("comparableShares", () => {
  it("prefers the diluted average, else same-source point counts", () => {
    expect(comparableShares(blankYear("a", { dilutedShares: 9, shares: 1, sharesSource: "dei" }), blankYear("b", { dilutedShares: 10, shares: 2, sharesSource: "balance" }))).toEqual([9, 10]);
    expect(comparableShares(blankYear("a", { shares: 1, sharesSource: "dei" }), blankYear("b", { shares: 2, sharesSource: "dei" }))).toEqual([1, 2]);
    expect(comparableShares(blankYear("a", { shares: 1, sharesSource: "dei" }), blankYear("b", { shares: 2, sharesSource: "balance" }))).toBeNull();
  });
});

describe("companyfacts", () => {
  const facts: CompanyFacts = {
    cik: 1,
    entityName: "Test",
    facts: {
      "us-gaap": {
        Revenues: { label: "", description: "", units: { USD: [
          { start: "2024-01-01", end: "2024-12-31", val: 100, accn: "old", fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-01" },
          { start: "2024-01-01", end: "2024-12-31", val: 101, accn: "restated", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" },
          { start: "2025-01-01", end: "2025-12-31", val: 120, accn: "new", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" },
          { start: "2025-10-01", end: "2025-12-31", val: 30, accn: "q", fy: 2025, fp: "Q4", form: "10-K", filed: "2026-02-01" },
        ] } },
        Assets: { label: "", description: "", units: { USD: [{ end: "2025-12-31", val: 500, accn: "new", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }] } },
      },
    },
  };
  it("reads annual figures, latest filing per period", () => {
    const s = annualSeries(facts);
    expect(s.map((y) => [y.end, y.revenue, y.totalAssets])).toEqual([["2025-12-31", 120, 500], ["2024-12-31", 101, null]]);
    expect(s[0].accessions).toEqual(["new"]);
  });
});

describe("lineItemCoverage", () => {
  it("counts companies whose latest year resolves each line, missing years included", () => {
    const cov = lineItemCoverage([blankYear("x", { revenue: 1, debt: 0 }), blankYear("y", { revenue: 2 }), null, blankYear("z")]);
    expect(cov.revenue).toBe(0.5);
    expect(cov.debt).toBe(0.25);
    expect(cov.inventory).toBe(0);
  });
});
