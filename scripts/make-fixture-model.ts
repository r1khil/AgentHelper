// Builds a small NVDA-style model workbook for testing the historicals flow.
import ExcelJS from "exceljs";

async function main() {
  const out = process.argv[2] ?? "fixture-model.xlsx";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("IS");
  ws.getCell("A1").value = "NVIDIA income statement ($ millions)";
  ws.getCell("A3").value = "Period end";
  const ends = ["2025-04-27", "2025-07-27", "2025-10-26", "2026-01-25", "2026-04-26", "2026-07-26"];
  const cols = ["B", "C", "D", "E", "F", "G"];
  ends.forEach((d, i) => (ws.getCell(`${cols[i]}3`).value = d));
  ws.getCell("A4").value = "Revenue";
  ws.getCell("C4").value = 46743; // anchor: Q2 FY2026 revenue in $ millions
  ws.getCell("A5").value = "Cost of revenue";
  ws.getCell("A6").value = "Gross profit";
  cols.forEach((c) => (ws.getCell(`${c}6`).value = { formula: `${c}4-${c}5`, result: 0 }));
  ws.getCell("A7").value = "Gross margin";
  cols.forEach((c) => (ws.getCell(`${c}7`).value = { formula: `IF(${c}4=0,0,${c}6/${c}4)`, result: 0 }));
  ws.getCell("A9").value = "Net income";
  ws.getCell("B4").numFmt = "#,##0";
  const chart = wb.addWorksheet("Notes");
  chart.getCell("A1").value = "Analyst notes live here; untouched by writes.";
  await wb.xlsx.writeFile(out);
  console.log("wrote", out);
}
main();
