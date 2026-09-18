import { describe, expect, it } from "vitest";
import { EMPTY_SUMMARY, isEmptySummary, parseSummaryJson, summaryInput, summaryToPromptLines } from "./summary";

const good = { oneLine: "Initiating at Buy.", thesis: "Margins expand as mix shifts.", rating: "Buy", priceTarget: "$245 (12-month)", keyNumbers: ["FY2025 revenue: $17.9B"], catalysts: ["Q3 print"], risks: ["FX"], docDate: "2025-03-01", evidenceNote: null };

describe("parseSummaryJson", () => {
  it("parses a bare JSON object", () => {
    expect(parseSummaryJson(JSON.stringify(good))).toEqual(good);
  });

  it("parses JSON wrapped in prose or a code fence", () => {
    const wrapped = `Here you go:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\nDone.`;
    expect(parseSummaryJson(wrapped)).toEqual(good);
  });

  it("returns an empty summary with a note on garbage", () => {
    const s = parseSummaryJson("no json here");
    expect(isEmptySummary(s)).toBe(true);
    expect(s.evidenceNote).toMatch(/could not be parsed/);
    expect(parseSummaryJson("{ not valid").evidenceNote).toMatch(/could not be parsed/);
    expect(parseSummaryJson("[1,2]").evidenceNote).toMatch(/could not be parsed/);
  });

  it("clamps list lengths and item sizes, drops non-strings", () => {
    const s = parseSummaryJson(JSON.stringify({ ...good, keyNumbers: Array.from({ length: 20 }, (_, i) => `n${i}`), risks: [null, "", "  real  ", { a: "x", b: "y" }] }));
    expect(s.keyNumbers).toHaveLength(8);
    expect(s.risks).toEqual(["real", "x: y"]);
    const long = parseSummaryJson(JSON.stringify({ ...good, oneLine: "x".repeat(500) }));
    expect(long.oneLine).toHaveLength(200);
  });

  it("drops a docDate that is not yyyy-mm-dd or is out of range", () => {
    expect(parseSummaryJson(JSON.stringify({ ...good, docDate: "March 2025" })).docDate).toBeNull();
    expect(parseSummaryJson(JSON.stringify({ ...good, docDate: "2025-13-01" })).docDate).toBeNull();
    expect(parseSummaryJson(JSON.stringify({ ...good, docDate: "1950-01-01" })).docDate).toBeNull();
    expect(parseSummaryJson(JSON.stringify({ ...good, docDate: "2025-03-01" })).docDate).toBe("2025-03-01");
  });

  it("treats whitespace-only strings as null", () => {
    const s = parseSummaryJson(JSON.stringify({ ...good, rating: "   ", thesis: "" }));
    expect(s.rating).toBeNull();
    expect(s.thesis).toBeNull();
  });
});

describe("summaryInput", () => {
  it("returns short text untouched", () => {
    expect(summaryInput("  hello  ")).toBe("hello");
  });

  it("keeps the head and tail of long text with a marker", () => {
    const text = `${"A".repeat(500)}${"B".repeat(500)}${"C".repeat(500)}`;
    const out = summaryInput(text, 600);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.startsWith("AAAA")).toBe(true);
    expect(out.endsWith("CCCC")).toBe(true);
    expect(out).toContain("[... middle of document omitted ...]");
  });
});

describe("summaryToPromptLines", () => {
  it("is empty for an empty summary", () => {
    expect(summaryToPromptLines(EMPTY_SUMMARY)).toBe("");
  });

  it("emits indented bullets and respects the cap", () => {
    const out = summaryToPromptLines(good, 120);
    expect(out.startsWith("    - dated 2025-03-01")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(120);
    const full = summaryToPromptLines(good);
    expect(full).toContain("thesis: Margins expand");
    expect(full).toContain("rating Buy, price target $245 (12-month)");
  });
});
