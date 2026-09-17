import ExcelJS from "exceljs";

export type CellInfo = { ref: string; col: string; row: number; v: string | number | boolean | null; f?: string; isFormula: boolean };
export type SheetInfo = { name: string; rowCount: number; colCount: number; rows: { r: number; cells: CellInfo[] }[] };
export type WorkbookInfo = { sheets: SheetInfo[] };

function cellValue(cell: ExcelJS.Cell): { v: CellInfo["v"]; f?: string } {
  const raw = cell.value;
  if (raw === null || raw === undefined) return { v: null };
  if (typeof raw === "number" || typeof raw === "string" || typeof raw === "boolean") return { v: raw };
  if (raw instanceof Date) return { v: raw.toISOString().slice(0, 10) };
  if (typeof raw === "object") {
    const o = raw as Partial<ExcelJS.CellFormulaValue & ExcelJS.CellRichTextValue & ExcelJS.CellHyperlinkValue & ExcelJS.CellErrorValue & ExcelJS.CellSharedFormulaValue>;
    if ("formula" in o || "sharedFormula" in o) {
      const res = o.result;
      const v = typeof res === "number" || typeof res === "string" || typeof res === "boolean" ? res : res instanceof Date ? res.toISOString().slice(0, 10) : null;
      return { v, f: o.formula ?? (o.sharedFormula ? `shared:${o.sharedFormula}` : "=") };
    }
    if ("richText" in o && Array.isArray(o.richText)) return { v: o.richText.map((t) => t.text).join("") };
    if ("text" in o) return { v: String(o.text) };
    if ("error" in o) return { v: String(o.error) };
  }
  return { v: String(raw) };
}

/** Read a workbook into a compact, serializable structure (non-empty cells only). ExcelJS is read-only in this app. */
export async function readWorkbook(buffer: Buffer, opts: { maxRows?: number; maxCols?: number } = {}): Promise<WorkbookInfo> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const maxRows = opts.maxRows ?? 400;
  const maxCols = opts.maxCols ?? 60;
  const sheets: SheetInfo[] = [];
  wb.eachSheet((ws) => {
    const rows: SheetInfo["rows"] = [];
    let colCount = 0;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r > maxRows) return;
      const cells: CellInfo[] = [];
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (c > maxCols) return;
        const { v, f } = cellValue(cell);
        if (v === null && !f) return;
        const col = colLetter(c);
        cells.push({ ref: `${col}${r}`, col, row: r, v, f, isFormula: Boolean(f) });
        colCount = Math.max(colCount, c);
      });
      if (cells.length) rows.push({ r, cells });
    });
    sheets.push({ name: ws.name, rowCount: Math.min(ws.rowCount, maxRows), colCount, rows });
  });
  return { sheets };
}

export function colLetter(n: number) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(letters: string) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function splitRef(ref: string): { col: string; row: number } {
  const m = ref.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Bad cell reference ${ref}`);
  return { col: m[1], row: Number(m[2]) };
}
