import { describe, expect, it } from "vitest";
import { planComparisons, sameQuarterLastYear, type PeriodicFiling } from "./pairing";
import { extractSection } from "./sections";
import { troubleItems, eightKRow } from "./eight-k";
import { flagTitle, labelText } from "./labels";

const f = (accession: string, form: string, filedAt: string, reportDate: string): PeriodicFiling => ({ accession, form, filedAt, reportDate, url: `https://www.sec.gov/Archives/edgar/data/1/${accession}/doc.htm` });

// Newest first, as EDGAR lists them.
const HISTORY = [
  f("q2-26", "10-Q", "2026-08-05", "2026-06-30"),
  f("q1-26", "10-Q", "2026-05-06", "2026-03-31"),
  f("k-25", "10-K", "2026-02-20", "2025-12-31"),
  f("q3-25", "10-Q", "2025-11-05", "2025-09-30"),
  f("q2-25", "10-Q", "2025-08-06", "2025-06-30"),
  f("q1-25", "10-Q", "2025-05-07", "2025-03-31"),
  f("k-24", "10-K", "2025-02-21", "2024-12-31"),
  f("ka-24", "10-K/A", "2025-04-01", "2024-12-31"),
];

describe("planComparisons", () => {
  it("compares a 10-K's Items with the prior 10-K, 1A first", () => {
    const plans = planComparisons(HISTORY[2], HISTORY);
    expect(plans.map((p) => p.item)).toEqual(["1A", "7", "1", "7A", "9A"]);
    expect(plans.every((p) => p.priors.length === 1 && p.priors[0].filing.accession === "k-24" && p.priors[0].item === p.item)).toBe(true);
    expect(plans.map((p) => p.priority)).toEqual([1, 2, 3, 3, 3]);
  });

  it("compares a 10-Q's MD&A with the same quarter last year, suppressing against the immediately prior filing", () => {
    const mdna = planComparisons(HISTORY[0], HISTORY).find((p) => p.item === "2")!;
    expect(mdna.priors[0].filing.accession).toBe("q2-25");
    expect(mdna.suppress).toEqual({ filing: HISTORY[1], item: "2" });
  });

  it("suppresses a first-quarter 10-Q's MD&A against the 10-K's Item 7", () => {
    const mdna = planComparisons(HISTORY[1], HISTORY).find((p) => p.item === "2")!;
    expect(mdna.priors[0].filing.accession).toBe("q1-25");
    expect(mdna.suppress).toEqual({ filing: HISTORY[2], item: "7" });
  });

  it("compares a 10-Q's Item 1A with the most recent prior filing, walking back to the 10-K, added only", () => {
    const risk = planComparisons(HISTORY[0], HISTORY).find((p) => p.item === "1A")!;
    expect(risk.priors.map((r) => r.filing.accession)).toEqual(["q1-26", "k-25"]);
    expect(risk.addedOnly).toBe(true);
    const q1 = planComparisons(HISTORY[1], HISTORY).find((p) => p.item === "1A")!;
    expect(q1.priors.map((r) => r.filing.accession)).toEqual(["k-25"]);
  });

  it("compares a 10-Q's Items 3 and 4 with the prior 10-Q", () => {
    const plans = planComparisons(HISTORY[1], HISTORY);
    expect(plans.filter((p) => p.item === "3" || p.item === "4").map((p) => p.priors[0].filing.accession)).toEqual(["q3-25", "q3-25"]);
  });

  it("has nothing to compare for a first filing or another form", () => {
    expect(planComparisons(HISTORY[6], HISTORY)).toEqual([]);
    expect(planComparisons(f("x", "8-K", "2026-09-01", "2026-09-01"), HISTORY)).toEqual([]);
  });

  it("finds last year's quarter by filing date when the period date is missing", () => {
    expect(sameQuarterLastYear({ ...HISTORY[0], reportDate: undefined }, HISTORY.slice(1))?.accession).toBe("q2-25");
  });
});

