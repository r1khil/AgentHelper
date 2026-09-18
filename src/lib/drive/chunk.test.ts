import { describe, expect, it } from "vitest";
import { chunkHeader, chunkText } from "./chunk";

describe("chunkText", () => {
  it("returns nothing for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n ")).toEqual([]);
  });

  it("keeps a short document as a single chunk", () => {
    const c = chunkText("Hello world.\n\nSecond paragraph.");
    expect(c).toHaveLength(1);
    expect(c[0]).toEqual({ seq: 0, text: "Hello world.\n\nSecond paragraph.", start: 0 });
  });

  it("packs paragraphs up to the size, overlaps, and numbers sequentially", () => {
    const paras = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ${"x".repeat(90)}.`);
    const text = paras.join("\n\n");
    const c = chunkText(text, { size: 300, overlap: 40 });
    expect(c.length).toBeGreaterThan(2);
    c.forEach((ch, i) => {
      expect(ch.seq).toBe(i);
      expect(ch.text.length).toBeLessThanOrEqual(300 + 40 + 1);
    });
    // Overlap: the second chunk begins with the tail of the first.
    const tail = c[0].text.slice(-40).trimStart();
    expect(c[1].text.startsWith(tail)).toBe(true);
    // start offsets point at the paragraph in the source.
    expect(text.slice(c[1].start, c[1].start + 11)).toMatch(/^Paragraph \d/);
  });

  it("splits a single oversized paragraph", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const c = chunkText(text, { size: 200, overlap: 0 });
    expect(c.length).toBeGreaterThan(3);
    for (const ch of c) expect(ch.text.length).toBeLessThanOrEqual(200);
    expect(c.map((ch) => ch.text).join(" ").replace(/\s+/g, " ")).toContain("Sentence number 39 is here.");
  });

  it("never merges across slide or sheet boundaries", () => {
    const text = "--- Slide 1 ---\nIntro\n\n--- Slide 2 ---\nBody\n\n## Sheet Model (10 rows x 3 cols)\nr1: A=1";
    const c = chunkText(text, { size: 5000, overlap: 0 });
    expect(c.map((ch) => ch.text)).toEqual(["--- Slide 1 ---\nIntro", "--- Slide 2 ---\nBody", "## Sheet Model (10 rows x 3 cols)\nr1: A=1"]);
  });

  it("caps the number of chunks", () => {
    const text = Array.from({ length: 50 }, (_, i) => `P${i} ${"y".repeat(100)}`).join("\n\n");
    expect(chunkText(text, { size: 120, overlap: 0, max: 5 })).toHaveLength(5);
  });
});

describe("chunkHeader", () => {
  it("joins the available parts", () => {
    expect(chunkHeader({ name: "AXP IC.pdf", ticker: "AXP", kind: "initiating_coverage", docDate: "2025-03-01" })).toBe("AXP · initiating coverage · AXP IC.pdf · 2025-03-01");
    expect(chunkHeader({ name: "notes.txt", ticker: null, kind: null })).toBe("notes.txt");
  });
});
