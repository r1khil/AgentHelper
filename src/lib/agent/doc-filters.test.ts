import { describe, expect, it } from "vitest";
import { coherentDocFilters } from "./doc-filters";

describe("coherentDocFilters", () => {
  it("drops Drive-only filters from a filing search (Luna's eval call, 2026-09-29)", () => {
    const luna = { form: "10-Q", kind: "filing" as const, query: "guidance", latest: 1, ticker: "AXP", driveKind: "earnings_update", documentType: "earnings_update" };
    expect(coherentDocFilters(luna)).toEqual({ form: "10-Q", kind: "filing", query: "guidance", latest: 1, ticker: "AXP" });
    expect(coherentDocFilters({ form: "10-K", driveKind: "initiating_coverage" })).toEqual({ form: "10-K" });
  });
  it("drops form from a Drive search and treats blanks as unset", () => {
    expect(coherentDocFilters({ form: "", kind: "drive" as const, driveKind: "initiating_coverage", query: "ICR" })).toEqual({ kind: "drive", driveKind: "initiating_coverage", query: "ICR" });
    expect(coherentDocFilters({ kind: "drive" as const, form: "10-K" })).toEqual({ kind: "drive" });
  });
  it("leaves consistent arguments alone", () => {
    expect(coherentDocFilters({ driveKind: "earnings_update", documentType: "pre_earnings", latest: 1 })).toEqual({ driveKind: "earnings_update", documentType: "pre_earnings", latest: 1 });
    expect(coherentDocFilters({ query: "credit losses", form: " " })).toEqual({ query: "credit losses" });
  });
});
