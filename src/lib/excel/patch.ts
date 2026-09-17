import JSZip from "jszip";
import { colIndex, splitRef } from "./read";

export type CellWrite = { sheet: string; ref: string; value: number };

function xmlAttr(s: string, name: string) {
  const m = s.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

function decodeXml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** Map visible sheet names to their part paths inside the zip. */
async function sheetPaths(zip: JSZip): Promise<Map<string, string>> {
  const wb = await zip.file("xl/workbook.xml")?.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wb || !rels) throw new Error("Not a valid xlsx: workbook parts missing");
  const relTargets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = xmlAttr(m[0], "Id");
    const target = xmlAttr(m[0], "Target");
    if (id && target) relTargets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const out = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = xmlAttr(m[0], "name");
    const rid = xmlAttr(m[0], "r:id") ?? xmlAttr(m[0], "id");
    if (name && rid && relTargets.get(rid)) out.set(decodeXml(name), relTargets.get(rid)!);
  }
  return out;
}

function patchRow(rowXml: string, col: string, ref: string, value: number): string {
  const cellRe = new RegExp(`<c\\b[^>]*\\sr="${ref}"[^>]*(?:/>|>[\\s\\S]*?</c>)`);
  const existing = rowXml.match(cellRe);
  if (existing) {
    const cell = existing[0];
    if (/<f\b/.test(cell)) throw new Error(`Cell ${ref} contains a formula; refusing to overwrite it`);
    const style = xmlAttr(cell.match(/<c\b[^>]*>/)![0], "s");
    const replacement = `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
    return rowXml.replace(cell, replacement);
  }
  // Insert a new cell in column order.
  const open = rowXml.match(/<row\b[^>]*>/)![0];
  const selfClosing = open.endsWith("/>");
  const body = selfClosing ? "" : rowXml.slice(open.length, rowXml.lastIndexOf("</row>"));
  const cells = [...body.matchAll(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)].map((m) => m[0]);
  const target = colIndex(col);
  const newCell = `<c r="${ref}"><v>${value}</v></c>`;
  let inserted = false;
  const outCells: string[] = [];
  for (const c of cells) {
    const r = xmlAttr(c.match(/<c\b[^>]*>/)![0], "r") ?? "";
    if (!inserted && colIndex(splitRef(r).col) > target) {
      outCells.push(newCell);
      inserted = true;
    }
    outCells.push(c);
  }
  if (!inserted) outCells.push(newCell);
  const openFixed = selfClosing ? open.slice(0, -2) + ">" : open;
  return `${openFixed}${outCells.join("")}</row>`;
}

function patchSheet(xml: string, writes: { ref: string; value: number }[]): string {
  let out = xml;
  for (const w of writes) {
    const { col, row } = splitRef(w.ref);
    const ref = `${col}${row}`;
    const rowRe = new RegExp(`<row\\b[^>]*\\sr="${row}"[^>]*(?:/>|>[\\s\\S]*?</row>)`);
    const m = out.match(rowRe);
    if (m) {
      out = out.replace(m[0], patchRow(m[0], col, ref, w.value));
      continue;
    }
    // Row does not exist: insert in order inside <sheetData>.
    const newRow = `<row r="${row}"><c r="${ref}"><v>${w.value}</v></c></row>`;
    const sd = out.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>|<sheetData\b[^>]*\/>/);
    if (!sd) throw new Error("sheetData not found");
    if (sd[0].endsWith("/>")) {
      out = out.replace(sd[0], `<sheetData>${newRow}</sheetData>`);
      continue;
    }
    const rows = [...sd[1].matchAll(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)].map((x) => x[0]);
    let inserted = false;
    const list: string[] = [];
    for (const r of rows) {
      const rn = Number(xmlAttr(r.match(/<row\b[^>]*>/)![0], "r"));
      if (!inserted && rn > row) {
        list.push(newRow);
        inserted = true;
      }
      list.push(r);
    }
    if (!inserted) list.push(newRow);
    out = out.replace(sd[0], `${sd[0].slice(0, sd[0].indexOf(">") + 1)}${list.join("")}</sheetData>`);
  }
  return out;
}

/**
 * Write numeric values into specific cells by patching sheet XML inside the xlsx zip.
 * Everything else in the package is copied byte-for-byte, so formulas, formatting, charts and
 * pivots survive. Formula cells are refused. Excel recalculates on open (fullCalcOnLoad).
 */
export async function patchXlsx(input: Buffer, writes: CellWrite[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(input);
  const paths = await sheetPaths(zip);
  const bySheet = new Map<string, { ref: string; value: number }[]>();
  for (const w of writes) {
    if (!Number.isFinite(w.value)) throw new Error(`Non-numeric value for ${w.sheet}!${w.ref}`);
    const path = paths.get(w.sheet);
    if (!path) throw new Error(`Sheet "${w.sheet}" not found (have: ${[...paths.keys()].join(", ")})`);
    bySheet.set(path, [...(bySheet.get(path) ?? []), { ref: w.ref.toUpperCase(), value: w.value }]);
  }
  for (const [path, ws] of bySheet) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) throw new Error(`Sheet part ${path} missing`);
    zip.file(path, patchSheet(xml, ws));
  }

  // Force recalculation on open and drop the stale calc chain.
  const wbXml = (await zip.file("xl/workbook.xml")!.async("string")).replace(/\sfullCalcOnLoad="[^"]*"/, "");
  const patchedWb = /<calcPr\b/.test(wbXml)
    ? wbXml.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"')
    : wbXml.replace(/<\/workbook>/, '<calcPr fullCalcOnLoad="1"/></workbook>');
  zip.file("xl/workbook.xml", patchedWb);
  if (zip.file("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
    const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    zip.file("xl/_rels/workbook.xml.rels", rels.replace(/<Relationship\b[^>]*calcChain\.xml"[^>]*\/>/, ""));
    const ct = await zip.file("[Content_Types].xml")?.async("string");
    if (ct) zip.file("[Content_Types].xml", ct.replace(/<Override\b[^>]*calcChain\.xml"[^>]*\/>/, ""));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
