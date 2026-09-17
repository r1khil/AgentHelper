import { describe, expect, it } from "vitest";
import { buildProposals, suggestConcepts } from "./proposals";
import type { CompanyFacts, Fact } from "@/lib/providers/edgar";

const q = (start: string, end: string, val: number, fp: string, fy: number, form = "10-Q", filed = "2026-01-01", accn = "0000000000-26-000001"): Fact => ({ start, end, val, fp, fy, form, filed, accn });

const facts: CompanyFacts = {
  cik: 1,
  entityName: "Test Co",
  facts: {
    "us-gaap": {
      Revenues: {
        label: "Revenues",
        description: "",
        units: {
          USD: [
            q("2025-01-01", "2025-03-31", 100, "Q1", 2025),
            q("2025-04-01", "2025-06-30", 110, "Q2", 2025),
            q("2025-01-01", "2025-06-30", 210, "Q2", 2025), // YTD
            q("2025-07-01", "2025-09-30", 120, "Q3", 2025),
            q("2025-01-01", "2025-12-31", 460, "FY", 2025, "10-K", "2026-02-15"),
            q("2026-01-01", "2026-03-31", 130, "Q1", 2026, "10-Q", "2026-04-30"),
            q("2026-01-01", "2026-03-31", 135, "Q1", 2026, "10-Q", "2026-07-30", "0000000000-26-000009"), // restatement
          ],
        },
      },
      Assets: { label: "Assets", description: "", units: { USD: [{ end: "2025-12-31", val: 5000, fp: "FY", fy: 2025, form: "10-K", filed: "2026-02-15", accn: "x" }] } },
    },
  },
};

describe("buildProposals", () => {
  it("matches quarters, derives Q4, flags YTD-only and restatements, and scales", () => {
    const out = buildProposals(facts, "1", {
      concept: "Revenues",
      taxonomy: "us-gaap",
      unit: "USD",
      scale: 1,
      sign: 1,
      periodType: "quarterly",
      periodColumns: { B: "2025-03-31", C: "2025-06-30", D: "2025-09-30", E: "2025-12-31", F: "2026-03-31", G: "2026-06-30" },
    });
    const by = Object.fromEntries(out.map((p) => [p.column, p]));
    expect(by.B.status).toBe("proposed");
    expect(by.B.value).toBe(100);
    expect(by.C.value).toBe(110); // quarter preferred over YTD ending the same day
    expect(by.E.status).toBe("proposed");
    expect(by.E.value).toBe(130); // 460 - (100+110+120)
    expect(by.E.derivation).toMatch(/Derived: FY/);
    expect(by.F.status).toBe("exception");
    expect(by.F.exceptionReason).toMatch(/Restated/);
    expect(by.F.value).toBe(135); // latest filing carried
    expect(by.G.status).toBe("exception");
    expect(by.G.exceptionReason).toMatch(/No fact/);
  });

  it("handles instants and scale/sign", () => {
    const out = buildProposals(facts, "1", { concept: "Assets", taxonomy: "us-gaap", unit: "USD", scale: 1000, sign: -1, periodType: "quarterly", periodColumns: { B: "2025-12-31" } });
    expect(out[0].status).toBe("proposed");
    expect(out[0].value).toBe(-5);
  });

  it("reports unknown concepts and units as exceptions", () => {
    expect(buildProposals(facts, "1", { concept: "Nope", taxonomy: "us-gaap", unit: "USD", scale: 1, sign: 1, periodType: "annual", periodColumns: { B: "2025-12-31" } })[0].exceptionReason).toMatch(/not reported/);
    expect(buildProposals(facts, "1", { concept: "Revenues", taxonomy: "us-gaap", unit: "EUR", scale: 1, sign: 1, periodType: "annual", periodColumns: { B: "2025-12-31" } })[0].exceptionReason).toMatch(/Unit EUR/);
  });
});

describe("suggestConcepts", () => {
  it("value-matches across scales", () => {
    const s = suggestConcepts(facts, "2025-12-31", 0.46); // model in $ thousands? 0.46 * 1000 = 460
    expect(s.some((x) => x.concept === "Revenues" && x.scale === 1000)).toBe(true);
    const a = suggestConcepts(facts, "2025-12-31", 5000);
    expect(a[0].concept).toBe("Assets");
    expect(a[0].scale).toBe(1);
  });
});
