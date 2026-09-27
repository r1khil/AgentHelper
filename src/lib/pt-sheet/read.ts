import "server-only";
import { driveFetch } from "@/lib/drive/http";
import { driveConfigured } from "@/lib/drive/auth";
import { PT_SHEET_CACHE_MS, PT_SHEET_FILE_ID, PT_SHEET_MAX_CELLS_PER_TAB } from "./config";
import { parseTab, rangesFor, type PtTab } from "./parse";

/**
 * Read-only access to the price target sheet. Every request here is a GET, and only the allowlisted tabs are ever
 * requested (see `guard.test.ts`). Nothing is stored: the snapshot lives in memory for a few minutes.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

export type PtSheet = {
  fileId: string;
  name: string;
  url: string;
  /** Last content edit by anyone. Reading the sheet does not move it (Drive's `version` counter does, so it is not used). */
  modifiedTime: string;
  lastModifiedBy: string | null;
  fetchedAt: string;
  tabs: PtTab[];
  /** Allowlisted tabs the sheet no longer has (renamed or deleted). */
  missingTabs: string[];
};

async function getJson<T>(url: string): Promise<T> {
  const res = await driveFetch(url, { method: "GET" });
  return (await res.json()) as T;
}

type ValueRange = { range: string; values?: unknown[][] };

async function batchGet(ranges: string[], render: "UNFORMATTED_VALUE" | "FORMATTED_VALUE"): Promise<ValueRange[]> {
  const u = new URL(`${SHEETS_API}/${PT_SHEET_FILE_ID}/values:batchGet`);
  for (const r of ranges) u.searchParams.append("ranges", r);
  u.searchParams.set("valueRenderOption", render);
  u.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
  u.searchParams.set("majorDimension", "ROWS");
  const j = await getJson<{ valueRanges?: ValueRange[] }>(u.toString());
  return j.valueRanges ?? [];
}

async function fetchSheet(): Promise<PtSheet> {
  const meta = await getJson<{ name: string; modifiedTime: string; webViewLink?: string; lastModifyingUser?: { displayName?: string } }>(
    `${DRIVE_FILES}/${PT_SHEET_FILE_ID}?fields=name,modifiedTime,webViewLink,lastModifyingUser(displayName)&supportsAllDrives=true`,
  );
  const book = await getJson<{ sheets?: { properties: { title: string } }[] }>(`${SHEETS_API}/${PT_SHEET_FILE_ID}?fields=sheets.properties.title`);
  const { present, missing } = rangesFor((book.sheets ?? []).map((s) => s.properties.title));
  const ranges = present.map((p) => p.range);
  const [raw, shown] = ranges.length ? await Promise.all([batchGet(ranges, "UNFORMATTED_VALUE"), batchGet(ranges, "FORMATTED_VALUE")]) : [[], []];
  const tabs = present.map((p, i) => parseTab(p.tab, raw[i]?.values ?? [], shown[i]?.values ?? [], PT_SHEET_MAX_CELLS_PER_TAB));
  return {
    fileId: PT_SHEET_FILE_ID,
    name: meta.name,
    url: meta.webViewLink ?? `https://docs.google.com/spreadsheets/d/${PT_SHEET_FILE_ID}/edit`,
    modifiedTime: meta.modifiedTime,
    lastModifiedBy: meta.lastModifyingUser?.displayName ?? null,
    fetchedAt: new Date().toISOString(),
    tabs,
    missingTabs: missing,
  };
}

const g = globalThis as unknown as { __ptSheet?: { at: number; sheet: PtSheet }; __ptSheetInflight?: Promise<PtSheet> };

export function ptSheetConfigured() {
  return driveConfigured();
}

/** The sheet, from memory when read in the last few minutes; `fresh` skips the cache. Concurrent callers share one read. */
export async function readPtSheet(opts: { fresh?: boolean } = {}): Promise<PtSheet> {
  const hit = g.__ptSheet;
  if (!opts.fresh && hit && Date.now() - hit.at < PT_SHEET_CACHE_MS) return hit.sheet;
  if (g.__ptSheetInflight) return g.__ptSheetInflight;
  const p = fetchSheet()
    .then((sheet) => {
      g.__ptSheet = { at: Date.now(), sheet };
      return sheet;
    })
    .finally(() => {
      g.__ptSheetInflight = undefined;
    });
  g.__ptSheetInflight = p;
  return p;
}
