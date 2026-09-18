// Pure MIME helpers shared by the server-only extractor and the ingest planner (which runs in tests too).
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const XLSM_MIME = "application/vnd.ms-excel.sheet.macroEnabled.12";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export const GOOGLE = {
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

const EXTRACTABLE = new Set(["application/pdf", DOCX_MIME, PPTX_MIME, XLSX_MIME, XLSM_MIME, "application/vnd.ms-excel", "application/json", GOOGLE.doc, GOOGLE.sheet, GOOGLE.slides]);

/** Whether extractText / fetchAndExtract can turn this file into text. Pure; used by the ingest planner. */
export function isExtractableMime(mimeType: string, name: string): boolean {
  const mime = effectiveMime(mimeType, name);
  return EXTRACTABLE.has(mime) || mime.startsWith("text/");
}

