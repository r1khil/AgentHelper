/** Shared limits for analyst document uploads (used by the server action, the upload route, and the form). */
export const ALLOWED_UPLOAD_EXTENSIONS = ["pdf", "docx", "pptx", "xlsx", "xlsm", "txt", "md", "csv"] as const;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const UPLOAD_ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(",");