describe("extractSection", () => {
  const TENQ = [
    "TABLE OF CONTENTS",
    "PART I\tFINANCIAL INFORMATION",
    "Item 1.\tFinancial Statements\t3",
    "Item 2.\tManagement's Discussion and Analysis\t20",
    "Item 4.\tControls and Procedures\t35",
    "PART II\tOTHER INFORMATION",
    "Item 1A.\tRisk Factors\t37",
    "Item 2.\tUnregistered Sales of Equity Securities\t38",
    "PART I — FINANCIAL INFORMATION",
    "Item 1. Financial Statements",
    "Balance sheet follows.",
    "Item 2. Management's Discussion and Analysis of Financial Condition and Results of Operations",
    "Net sales increased in the quarter because of higher volumes across our segments.",
    "Item 4. Controls and Procedures",
    "Our disclosure controls were effective.",
    "PART II — OTHER INFORMATION",
    "Item 1A. Risk Factors",
    "There have been no material changes to our risk factors.",
    "Item 2. Unregistered Sales of Equity Securities and Use of Proceeds",
    "None.",
  ].join("\n");

  it("takes a 10-Q's Item 2 from Part I and Item 1A from Part II", () => {
    expect(extractSection(TENQ, "10-Q", "2")).toMatch(/^Item 2\. Management's Discussion[\s\S]*higher volumes across our segments\.$/);
    expect(extractSection(TENQ, "10-Q", "1A")).toBe("Item 1A. Risk Factors\nThere have been no material changes to our risk factors.");
    expect(extractSection(TENQ, "10-Q", "2", "II")).toBe("Item 2. Unregistered Sales of Equity Securities and Use of Proceeds\nNone.");
  });

  it("stops Part I's last Item at the Part II heading", () => {
    expect(extractSection(TENQ, "10-Q", "4")).toBe("Item 4. Controls and Procedures\nOur disclosure controls were effective.");
  });

  it("has no length floor but skips contents lines", () => {
    expect(extractSection("Item 3.\tLegal Proceedings\t12\nItem 3. Legal Proceedings\nNone.", "10-K", "3")).toBe("Item 3. Legal Proceedings\nNone.");
    expect(extractSection("Item 3.\tLegal Proceedings\t12\nItem 4.\tMine Safety\t13", "10-K", "3")).toBeNull();
  });

  it("tells Item 1 from Item 1A in a 10-K", () => {
    const k = "Item 1. Business\nWe make widgets for industrial customers worldwide.\nItem 1A. Risk Factors\nWidgets may fall out of favor with customers.\nItem 2. Properties\nWe lease our headquarters.";
    expect(extractSection(k, "10-K", "1")).toBe("Item 1. Business\nWe make widgets for industrial customers worldwide.");
    expect(extractSection(k, "10-K", "1A")).toBe("Item 1A. Risk Factors\nWidgets may fall out of favor with customers.");
  });
});

describe("8-K item codes", () => {
  it("maps the trouble codes and ignores the rest", () => {
    expect(troubleItems("2.02,9.01")).toEqual([]);
    expect(troubleItems("4.01,9.01")).toEqual(["4.01"]);
    expect(troubleItems("2.04,2.06,4.02,2.04")).toEqual(["2.04", "2.06", "4.02"]);
    expect(troubleItems(undefined)).toEqual([]);
  });

  it("stores a row per code with a label key and display text", () => {
    expect(eightKRow("4.02")).toEqual({ item: "8-K 4.02", label: "non_reliance", summary: "Item 4.02: Non-reliance on prior financial statements (restatement)" });
    expect(labelText("auditor_change")).toBe("Auditor change");
    expect(flagTitle("KRE", "8-K", "material_impairment")).toBe("KRE 8-K: material impairment");
    expect(flagTitle("KRE", "10-Q", "new_risk_factor")).toBe("KRE 10-Q: new risk factor");
  });
});
