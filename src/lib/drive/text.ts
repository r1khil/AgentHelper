import JSZip from "jszip";
import type { WorkbookInfo } from "@/lib/excel/read";

/** Upper bound on cached extracted text per file. */
export const MAX_TEXT_CHARS = 400_000;

export function capText(text: string, max = MAX_TEXT_CHARS) {
  const t = text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > max ? `${t.slice(0, max)}\n[truncated]` : t;
}

export function windowText(text: string, offset: number, maxChars: number) {
  const start = Math.max(0, Math.min(offset, text.length));
  const end = Math.min(text.length, start + maxChars);
  return { text: text.slice(start, end), offset: start, totalChars: text.length, hasMore: end < text.length };
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
}

/** Slide text from a .pptx: one block per slide, one line per paragraph. */
export async function pptxToText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .map((name) => ({ name, n: Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1] ?? NaN) }))
    .filter((s) => !Number.isNaN(s.n))
    .sort((a, b) => a.n - b.n);
  const out: string[] = [];
  for (const s of slides) {
    const xml = await zip.file(s.name)!.async("string");
    const paragraphs = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
      .map((m) => [...m[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join(""))
      .filter((p) => p.trim());
    out.push(`--- Slide ${s.n} ---\n${paragraphs.join("\n")}`);
  }
  return out.join("\n\n");
}

/** Compact per-sheet rendering of a workbook: values only, cell refs kept so the agent can point at cells. */
export function workbookToText(info: WorkbookInfo): string {
  return info.sheets
    .map((sheet) => {
      const rows = sheet.rows.map((r) => `r${r.r}: ${r.cells.filter((c) => c.v !== null && c.v !== "").map((c) => `${c.col}=${fmtCell(c.v)}`).join(" | ")}`).filter((l) => !/: $/.test(l));
      return `## Sheet ${sheet.name} (${sheet.rowCount} rows x ${sheet.colCount} cols)\n${rows.join("\n")}`;
    })
    .join("\n\n");
}

function fmtCell(v: string | number | boolean | null) {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toFixed(4));
  return String(v).replace(/\s+/g, " ").trim();
}
