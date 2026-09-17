import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { patchXlsx } from "./patch";
import { readWorkbook } from "./read";

async function fixture() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Model");
  ws.getCell("A1").value = "Revenue";
  ws.getCell("B1").value = 100;
  ws.getCell("C1").value = 200;
  ws.getCell("D1").value = { formula: "B1+C1", result: 300 };
  ws.getCell("A2").value = "Cost";
  ws.getCell("B2").value = 50;
  ws.getCell("C2").value = 60;
  ws.getCell("D2").value = { formula: "B2+C2", result: 110 };
  ws.getCell("B3").value = { formula: "B1-B2", result: 50 };
  ws.getCell("B1").numFmt = "#,##0";
  wb.addWorksheet("Notes").getCell("A1").value = "untouched";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("patchXlsx", () => {
  it("writes values, keeps formulas and other sheets, and forces recalculation", async () => {
    const original = await fixture();
    const patched = await patchXlsx(original, [
      { sheet: "Model", ref: "B1", value: 150 },
      { sheet: "Model", ref: "C2", value: 70 },
      { sheet: "Model", ref: "E1", value: 5 },
      { sheet: "Model", ref: "B9", value: 9 },
    ]);
    const info = await readWorkbook(patched);
    const model = info.sheets.find((s) => s.name === "Model")!;
    const cell = (ref: string) => model.rows.flatMap((r) => r.cells).find((c) => c.ref === ref);
    expect(cell("B1")?.v).toBe(150);
    expect(cell("C2")?.v).toBe(70);
    expect(cell("E1")?.v).toBe(5);
    expect(cell("B9")?.v).toBe(9);
    expect(cell("D1")?.f).toBe("B1+C1");
    expect(cell("D2")?.f).toBe("B2+C2");
    expect(cell("B3")?.f).toBe("B1-B2");
    expect(cell("A1")?.v).toBe("Revenue");
    expect(info.sheets.find((s) => s.name === "Notes")?.rows[0].cells[0].v).toBe("untouched");

    const zip = await JSZip.loadAsync(patched);
    expect(await zip.file("xl/workbook.xml")!.async("string")).toMatch(/fullCalcOnLoad="1"/);
    // Only the Model sheet part changed.
    const oz = await JSZip.loadAsync(original);
    const notesPath = "xl/worksheets/sheet2.xml";
    expect(await zip.file(notesPath)!.async("string")).toBe(await oz.file(notesPath)!.async("string"));
    // Style attribute on B1 survived.
    const sheet1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet1).toMatch(/<c r="B1" s="\d+"><v>150<\/v><\/c>/);
  });

  it("refuses to overwrite a formula cell", async () => {
    const original = await fixture();
    await expect(patchXlsx(original, [{ sheet: "Model", ref: "D1", value: 1 }])).rejects.toThrow(/formula/);
  });

  it("rejects unknown sheets", async () => {
    const original = await fixture();
    await expect(patchXlsx(original, [{ sheet: "Nope", ref: "A1", value: 1 }])).rejects.toThrow(/not found/);
  });
});
