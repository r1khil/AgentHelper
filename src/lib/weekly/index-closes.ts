import { DateTime } from "luxon";
import { fmtAccounting } from "@/lib/format";
import { NY } from "@/lib/providers/calendar";

/**
 * The week's daily S&P closes for the deck's YTD chart, whose lines are OF, SPXTR, SVX and SGX. Pure: `indexes.ts`
 * fetches the bars, this merges and lays them out.
 */

export const INDEX_SERIES = [
  { label: "SPXTR", name: "S&P 500 Total Return", yahoo: "^SP500TR", cnbc: ".SPXTR" },
  { label: "SVX", name: "S&P 500 Value", cnbc: ".SVX" },
  { label: "SGX", name: "S&P 500 Growth", cnbc: ".SGX" },
] as const;

export type IndexLabel = (typeof INDEX_SERIES)[number]["label"];
export type Bar = { date: string; close: number };

export type WeekIndexCloses = {
  /** The week's trading days, Monday first. */
  days: string[];
  closes: Record<IndexLabel, Record<string, number | null>>;
  /** Plain-English notes for the email's Checks list: a source that failed, a day with no close. */
  problems: string[];
};

/** Bars from each source for one index, best first; a source that failed is its error message instead. */
export type IndexBars = Record<IndexLabel, (Bar[] | string)[]>;

const shortDay = (iso: string) => DateTime.fromISO(iso, { zone: NY }).toFormat("cccc M/d");

/** Each day's close from the first source that has it, so a later source only fills the first one's gaps. */
export function assembleIndexCloses(days: string[], bars: IndexBars): WeekIndexCloses {
  const closes = {} as WeekIndexCloses["closes"];
  const problems: string[] = [];
  for (const { label } of INDEX_SERIES) {
    const sources = bars[label] ?? [];
    const row: Record<string, number | null> = {};
    for (const day of days) {
      const hit = sources.find((s): s is Bar[] => Array.isArray(s) && s.some((b) => b.date === day));
      row[day] = hit ? hit.find((b) => b.date === day)!.close : null;
    }
    closes[label] = row;
    const missing = days.filter((d) => row[d] === null);
    if (!missing.length) continue;
    const errors = sources.filter((s): s is string => typeof s === "string");
    if (missing.length === days.length && errors.length) problems.push(`Couldn't get the ${label} closes (${errors.join("; ")}).`);
    else problems.push(`No ${label} close for ${missing.map(shortDay).join(", ")}; take it from S&P's site.`);
  }
  return { days, closes, problems };
}

/** The deck's close style: two decimals with thousands separators, "17,411.86". */
const fmtClose = (n: number | null) => (n === null ? "n/a" : fmtAccounting(n, 2));

/**
 * One header row and one row per day, tab-separated so the block pastes into a sheet as columns. Dates are M/D/YYYY,
 * which Google Sheets reads as dates.
 */
export function indexCloseLines(data: WeekIndexCloses): string[] {
  const header = ["Date", ...INDEX_SERIES.map((s) => s.label)].join("\t");
  const rows = data.days.map((day) =>
    [DateTime.fromISO(day, { zone: NY }).toFormat("M/d/yyyy"), ...INDEX_SERIES.map((s) => fmtClose(data.closes[s.label]?.[day] ?? null))].join("\t"),
  );
  return [header, ...rows];
}
