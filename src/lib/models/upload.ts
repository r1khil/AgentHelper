// Shared by the browser upload form and the server actions. No server-only imports here.

export const MODEL_BUCKET = "models";
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;

export type ModelExt = "xlsx" | "xlsm";

export const MODEL_CONTENT_TYPES: Record<ModelExt, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
};

export type ModelFileCheck = { ok: true; ext: ModelExt } | { ok: false; error: string };

/** Same rules the old FormData action enforced, now run in the browser before signing and again on the server. */
export function validateModelFile(name: string, size: number): ModelFileCheck {
  if (!name) return { ok: false, error: "Choose an .xlsx file" };
  const m = /\.(xlsx|xlsm)$/i.exec(name);
  if (!m) return { ok: false, error: "Only .xlsx or .xlsm files" };
  if (!Number.isFinite(size) || size < 0) return { ok: false, error: "Could not read the file size" };
  if (size === 0) return { ok: false, error: "The file is empty" };
  if (size > MAX_MODEL_BYTES) return { ok: false, error: "File is larger than 50MB" };
  return { ok: true, ext: m[1].toLowerCase() as ModelExt };
}

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const STAGED = new RegExp(`^staging/(${UUID})/(${UUID})\\.(xlsx|xlsm)$`);

/** Where a browser upload lands before finalize moves it under `<holdingId>/v<n>-<ts>.<ext>`. */
export function stagedModelPath(holdingId: string, ext: ModelExt) {
  return `staging/${holdingId}/${crypto.randomUUID()}.${ext}`;
}

/** Accepts only a path this module produced for the given holding, so finalize can never touch another object. */
export function parseStagedModelPath(path: string, holdingId: string): { ext: ModelExt } | null {
  const m = STAGED.exec(path);
  if (!m || m[1].toLowerCase() !== holdingId.toLowerCase()) return null;
  return { ext: m[3].toLowerCase() as ModelExt };
}
