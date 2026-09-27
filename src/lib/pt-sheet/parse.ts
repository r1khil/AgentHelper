import { PT_SHEET_TABS, type PtTabConfig } from "./config";

/** Pure helpers for the PT sheet reader: which ranges to ask for, and turning Sheets API values into cells. */

export type PtValue = string | number | boolean | null;

export type PtCell = {
  /** A1 reference, e.g. "E5". */
  ref: string;
  col: string;
  /** The column's header label, when the header row has one. */
  label: string | null;
  /** The underlying value (numbers unformatted: 8.3% is 0.083). Null for error cells. */
  v: PtValue;
  /** What the sheet displays, when it differs from `v` ("(8.3%)", "$110.56"). */
  text?: string;
  /** The error a formula shows ("#N/A", "#REF!"); never passed on as a number. */
  error?: string;
};

export type PtRow = { row: number; cells: PtCell[] };

export type PtTab = {
  name: string;
  about: string;
  status: "ok" | "layout_changed";
  /** Required header labels that were not found (status "layout_changed"). */
  missingLabels: string[];
  columns: { col: string; label: string }[];
  rows: PtRow[];
  errorCells: number;
  truncated: boolean;
  /** The tab's id inside the sheet, for links that open that tab. */
  gid?: number;
};

export const ERROR_RE = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!|SPILL!|CALC!)/;

/** Collapse the line breaks and runs of spaces header cells often carry ("Owl Fund \nWeights"). */
export function cleanLabel(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

const norm = (s: unknown) => cleanLabel(s).toLowerCase();

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** A1 notation for a whole tab: the name in single quotes, embedded quotes doubled. */
export function quoteTab(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

/**
 * The ranges to request: allowlisted tabs that exist in the sheet, whole tabs. Anything not on the allowlist is never
 * requested, whatever the sheet contains.
 */
export function rangesFor(presentTitles: string[], tabs: PtTabConfig[] = PT_SHEET_TABS): { present: { tab: PtTabConfig; range: string }[]; missing: string[] } {
  const titles = new Set(presentTitles);
  const present = tabs.filter((t) => titles.has(t.name)).map((tab) => ({ tab, range: quoteTab(tab.name) }));
  const missing = tabs.filter((t) => !titles.has(t.name)).map((t) => t.name);
  return { present, missing };
}

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * Build a tab from the two value grids the Sheets API returns for the same range: `raw` (UNFORMATTED_VALUE) and
 * `shown` (FORMATTED_VALUE). The header row is checked first; if a required label is gone, no rows are returned.
 */
export function parseTab(cfg: PtTabConfig, raw: unknown[][], shown: unknown[][], maxCells: number): PtTab {
  const header = (shown[cfg.headerRow - 1] ?? []).map(cleanLabel);
  const have = new Set(header.map((h) => h.toLowerCase()));
  const missingLabels = cfg.required.filter((l) => !have.has(norm(l)));
  const columns = header.flatMap((label, i) => (label ? [{ col: colLetter(i), label }] : []));
  const base = { name: cfg.name, about: cfg.about, missingLabels, columns, errorCells: 0, truncated: false };
  if (missingLabels.length) return { ...base, status: "layout_changed", rows: [] };

  const labelAt = new Map(columns.map((c) => [c.col, c.label]));
  const rows: PtRow[] = [];
  let count = 0;
  let errorCells = 0;
  let truncated = false;
  const height = Math.max(raw.length, shown.length);
  outer: for (let r = cfg.headerRow; r < height; r++) {
    const rawRow = raw[r] ?? [];
    const shownRow = shown[r] ?? [];
    const cells: PtCell[] = [];
    for (let c = 0; c < Math.max(rawRow.length, shownRow.length); c++) {
      const rv = rawRow[c];
      const sv = shownRow[c];
      if (isEmpty(rv) && isEmpty(sv)) continue;
      if (count >= maxCells) {
        truncated = true;
        if (cells.length) rows.push({ row: r + 1, cells });
        break outer;
      }
      const col = colLetter(c);
      const text = isEmpty(sv) ? undefined : String(sv);
      const cell: PtCell = { ref: `${col}${r + 1}`, col, label: labelAt.get(col) ?? null, v: null };
      const errText = typeof rv === "string" && ERROR_RE.test(rv) ? rv : text && ERROR_RE.test(text) ? text : null;
      if (errText) {
        cell.error = errText.match(ERROR_RE)![0];
        errorCells++;
      } else {
        cell.v = typeof rv === "number" || typeof rv === "boolean" ? rv : isEmpty(rv) ? (text ?? null) : String(rv);
        if (text !== undefined && text !== String(cell.v)) cell.text = text;
      }
      cells.push(cell);
      count++;
    }
    if (cells.length) rows.push({ row: r + 1, cells });
  }
  return { ...base, status: "ok", rows, errorCells, truncated };
}

/** What a reader should see for a cell: the sheet's own display, with accounting negatives "(8.3%)" as "-8.3%". */
export function displayValue(cell: PtCell): string {
  if (cell.error) return `${cell.error} (error)`;
  const s = (cell.text ?? String(cell.v ?? "")).trim();
  const acct = s.match(/^\((.+)\)$/);
  return acct ? `-${acct[1]}` : s;
}

/** Rows holding the ticker as a whole cell value (case-insensitive), e.g. the holding's own row in each tab. */
export function rowsForTicker(tab: PtTab, ticker: string): PtRow[] {
  const t = ticker.trim().toUpperCase();
  return tab.rows.filter((r) => r.cells.some((c) => typeof c.v === "string" && c.v.trim().toUpperCase() === t));
}

/** Plain-text rendering of one tab with cell references, the form Hoot is given; `ticker` keeps only that ticker's rows. */
export function renderTab(tab: PtTab, opts: { ticker?: string } = {}): string {
  const head = `## ${tab.name}`;
  if (tab.status === "layout_changed") return `${head}\nNot read: the tab's layout changed (missing column labels: ${tab.missingLabels.join(", ")}).`;
  const rows = opts.ticker ? rowsForTicker(tab, opts.ticker) : tab.rows;
  const lines = [head, tab.about, `Columns: ${tab.columns.map((c) => `${c.col}=${c.label}`).join(", ")}`];
  for (const r of rows) lines.push(`r${r.row}: ${r.cells.map((c) => `${c.col}=${displayValue(c)}`).join(" | ")}`);
  if (opts.ticker && !rows.length) lines.push(`(No row mentions ${opts.ticker.toUpperCase()}.)`);
  if (tab.truncated) lines.push("(Tab cut short: too many cells.)");
  return lines.join("\n");
}
