import "server-only";
import { readWorkbook } from "@/lib/excel/read";
import { downloadFile, exportFile } from "./read";
import { pptxToText, workbookToText } from "./text";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const XLSM_MIME = "application/vnd.ms-excel.sheet.macroEnabled.12";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

const GOOGLE = {
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
};

const BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: DOCX_MIME,
  pptx: PPTX_MIME,
  xlsx: XLSX_MIME,
  xlsm: XLSM_MIME,
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
};

/** Content type to parse with, falling back to the file extension when Drive reports a generic type. */
export function effectiveMime(mimeType: string, name: string) {
  if (mimeType && mimeType !== "application/octet-stream" && !mimeType.startsWith("application/x-")) return mimeType;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return BY_EXT[ext] ?? mimeType;
}

/** Plain text from a downloaded file. Throws with an "unsupported: <mime>" message for types we do not parse. */
export async function extractText(buffer: Buffer, mimeType: string, name: string): Promise<string> {
  const mime = effectiveMime(mimeType, name);
  if (mime === "application/pdf") {
    const { extractText: pdfText } = await import("unpdf");
    const r = await pdfText(new Uint8Array(buffer), { mergePages: true });
    return r.text;
  }
  if (mime === DOCX_MIME) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (mime === PPTX_MIME) return pptxToText(buffer);
  if (mime === XLSX_MIME || mime === XLSM_MIME || mime === "application/vnd.ms-excel") return workbookToText(await readWorkbook(buffer));
  if (mime.startsWith("text/") || mime === "application/json") return buffer.toString("utf8");
  throw new Error(`unsupported: ${mime}`);
}

/** Fetch a file's content from Drive (export for Google-native types, download otherwise) and extract its text. */
export async function fetchAndExtract(row: { id: string; name: string; mimeType: string; size: number | null }): Promise<string> {
  if (row.mimeType === GOOGLE.doc) {
    try {
      return (await exportFile(row.id, "text/markdown")).toString("utf8");
    } catch {
      return (await exportFile(row.id, "text/plain")).toString("utf8");
    }
  }
  if (row.mimeType === GOOGLE.sheet) return workbookToText(await readWorkbook(await exportFile(row.id, XLSX_MIME)));
  if (row.mimeType === GOOGLE.slides) return (await exportFile(row.id, "text/plain")).toString("utf8");
  if (row.mimeType.startsWith("application/vnd.google-apps.")) throw new Error(`unsupported: ${row.mimeType}`);
  if (row.size !== null && row.size > MAX_DOWNLOAD_BYTES) throw new Error(`skipped: file is larger than ${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)}MB`);
  return extractText(await downloadFile(row.id), row.mimeType, row.name);
}
