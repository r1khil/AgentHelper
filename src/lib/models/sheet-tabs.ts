/*
 * Which of a workbook's sheets get a tab in the mapping editor, and which wait in the "More sheets" menu.
 * Analyst models run to 20+ sheets (cover, charts, comps, audit tabs); a tab for each wraps into a wall of pills.
 *
 * The rule, in order:
 * 1. Sheets that already have mapped line items (most mappings first).
 * 2. The model's primary sheets, by name: DCF, Model, Summary, the three statements (IS/BS/CF), Valuation,
 *    Assumptions. An exact name ("Model") beats one that only contains it ("Model Output").
 * 3. The rest in workbook order, to fill the slots.
 * The chosen sheet always has a tab: picked from the menu, it joins the row as the active tab.
 * Tabs keep the workbook's order, so the row reads like the file.
 */

/** Tabs shown before the menu, not counting a chosen sheet that isn't among them. */
export const SHEET_TAB_LIMIT = 4;

// Primary-sheet names, most important first. Each is tried against the whole name (exact) and as a word in it.
const PRIMARY: RegExp[] = [
  /dcf|discounted cash flows?/,
  /(operating |financial |3[- ]statement |three[- ]statement )?model/,
  /summary|overview|output|dashboard/,
  /is|income statement|p ?& ?l|profit (and|&) loss/,
  /bs|balance sheet/,
  /cf|cfs|cash flows?( statement)?/,
  /valuation/,
  /assumptions?|inputs?|drivers/,
];
const EXACT = PRIMARY.map((re) => new RegExp(`^(${re.source})$`, "i"));
const WORD = PRIMARY.map((re) => new RegExp(`(^|[^a-z0-9])(${re.source})($|[^a-z0-9])`, "i"));

/** A primary sheet's rank (lower matters more), or null when the name isn't one. */
export function primarySheetRank(name: string): number | null {
  const n = name.trim();
  let best: number | null = null;
  for (let i = 0; i < PRIMARY.length; i++) {
    const r = EXACT[i].test(n) ? i * 2 : WORD[i].test(n) ? i * 2 + 1 : null;
    if (r !== null && (best === null || r < best)) best = r;
  }
  return best;
}

/** Sheet indices, most important first (the rule above, without the chosen sheet). */
export function rankSheets(names: string[], mappedCount: (name: string) => number): number[] {
  const key = (i: number) => {
    const mapped = mappedCount(names[i]);
    const primary = primarySheetRank(names[i]);
    return mapped > 0 ? [0, -mapped] : primary !== null ? [1, primary] : [2, 0];
  };
  return names
    .map((_, i) => i)
    .sort((a, b) => {
      const [ga, ra] = key(a);
      const [gb, rb] = key(b);
      return ga - gb || ra - rb || a - b;
    });
}

/** The sheet to open first: the most important one. */
export function defaultSheetIndex(names: string[], mappedCount: (name: string) => number): number {
  return names.length ? rankSheets(names, mappedCount)[0] : 0;
}

/**
 * Split the sheets into tabs and menu, both as indices in workbook order. When the menu would hold only one sheet,
 * it gets a tab instead.
 */
export function splitSheetTabs(names: string[], mappedCount: (name: string) => number, selected: number, limit = SHEET_TAB_LIMIT): { tabs: number[]; more: number[] } {
  const all = names.map((_, i) => i);
  if (names.length <= limit + 1) return { tabs: all, more: [] };
  const shown = new Set(rankSheets(names, mappedCount).slice(0, limit));
  if (selected >= 0 && selected < names.length) shown.add(selected);
  return { tabs: all.filter((i) => shown.has(i)), more: all.filter((i) => !shown.has(i)) };
}
