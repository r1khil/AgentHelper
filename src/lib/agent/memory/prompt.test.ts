import { describe, expect, it } from "vitest";
import { ageLabel, fundMemoryBlock, holdingMemoryBlock, isStaleFact, type MemoryEntry } from "./prompt";

const now = new Date("2026-09-21T12:00:00Z");
const e = (over: Partial<MemoryEntry>): MemoryEntry => ({ id: "1", kind: "fact", scope: "holding", body: "b", sources: [], createdAt: "2026-09-14T00:00:00Z", evidenceAt: null, verifiedAt: null, expiresAt: null, ...over });

describe("isStaleFact", () => {
  it("keeps recent evidence and recently verified old evidence", () => {
    expect(isStaleFact(e({ evidenceAt: "2026-06-30T00:00:00Z" }), now)).toBe(false);
    expect(isStaleFact(e({ evidenceAt: "2024-01-01T00:00:00Z", verifiedAt: "2026-08-01T00:00:00Z" }), now)).toBe(false);
  });
  it("marks old unverified evidence stale, but never logs or lessons", () => {
    expect(isStaleFact(e({ evidenceAt: "2024-01-01T00:00:00Z" }), now)).toBe(true);
    expect(isStaleFact(e({ evidenceAt: "2024-01-01T00:00:00Z", verifiedAt: "2025-01-01T00:00:00Z" }), now)).toBe(true);
    expect(isStaleFact(e({ kind: "lesson", evidenceAt: "2020-01-01T00:00:00Z" }), now)).toBe(false);
  });
});

describe("ageLabel", () => {
  it("prints evidence and verification dates", () => {
    expect(ageLabel(e({ evidenceAt: "2026-06-30T00:00:00Z", verifiedAt: "2026-09-14T10:00:00Z" }))).toBe("(evidence 2026-06-30, verified 2026-09-14)");
    expect(ageLabel(e({}))).toBe("(noted 2026-09-14)");
  });
});

describe("holdingMemoryBlock", () => {
  const src = { id: "xbrl-1", title: "t", publisher: "SEC", retrievedAt: "x" };
  it("lists logs then facts with age labels and citation tokens", () => {
    const block = holdingMemoryBlock("AXP", [e({ id: "l", kind: "log", body: "Asked about Q2 margins; found pretax margin 20.7%." }), e({ id: "f", body: "AXP reports revenue as RevenuesNetOfInterestExpense", sources: [src], evidenceAt: "2026-06-30T00:00:00Z" }), e({ id: "s", kind: "lesson", body: "10-Q MD&A is Item 2" })], now);
    expect(block).toContain("Research log for AXP");
    expect(block).toContain("- 2026-09-14: Asked about Q2 margins");
    expect(block).toContain("(evidence 2026-06-30) AXP reports revenue as RevenuesNetOfInterestExpense [src:xbrl-1]");
    expect(block).toContain("Lesson (noted 2026-09-14) 10-Q MD&A is Item 2");
  });
  it("drops expired and stale rows and returns nothing when empty", () => {
    expect(holdingMemoryBlock("AXP", [e({ expiresAt: "2026-01-01T00:00:00Z" }), e({ evidenceAt: "2023-01-01T00:00:00Z" })], now)).toBe("");
  });
  it("respects the character cap", () => {
    const many = Array.from({ length: 40 }, (_, i) => e({ id: String(i), kind: "log", body: "x".repeat(300) + i }));
    const block = holdingMemoryBlock("AXP", many, now, 2000);
    expect(block.length).toBeLessThanOrEqual(2000);
    expect(block).toContain("Earlier questions");
  });
});

describe("fundMemoryBlock", () => {
  it("only includes unexpired fund-scope facts", () => {
    const block = fundMemoryBlock([e({ scope: "fund", body: "Fed held rates 2026-09-17" }), e({ scope: "team", body: "team thing" }), e({ scope: "fund", body: "old", expiresAt: "2026-01-01T00:00:00Z" })], now);
    expect(block).toContain("Fed held rates");
    expect(block).not.toContain("team thing");
    expect(block).not.toContain("old");
  });
});
