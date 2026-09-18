import { describe, expect, it } from "vitest";
import type { CompanyFacts, Fact } from "@/lib/providers/edgar";
import { resolveKeyFinancials, searchConcepts } from "./financials";

function q(start: string, end: string, val: number, accn: string, filed: string): Fact {
  return { start, end, val, accn, fy: 2026, fp: "Q2", form: "10-Q", filed };
}

const quarters: [string, string, string, string][] = [
  ["2025-07-01", "2025-09-30", "0000004962-25-000300", "2025-10-24"],
  ["2025-10-01", "2025-12-31", "0000004962-26-000100", "2026-01-30"],
  ["2026-01-01", "2026-03-31", "0000004962-26-000200", "2026-04-24"],
  ["2026-04-01", "2026-06-30", "0000004962-26-000322", "2026-07-24"],
];

function concept(label: string, unit: string, vals: number[]): { label: string; description: string; units: Record<string, Fact[]> } {
  return { label, description: label, units: { [unit]: quarters.map(([s, e, a, f], i) => q(s, e, vals[i], a, f)) } };
}

const facts: CompanyFacts = {
  cik: 4962,
  entityName: "AMERICAN EXPRESS CO",
  facts: {
    "us-gaap": {
      RevenuesNetOfInterestExpense: concept("Revenues, Net of Interest Expense", "USD", [17_000, 17_200, 17_500, 17_900]),
      IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: concept("Pretax income", "USD", [3_200, 3_300, 3_400, 3_500]),
      NetIncomeLoss: concept("Net Income (Loss)", "USD", [2_500, 2_600, 2_700, 2_800]),
      EarningsPerShareDiluted: concept("Diluted EPS", "USD/shares", [3.5, 3.6, 3.7, 3.9]),
      // An annual-only concept must not be picked for quarterly rows.
      Revenues: { label: "Revenues", description: "", units: { USD: [q("2025-01-01", "2025-12-31", 68_000, "0000004962-26-000050", "2026-02-10")] } },
    },
  },
};

describe("resolveKeyFinancials", () => {
  it("falls back to the concept the company actually reports for the period kind", () => {
    const kf = resolveKeyFinancials(facts, "quarter", 4);
    expect(kf.metrics.find((m) => m.key === "revenue")?.concept).toBe("RevenuesNetOfInterestExpense");
    expect(kf.rows).toHaveLength(4);
    expect(kf.rows[0].end).toBe("2026-06-30");
    expect(kf.rows[0].values.revenue).toEqual({ value: 17_900, concept: "RevenuesNetOfInterestExpense" });
    expect(kf.rows[0].accession).toBe("0000004962-26-000322");
  });

  it("flags margins as calculations and lists missing lines", () => {
    const kf = resolveKeyFinancials(facts, "quarter", 2);
    expect(kf.rows).toHaveLength(2);
    expect(kf.rows[0].calculated.netMarginPct).toBeCloseTo((2_800 / 17_900) * 100, 2);
    expect(kf.rows[0].calculated.operatingMarginPct).toBeUndefined();
    expect(kf.missing).toEqual(["Gross profit", "Operating income", "Operating cash flow"]);
    expect(kf.notes.some((n) => n.includes("calculation"))).toBe(true);
  });

  it("uses annual facts when asked for annual periods", () => {
    const kf = resolveKeyFinancials(facts, "annual", 4);
    expect(kf.metrics.find((m) => m.key === "revenue")?.concept).toBe("Revenues");
    expect(kf.rows).toHaveLength(1);
    expect(kf.rows[0].values.revenue?.value).toBe(68_000);
  });
});

describe("searchConcepts", () => {
  it("ranks all-word matches first and tolerates partial matches", () => {
    const hits = searchConcepts(facts, "revenue interest");
    expect(hits[0].concept).toBe("RevenuesNetOfInterestExpense");
    expect(hits.map((h) => h.concept)).toContain("Revenues");
    expect(hits[0]).not.toHaveProperty("score");
  });
});
