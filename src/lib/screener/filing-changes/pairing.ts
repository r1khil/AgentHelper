// Pure: which earlier filing each section of a new 10-K or 10-Q is compared with.
//   10-K Items 1A, 7, 1, 7A, 9A   vs the prior 10-K's same Item.
//   10-Q Item 2 (MD&A)            vs the same quarter last year; sentences already in (or already gone from) the
//                                    immediately prior filing's MD&A are suppressed, so new text is flagged once.
//   10-Q Item 1A (Part II)        vs the most recent prior filing, 10-K or 10-Q, whose Item 1A says something
//                                    (walking back past "no material changes" boilerplate); added sentences only.
//   10-Q Items 3 and 4            vs the most recent prior 10-Q's same Item (a 10-K's 7A and 9A are far longer
//                                    documents, so comparing with them would read as a shrink every first quarter).
import type { PeriodicForm } from "./sections";

export type PeriodicFiling = { accession: string; form: string; filedAt: string; reportDate?: string; url: string };

export type SectionRef = { filing: PeriodicFiling; item: string };

export type Comparison = {
  /** The Item in the new filing, as stored in filing_changes.item. */
  item: string;
  /** 1A first, then MD&A, then the rest. */
  priority: 1 | 2 | 3;
  /** Candidates in order: the first whose section says something is used (only 10-Q Item 1A has more than one). */
  priors: SectionRef[];
  suppress: SectionRef | null;
  addedOnly: boolean;
};

export const TEN_K_ITEMS = ["1A", "7", "1", "7A", "9A"] as const;
export const TEN_Q_ITEMS = ["1A", "2", "3", "4"] as const;

/** What people call each Item, for prompts and titles. */
export const ITEM_NAMES: Record<PeriodicForm, Record<string, string>> = {
  "10-K": { "1": "Business", "1A": "Risk Factors", "7": "Management's Discussion and Analysis", "7A": "Quantitative and Qualitative Disclosures About Market Risk", "9A": "Controls and Procedures" },
  "10-Q": { "1A": "Risk Factors", "2": "Management's Discussion and Analysis", "3": "Quantitative and Qualitative Disclosures About Market Risk", "4": "Controls and Procedures" },
};

export function itemPriority(form: PeriodicForm, item: string): 1 | 2 | 3 {
  if (item === "1A") return 1;
  if ((form === "10-K" && item === "7") || (form === "10-Q" && item === "2")) return 2;
  return 3;
}

/** 10-K or 10-Q (amendments excluded: a 10-K/A is usually only Part III). */
export function periodicForm(form: string): PeriodicForm | null {
  const f = form.toUpperCase();
  return f === "10-K" || f === "10-Q" ? f : null;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Earlier 10-K and 10-Q filings than `current`, newest first. */
export function earlierFilings(current: PeriodicFiling, filings: PeriodicFiling[]): PeriodicFiling[] {
  return filings
    .filter((f) => periodicForm(f.form) && f.accession !== current.accession && (f.filedAt < current.filedAt || (f.filedAt === current.filedAt && (f.reportDate ?? "") < (current.reportDate ?? ""))))
    .sort((a, b) => (a.filedAt === b.filedAt ? (b.reportDate ?? "").localeCompare(a.reportDate ?? "") : b.filedAt.localeCompare(a.filedAt)));
}

/** The 10-Q for the same quarter a year earlier: period end about a year back, or failing a period date, filed about a year back. */
export function sameQuarterLastYear(current: PeriodicFiling, earlier: PeriodicFiling[]): PeriodicFiling | null {
  const qs = earlier.filter((f) => periodicForm(f.form) === "10-Q");
  if (current.reportDate) {
    const hit = qs.find((f) => f.reportDate && Math.abs(days(f.reportDate, current.reportDate!) - 365) <= 31);
    if (hit) return hit;
  }
  return qs.find((f) => Math.abs(days(f.filedAt, current.filedAt) - 365) <= 45) ?? null;
}

/** Every comparison a new periodic filing needs, in priority order. Empty for other forms or with no history. */
export function planComparisons(current: PeriodicFiling, filings: PeriodicFiling[]): Comparison[] {
  const form = periodicForm(current.form);
  if (!form) return [];
  const earlier = earlierFilings(current, filings);
  const out: Comparison[] = [];
  if (form === "10-K") {
    const prior = earlier.find((f) => periodicForm(f.form) === "10-K");
    if (!prior) return [];
    for (const item of TEN_K_ITEMS) out.push({ item, priority: itemPriority(form, item), priors: [{ filing: prior, item }], suppress: null, addedOnly: false });
  } else {
    const immediate = earlier[0];
    const lastQ = earlier.find((f) => periodicForm(f.form) === "10-Q");
    // Item 1A: walk back through 10-Qs to the latest 10-K, whichever first has risk factors to compare with.
    const lastK = earlier.findIndex((f) => periodicForm(f.form) === "10-K");
    const riskPriors = (lastK >= 0 ? earlier.slice(0, lastK + 1) : earlier.slice(0, 3)).map((filing) => ({ filing, item: "1A" }));
    if (riskPriors.length) out.push({ item: "1A", priority: 1, priors: riskPriors, suppress: null, addedOnly: true });
    const yearAgo = sameQuarterLastYear(current, earlier);
    if (yearAgo) {
      const suppress = immediate && immediate.accession !== yearAgo.accession ? { filing: immediate, item: periodicForm(immediate.form) === "10-K" ? "7" : "2" } : null;
      out.push({ item: "2", priority: 2, priors: [{ filing: yearAgo, item: "2" }], suppress, addedOnly: false });
    }
    if (lastQ) for (const item of ["3", "4"]) out.push({ item, priority: 3, priors: [{ filing: lastQ, item }], suppress: null, addedOnly: false });
  }
  return out.sort((a, b) => a.priority - b.priority);
}
