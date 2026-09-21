import { describe, expect, it } from "vitest";
import { chunkDocument, filingSectionsText, splitSections, usesItemSections } from "./sections";

const para = (label: string, n: number) => Array.from({ length: n }, (_, i) => `${label} paragraph ${i + 1}. ${"Words that fill the line. ".repeat(20)}`).join("\n\n");
const tenK = ["PART I", `Item 1. Business\n\n${para("Business", 4)}`, `Item 1A. Risk Factors\n\n${para("Risk", 6)}`, `Item 2. Properties\n\n${para("Properties", 2)}`, `Item 7. Management's Discussion\n\n${para("MD&A", 8)}`, `Item 7A. Market Risk\n\n${para("Market risk", 2)}`, `Item 8. Financial Statements\n\n${para("Statements", 3)}`].join("\n\n");

describe("filingSectionsText", () => {
  it("keeps only the listed Items under ## headings, MD&A first", () => {
    const r = filingSectionsText("10-K", tenK);
    expect(r).not.toBeNull();
    expect(r!.found).toEqual(["Item 7", "Item 1A", "Item 1", "Item 7A"]);
    expect(r!.text.startsWith("## Item 7\n\n")).toBe(true);
    expect(r!.text).not.toContain("Properties paragraph");
    expect(r!.text).not.toContain("Statements paragraph");
  });
  it("returns null for forms stored whole or when no Item is found", () => {
    expect(usesItemSections("8-K")).toBe(false);
    expect(usesItemSections("10-K/A")).toBe(true);
    expect(filingSectionsText("8-K", tenK)).toBeNull();
    expect(filingSectionsText("10-Q", "No headings here at all.")).toBeNull();
  });
});

describe("splitSections / chunkDocument", () => {
  it("round-trips stored section text into labeled chunks with re-sequenced ids", () => {
    const stored = filingSectionsText("10-K", tenK)!.text;
    const sections = splitSections(stored);
    expect(sections.map((s) => s.label)).toEqual(["Item 7", "Item 1A", "Item 1", "Item 7A"]);
    const chunks = chunkDocument("filing", stored);
    expect(chunks.map((c) => c.seq)).toEqual(chunks.map((_, i) => i));
    expect(new Set(chunks.map((c) => c.section))).toEqual(new Set(["Item 7", "Item 1A", "Item 1", "Item 7A"]));
    expect(chunks[0].section).toBe("Item 7");
  });
  it("treats text without markers as one unlabeled section and honors the global cap", () => {
    expect(splitSections("plain text")).toEqual([{ label: null, text: "plain text" }]);
    const long = para("Release", 400);
    expect(chunkDocument("filing", long, { max: 120 })).toHaveLength(120);
    expect(chunkDocument("drive", long, { max: 5 }).every((c) => c.section === null)).toBe(true);
  });
});
