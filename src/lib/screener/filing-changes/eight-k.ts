// Pure: 8-K item codes that signal trouble. EDGAR's submissions list carries each filing's items ("2.02,9.01"), so
// these are flagged from the list alone, with no document fetch and no model.
import { EIGHT_K_ITEMS, type EightKCode } from "./labels";

/** The trouble codes in an 8-K's items field, in the order EDGAR lists them, without repeats. */
export function troubleItems(items: string | null | undefined): EightKCode[] {
  const out: EightKCode[] = [];
  for (const m of (items ?? "").matchAll(/\d+\.\d{2}/g)) {
    const code = m[0] as EightKCode;
    if (Object.hasOwn(EIGHT_K_ITEMS, code) && !out.includes(code)) out.push(code);
  }
  return out;
}

/** What filing_changes stores for one trouble code: its item ("8-K 4.01"), label key and summary. */
export function eightKRow(code: EightKCode): { item: string; label: string; summary: string } {
  const def = EIGHT_K_ITEMS[code];
  return { item: `8-K ${code}`, label: def.label, summary: `Item ${code}: ${def.text}` };
}
