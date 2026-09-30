import { describe, expect, it } from "vitest";
import { frameId } from "@/lib/providers/edgar-frames";
import { buildFramesPlan, compactFrame, durationPeriods, framesFiscalYears, instantPeriods, mergeFrames } from "./frames-plan";

describe("buildFramesPlan", () => {
  const plan = buildFramesPlan("2026-09-29");
  it("stays under the ~400-request budget with unique requests", () => {
    expect(plan.length).toBeLessThanOrEqual(400);
    expect(plan.length).toBeGreaterThan(300);
    expect(new Set(plan.map(frameId)).size).toBe(plan.length);
  });
  it("reaches back seven calendar years for five-year lines", () => {
    const ebit = plan.filter((r) => r.concept === "OperatingIncomeLoss").map((r) => r.period);
    expect(ebit).toEqual(["CY2026", "CY2025", "CY2024", "CY2023", "CY2022", "CY2021", "CY2020"]);
    expect(plan.filter((r) => r.concept === "GrossProfit").map((r) => r.period)).toEqual(["CY2026", "CY2025", "CY2024"]);
  });
  it("fetches every ended quarter of this year and last for instants, December before that", () => {
    expect(instantPeriods("2026-09-29", "history")).toEqual(["CY2026Q1I", "CY2026Q2I", "CY2025Q1I", "CY2025Q2I", "CY2025Q3I", "CY2025Q4I", "CY2024Q4I", "CY2023Q4I", "CY2022Q4I", "CY2021Q4I", "CY2020Q4I"]);
    expect(instantPeriods("2026-10-01", "recent")).toContain("CY2026Q3I");
    expect(durationPeriods("2026-01-10", "recent")).toEqual(["CY2026", "CY2025", "CY2024"]);
  });
  it("includes the cover-page share count and EPS in its own unit", () => {
    expect(plan.some((r) => r.taxonomy === "dei" && r.concept === "EntityCommonStockSharesOutstanding")).toBe(true);
    expect(plan.find((r) => r.concept === "EarningsPerShareDiluted")!.unit).toBe("USD/shares");
  });
});

describe("compact, merge and resolve", () => {
  const rev25 = compactFrame({ taxonomy: "us-gaap", concept: "Revenues", unit: "USD", period: "CY2025" }, [
    { cik: 1, val: 1000, end: "2025-06-30", start: "2024-07-01", accn: "acc-25" },
    { cik: 2, val: 5, end: "2025-12-31", start: "2025-01-01", accn: "x" },
  ], new Set([1]));
  const rev24 = compactFrame({ taxonomy: "us-gaap", concept: "Revenues", unit: "USD", period: "CY2024" }, [{ cik: 1, val: 900, end: "2024-06-30", start: "2023-07-01", accn: "acc-24" }]);
  const cash = (period: string, end: string, val: number) => compactFrame({ taxonomy: "us-gaap", concept: "CashAndCashEquivalentsAtCarryingValue", unit: "USD", period }, [{ cik: 1, val, end, accn: "c" }]);
  const shares = compactFrame({ taxonomy: "dei", concept: "EntityCommonStockSharesOutstanding", unit: "shares", period: "CY2025Q3I" }, [{ cik: 1, val: 77, end: "2025-08-15", accn: "d" }]);

  it("keeps only the universe's CIKs, and accessions only for anchor concepts", () => {
    expect(rev25.rows).toEqual([[1, 1000, "2025-06-30", "acc-25"]]);
    expect(cash("CY2025Q2I", "2025-06-30", 50).rows).toEqual([[1, 50, "2025-06-30"]]);
  });
  it("rebuilds a June-year company's years with its own year-end balance sheet", () => {
    const merged = mergeFrames([rev25, rev24, cash("CY2025Q2I", "2025-06-30", 50), cash("CY2025Q4I", "2025-12-31", 70), cash("CY2024Q4I", "2024-12-31", 40), shares]);
    const years = framesFiscalYears(merged, 1);
    expect(years.map((y) => [y.end, y.values.revenue, y.values.cash, y.values.shares])).toEqual([
      ["2025-06-30", 1000, 50, 77],
      // Only a December balance for the older year, six months after its June year end; the 2025 cover-page count is
      // too far away to stand in for 2024's.
      ["2024-06-30", 900, 40, undefined],
    ]);
    expect(years[0].accessions).toEqual(["acc-25"]);
  });
});
