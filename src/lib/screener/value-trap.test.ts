import { describe, expect, it } from "vitest";
import type { DerivedYear } from "./line-items";
import { healthyYear, blankYear } from "./test-fixtures";
import { beneishM, CHECKLIST_DEFS, computeChecklist, type ChecklistInput } from "./value-trap";

const ends = ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31", "2021-12-31"];
const clean: DerivedYear[] = ends.map((e, i) =>
  healthyYear(e, { revenue: 1000 / 1.05 ** i, grossProfit: 400 / 1.05 ** i, receivables: 150 / 1.05 ** i, inventory: 100 / 1.05 ** i, debtDueYear1: 20, debtDueYear2: 20, capitalizedSoftware: 10, researchAndDevelopment: 90, dilutedShares: 100 * 1.005 ** i }),
);
const input = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
  years: clean,
  insider: { netUsd: 0, soldUsd: 0, boughtUsd: 0, planSalesExcluded: 2, officers: [], unparsed: 0, since: "2026-04-01" },
  filingFlags: { openFilingFlags: 0, eightKFlags12m: 0 },
  ...over,
});
const byKey = (items: ReturnType<typeof computeChecklist>) => Object.fromEntries(items.map((i) => [i.key, i]));

describe("computeChecklist", () => {
  it("returns every check in order, a clean company passing", () => {
    const items = computeChecklist(input());
    expect(items.map((i) => i.key)).toEqual(CHECKLIST_DEFS.map((d) => d.key));
    const statuses = Object.fromEntries(items.map((i) => [i.key, i.status]));
    expect(statuses).toEqual({
      roicTrend: "pass",
      grossMarginTrend: "pass",
      cashConversion: "pass",
      receivables: "pass",
      inventory: "pass",
      capitalizedCosts: "pass",
      goodwill: "pass",
      debtFundedBuybacks: "pass",
      interestCoverage: "pass",
      debtMaturities: "pass",
      stockCompDilution: "pass",
      beneishM: "pass",
      insiderSelling: "pass",
      filingChanges: "pass",
    });
    expect(byKey(items).goodwill.detail).toBe("Goodwill is 10.0% of total assets");
    expect(byKey(items).interestCoverage.detail).toBe("EBIT covers interest 20.0×");
    expect(byKey(items).insiderSelling.detail).toBe("No open-market officer trades in six months; 2 10b5-1 plan sales left out");
  });

  it("shows no_data, never pass or fail, when inputs are missing", () => {
    const items = computeChecklist({ years: [blankYear("2025-12-31")], insider: null, filingFlags: null });
    expect(items.every((i) => i.status === "no_data")).toBe(true);
    expect(items.every((i) => i.detail.length > 0)).toBe(true);
  });

  it("fails ROIC and gross margin that fell three of four years", () => {
    const years = clean.map((y, i) => ({ ...y, ebit: [150, 160, 170, 165, 180][i], grossProfit: [300, 320, 330, 340, 335][i] }));
    const k = byKey(computeChecklist(input({ years })));
    expect(k.roicTrend.status).toBe("fail");
    expect(k.roicTrend.detail).toMatch(/^ROIC fell in 3 of the last 4 years/);
    expect(k.grossMarginTrend.status).toBe("fail");
  });

  it("fails weak cash conversion and watches a loss", () => {
    const low = clean.map((y) => ({ ...y, operatingCashFlow: 100 }));
    expect(byKey(computeChecklist(input({ years: low }))).cashConversion).toMatchObject({ status: "fail", detail: "Operating cash flow was 66% of net income over three years" });
    const loss = clean.map((y) => ({ ...y, netIncome: -10 }));
    expect(byKey(computeChecklist(input({ years: loss }))).cashConversion.status).toBe("watch");
  });

  it("fails receivables and inventory racing ahead of revenue", () => {
    const years = clean.map((y, i) => (i === 0 ? { ...y, receivables: 200, inventory: 115 } : y));
    const k = byKey(computeChecklist(input({ years })));
    // Revenue +5%, receivables +40%, inventory +20.75%.
    expect(k.receivables.status).toBe("fail");
    expect(k.receivables.detail).toBe("Receivables grew 40.0% against revenue growth of 5.0%");
    expect(k.inventory.status).toBe("fail");
    const mild = clean.map((y, i) => (i === 0 ? { ...y, receivables: (150 / 1.05) * 1.08 } : y));
    expect(byKey(computeChecklist(input({ years: mild }))).receivables.status).toBe("watch");
  });

  it("fails capitalized software rising as a share of spend two years running", () => {
    const years = clean.map((y, i) => ({ ...y, capitalizedSoftware: [40, 25, 10, 10, 10][i] }));
    expect(byKey(computeChecklist(input({ years }))).capitalizedCosts.status).toBe("fail");
    const noSw = clean.map((y) => ({ ...y, capitalizedSoftware: null }));
    expect(byKey(computeChecklist(input({ years: noSw }))).capitalizedCosts.status).toBe("no_data");
  });

  it("grades goodwill share of assets", () => {
    const at = (g: number) => byKey(computeChecklist(input({ years: clean.map((y, i) => (i === 0 ? { ...y, goodwill: g } : y)) }))).goodwill.status;
    expect([at(900), at(600), at(100)]).toEqual(["fail", "watch", "pass"]);
  });

  it("fails buybacks above free cash flow while net debt rose", () => {
    const years = clean.map((y, i) => ({ ...y, buybacks: 300, debt: i === 0 ? 900 : 300 }));
    const k = byKey(computeChecklist(input({ years })));
    expect(k.debtFundedBuybacks.status).toBe("fail");
    expect(k.debtFundedBuybacks.detail).toBe("Buybacks of $900 against free cash flow of $480 over three years; net debt rose ($200 to $800)");
    const flat = clean.map((y) => ({ ...y, buybacks: 300 }));
    expect(byKey(computeChecklist(input({ years: flat }))).debtFundedBuybacks.status).toBe("watch");
  });

  it("grades interest coverage and treats no interest as a pass", () => {
    const at = (interest: number | null, ebit = 200) => byKey(computeChecklist(input({ years: clean.map((y, i) => (i === 0 ? { ...y, interestExpense: interest, ebit } : y)) }))).interestCoverage.status;
    expect([at(100), at(50), at(10), at(0), at(null), at(10, -5)]).toEqual(["fail", "watch", "pass", "pass", "no_data", "fail"]);
  });

  it("grades debt due within two years", () => {
    const at = (d1: number) => byKey(computeChecklist(input({ years: clean.map((y, i) => (i === 0 ? { ...y, debtDueYear1: d1, debtDueYear2: 0 } : y)) }))).debtMaturities.status;
    expect([at(100), at(75), at(30)]).toEqual(["fail", "watch", "pass"]);
  });

  it("fails heavy stock comp or fast dilution", () => {
    const heavy = clean.map((y, i) => (i === 0 ? { ...y, stockComp: 50 } : y));
    expect(byKey(computeChecklist(input({ years: heavy }))).stockCompDilution).toMatchObject({ status: "fail", detail: "Stock comp is 31.3% of free cash flow; shares shrank 0.5% a year over three years" });
    const dilutive = clean.map((y, i) => ({ ...y, dilutedShares: 100 / 1.03 ** i }));
    expect(byKey(computeChecklist(input({ years: dilutive }))).stockCompDilution.status).toBe("fail");
  });

  it("only ever watches on the Beneish M-score", () => {
    const aggressive = clean.map((y, i) => (i === 0 ? { ...y, receivables: 400, netIncome: 400, operatingCashFlow: 50 } : y));
    const m = beneishM(aggressive[0], aggressive[1])!;
    expect(m).toBeGreaterThan(-1.78);
    expect(byKey(computeChecklist(input({ years: aggressive }))).beneishM.status).toBe("watch");
    expect(beneishM(clean[0], clean[1])).toBeLessThan(-1.78);
    expect(beneishM({ ...clean[0], ppe: null }, clean[1])).toBeNull();
  });

  it("grades officers' net selling outside 10b5-1 plans", () => {
    const at = (netUsd: number) => byKey(computeChecklist(input({ insider: { netUsd, soldUsd: Math.max(netUsd, 0), boughtUsd: 0, planSalesExcluded: 0, officers: ["A"], unparsed: 1, since: "2026-04-01" } }))).insiderSelling;
    expect(at(4_300_000)).toMatchObject({ status: "fail", detail: "Officers sold $4.3M net in the open market in six months; 1 filing couldn't be read" });
    expect(at(200_000).status).toBe("watch");
    expect(at(-50_000)).toMatchObject({ status: "pass", detail: "Officers bought $50K net in the open market in six months; 1 filing couldn't be read" });
  });

  it("fails on any unresolved filing flag", () => {
    const k = byKey(computeChecklist(input({ filingFlags: { openFilingFlags: 1, eightKFlags12m: 2 } })));
    expect(k.filingChanges).toMatchObject({ status: "fail", detail: "1 unresolved filing-change flag and 2 8-K flags in the last 12 months" });
  });
});
