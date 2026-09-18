import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { MAX_TEXT_CHARS, capText, pptxToText, windowText, workbookToText } from "./text";

describe("windowText / capText", () => {
  it("pages through text with hasMore", () => {
    const t = "abcdefghij";
    expect(windowText(t, 0, 4)).toEqual({ text: "abcd", offset: 0, totalChars: 10, hasMore: true });
    expect(windowText(t, 8, 4)).toEqual({ text: "ij", offset: 8, totalChars: 10, hasMore: false });
    expect(windowText(t, 50, 4)).toEqual({ text: "", offset: 10, totalChars: 10, hasMore: false });
  });
  it("normalizes whitespace and caps length", () => {
    expect(capText("a \r\n\r\n\r\nb  \n")).toBe("a\n\nb");
    const big = "x".repeat(MAX_TEXT_CHARS + 10);
    const capped = capText(big);
    expect(capped.endsWith("\n[truncated]")).toBe(true);
    expect(capped.length).toBe(MAX_TEXT_CHARS + "\n[truncated]".length);
  });
});

describe("pptxToText", () => {
  it("extracts paragraphs per slide in slide order", async () => {
    const zip = new JSZip();
    const slide = (ps: string[]) => `<p:sld><p:txBody>${ps.map((p) => `<a:p><a:r><a:t>${p}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sld>`;
    zip.file("ppt/slides/slide10.xml", slide(["Ten"]));
    zip.file("ppt/slides/slide2.xml", slide(["Thesis &amp; drivers", ""]));
    zip.file("ppt/slides/slide1.xml", slide(["Title"]));
    zip.file("ppt/notesSlides/notesSlide1.xml", slide(["ignored"]));
    const text = await pptxToText(await zip.generateAsync({ type: "nodebuffer" }));
    expect(text).toBe("--- Slide 1 ---\nTitle\n\n--- Slide 2 ---\nThesis & drivers\n\n--- Slide 10 ---\nTen");
  });
});

describe("workbookToText", () => {
  it("renders values with cell refs, skipping empties", () => {
    const text = workbookToText({
      sheets: [
        {
          name: "IS",
          rowCount: 2,
          colCount: 3,
          rows: [
            { r: 1, cells: [{ ref: "A1", col: "A", row: 1, v: "Revenue", isFormula: false }, { ref: "B1", col: "B", row: 1, v: 100.12345, isFormula: false }] },
            { r: 2, cells: [{ ref: "A2", col: "A", row: 2, v: null, f: "=B1", isFormula: true }] },
          ],
        },
      ],
    });
    expect(text).toBe("## Sheet IS (2 rows x 3 cols)\nr1: A=Revenue | B=100.1235");
  });
});
