import type { ChecklistItem, CheckStatus } from "@/db/schema";
import { fmtPct, fmtUsdCompact } from "@/lib/format";
import { comparableShares, type DerivedYear } from "./line-items";
import { freeCashFlow, roic } from "./metrics";

/*
 * The value-trap checklist (Module 6): fourteen checks computed in code from reported figures, Form 4s and the filing
 * flags. Each shows pass, watch, fail, or no_data; a check whose inputs are missing is always no_data, never a pass
 * or a fail. Beneish's M-score can only raise a watch. Details are short plain English with the app's formats
 * (negatives in parentheses, percentages for rates).
 */

export const CHECKLIST_DEFS = [
  { key: "roicTrend", label: "ROIC trend", rule: "Fails when ROIC fell in 3 of the last 4 years." },
  { key: "grossMarginTrend", label: "Gross margin trend", rule: "Fails when gross margin fell in 3 of the last 4 years." },
  { key: "cashConversion", label: "Cash conversion", rule: "Fails when operating cash flow is under 80% of net income over 3 years." },
  { key: "receivables", label: "Receivables vs revenue", rule: "Fails when receivables grow more than 1.5× revenue growth (and 5 points faster)." },
  { key: "inventory", label: "Inventory vs revenue", rule: "Fails when inventory grows more than 1.5× revenue growth (and 5 points faster)." },
  { key: "capitalizedCosts", label: "Capitalized costs", rule: "Fails when capitalized software rose as a share of total spend in each of the last 2 years." },
  { key: "goodwill", label: "Goodwill", rule: "Fails when goodwill is over 40% of total assets; watch over 25%." },
  { key: "debtFundedBuybacks", label: "Debt-funded buybacks", rule: "Fails when 3 years of buybacks exceed free cash flow while net debt rose." },
  { key: "interestCoverage", label: "Interest coverage", rule: "Fails when EBIT is under 3× interest expense; watch under 5×." },
  { key: "debtMaturities", label: "Debt maturities", rule: "Fails when over 30% of debt is due within 2 years; watch over 20%." },
  { key: "stockCompDilution", label: "Stock-comp dilution", rule: "Fails when stock comp is over 25% of free cash flow or the share count grows over 2% a year." },
  { key: "beneishM", label: "Beneish M-score", rule: "Watch when M is above (1.78); never a fail." },
  { key: "insiderSelling", label: "Insider selling", rule: "Fails when officers sold over $1M net in the open market in 6 months, leaving out 10b5-1 plan sales; watch for any net selling." },
  { key: "filingChanges", label: "Filing changes", rule: "Fails on any unresolved filing-change or 8-K flag in the last 12 months." },
] as const;

export type ChecklistKey = (typeof CHECKLIST_DEFS)[number]["key"];

export type InsiderSummary = { netUsd: number; soldUsd: number; boughtUsd: number; planSalesExcluded: number; officers: string[]; unparsed: number; since: string };
export type FilingFlagCounts = { openFilingFlags: number; eightKFlags12m: number };

export type ChecklistInput = {
  /** Fiscal years, newest first (companyfacts through annualSeries). */
  years: DerivedYear[];
  insider: InsiderSummary | null;
  filingFlags: FilingFlagCounts | null;
};

const ok = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const pct = (x: number, digits = 1) => fmtPct(x * 100, digits);
const times = (x: number) => (x < 0 ? `(${Math.abs(x).toFixed(1)}×)` : `${x.toFixed(1)}×`);
const label = (key: ChecklistKey) => CHECKLIST_DEFS.find((d) => d.key === key)!.label;
const item = (key: ChecklistKey, status: CheckStatus, detail: string): ChecklistItem => ({ key, label: label(key), status, detail });

/** Year-over-year declines across a series (newest first); null when fewer than `need` values. */
function declines(series: (number | null)[], need: number): { down: number; changes: number; first: number; last: number } | null {
  const vals = series.slice(0, need);
  if (vals.length < need || !vals.every(ok)) return null;
  let down = 0;
  for (let i = 0; i < vals.length - 1; i++) if (vals[i]! < vals[i + 1]!) down++;
  return { down, changes: vals.length - 1, first: vals[vals.length - 1]!, last: vals[0]! };
}

function trendCheck(key: ChecklistKey, name: string, series: (number | null)[]): ChecklistItem {
  const d = declines(series, 5);
  if (!d) return item(key, "no_data", `Fewer than five years of ${name}`);
  const status: CheckStatus = d.down >= 3 ? "fail" : d.down === 2 ? "watch" : "pass";
  return item(key, status, `${name[0].toUpperCase()}${name.slice(1)} fell in ${d.down} of the last ${d.changes} years; ${pct(d.first)} ${d.changes} years ago, ${pct(d.last)} in the latest year`);
}

const growth = (a: number | null, b: number | null) => (ok(a) && ok(b) && b > 0 ? a / b - 1 : null);

function workingCapitalCheck(key: ChecklistKey, name: string, cur: number | null, prev: number | null, rev0: number | null, rev1: number | null): ChecklistItem {
  const g = growth(cur, prev);
  const rg = growth(rev0, rev1);
  if (g === null || rg === null) return item(key, "no_data", `No ${name} or revenue for the last two years`);
  const excess = g - rg;
  const status: CheckStatus = g > 1.5 * Math.max(rg, 0) && excess > 0.05 ? "fail" : excess > 0.02 ? "watch" : "pass";
  return item(key, status, `${name[0].toUpperCase()}${name.slice(1)} ${g >= 0 ? "grew" : "fell"} ${pct(Math.abs(g))} against revenue ${rg >= 0 ? "growth" : "decline"} of ${pct(Math.abs(rg))}`);
}

/** Beneish's eight-variable M-score for the latest year against the prior one, or null when an input is missing. */
export function beneishM(y0: DerivedYear, y1: DerivedYear): number | null {
  const need = [y0.receivables, y1.receivables, y0.revenue, y1.revenue, y0.grossProfit, y1.grossProfit, y0.currentAssets, y1.currentAssets, y0.ppe, y1.ppe, y0.totalAssets, y1.totalAssets, y0.depreciation, y1.depreciation, y0.sga, y1.sga, y0.currentLiabilities, y1.currentLiabilities, y0.longTermDebt, y1.longTermDebt, y0.netIncome, y0.operatingCashFlow];
  if (!need.every(ok)) return null;
  const [r0, r1, s0, s1] = [y0.receivables!, y1.receivables!, y0.revenue!, y1.revenue!];
  if (s0 <= 0 || s1 <= 0 || r1 <= 0 || y0.totalAssets! <= 0 || y1.totalAssets! <= 0) return null;
  const dsri = r0 / s0 / (r1 / s1);
  const gm0 = y0.grossProfit! / s0;
  const gm1 = y1.grossProfit! / s1;
  const gmi = gm0 !== 0 ? gm1 / gm0 : null;
  const aq = (y: DerivedYear) => 1 - (y.currentAssets! + y.ppe!) / y.totalAssets!;
  const aqi = aq(y1) !== 0 ? aq(y0) / aq(y1) : null;
  const sgi = s0 / s1;
  const dep = (y: DerivedYear) => y.depreciation! / (y.depreciation! + y.ppe!);
  const depi = dep(y0) !== 0 ? dep(y1) / dep(y0) : null;
  const sgai = y1.sga! / s1 !== 0 ? y0.sga! / s0 / (y1.sga! / s1) : null;
  const lev = (y: DerivedYear) => (y.currentLiabilities! + y.longTermDebt!) / y.totalAssets!;
  const lvgi = lev(y1) !== 0 ? lev(y0) / lev(y1) : null;
  const tata = (y0.netIncome! - y0.operatingCashFlow!) / y0.totalAssets!;
  if ([gmi, aqi, depi, sgai, lvgi].some((x) => x === null || !Number.isFinite(x))) return null;
  return -4.84 + 0.92 * dsri + 0.528 * gmi! + 0.404 * aqi! + 0.892 * sgi + 0.115 * depi! - 0.172 * sgai! + 4.679 * tata - 0.327 * lvgi!;
}

/** Every check, in CHECKLIST_DEFS order. */
export function computeChecklist(input: ChecklistInput): ChecklistItem[] {
  const ys = input.years;
  const [y0, y1, y2, y3] = ys;
  const out: ChecklistItem[] = [];

  out.push(trendCheck("roicTrend", "ROIC", ys.slice(0, 5).map(roic)));
  out.push(trendCheck("grossMarginTrend", "gross margin", ys.slice(0, 5).map((y) => (ok(y.grossProfit) && ok(y.revenue) && y.revenue > 0 ? y.grossProfit / y.revenue : null))));

  // Cash conversion over three years.
  {
    const three = ys.slice(0, 3);
    if (three.length < 3 || !three.every((y) => ok(y.operatingCashFlow) && ok(y.netIncome))) out.push(item("cashConversion", "no_data", "Fewer than three years of cash flow and net income"));
    else {
      const ocf = three.reduce((s, y) => s + y.operatingCashFlow!, 0);
      const ni = three.reduce((s, y) => s + y.netIncome!, 0);
      if (ni <= 0) out.push(item("cashConversion", "watch", `Net income over three years was ${fmtUsdCompact(ni)}, so conversion isn't meaningful; operating cash flow was ${fmtUsdCompact(ocf)}`));
      else out.push(item("cashConversion", ocf / ni < 0.8 ? "fail" : "pass", `Operating cash flow was ${pct(ocf / ni, 0)} of net income over three years`));
    }
  }

  out.push(workingCapitalCheck("receivables", "receivables", y0?.receivables ?? null, y1?.receivables ?? null, y0?.revenue ?? null, y1?.revenue ?? null));
  out.push(workingCapitalCheck("inventory", "inventory", y0?.inventory ?? null, y1?.inventory ?? null, y0?.revenue ?? null, y1?.revenue ?? null));

  // Capitalized software as a share of total spend (capitalized + R&D + SG&A).
  {
    const share = (y: DerivedYear | undefined) => {
      if (!y || !ok(y.capitalizedSoftware) || (!ok(y.researchAndDevelopment) && !ok(y.sga))) return null;
      const total = y.capitalizedSoftware + (y.researchAndDevelopment ?? 0) + (y.sga ?? 0);
      return total > 0 ? y.capitalizedSoftware / total : null;
    };
    const [a, b, c] = [share(y0), share(y1), share(y2)];
    if (a === null || b === null) out.push(item("capitalizedCosts", "no_data", "No capitalized software reported for the last two years"));
    else {
      const roseTwice = c !== null && a > b && b > c;
      const status: CheckStatus = roseTwice && a - c! >= 0.01 ? "fail" : a > b ? "watch" : "pass";
      out.push(item("capitalizedCosts", status, `Capitalized software was ${pct(a)} of total spend, against ${pct(b)} a year earlier${c !== null ? ` and ${pct(c)} two years earlier` : ""}`));
    }
  }

  // Goodwill.
  if (!y0 || !ok(y0.totalAssets) || y0.totalAssets <= 0) out.push(item("goodwill", "no_data", "No total assets for the latest year"));
  else if (!ok(y0.goodwill)) out.push(item("goodwill", "no_data", "No goodwill line reported"));
  else {
    const s = y0.goodwill / y0.totalAssets;
    out.push(item("goodwill", s > 0.4 ? "fail" : s > 0.25 ? "watch" : "pass", `Goodwill is ${pct(s)} of total assets`));
  }

  // Buybacks against free cash flow and net debt over three years.
  {
    const three = ys.slice(0, 3);
    const nd = (y: DerivedYear | undefined) => (y && ok(y.debt) ? y.debt - (y.cash ?? 0) : null);
    const fcfs = three.map(freeCashFlow);
    if (three.length < 3 || !three.every((y) => ok(y.buybacks)) || !fcfs.every(ok) || nd(y0) === null || nd(y3) === null) out.push(item("debtFundedBuybacks", "no_data", "Fewer than three years of buybacks, free cash flow and net debt"));
    else {
      const bb = three.reduce((s, y) => s + y.buybacks!, 0);
      const fcf = (fcfs as number[]).reduce((s, x) => s + x, 0);
      const rose = nd(y0)! > nd(y3)!;
      const status: CheckStatus = bb <= 0 ? "pass" : bb > fcf && rose ? "fail" : bb > fcf ? "watch" : "pass";
      out.push(item("debtFundedBuybacks", status, `Buybacks of ${fmtUsdCompact(bb)} against free cash flow of ${fmtUsdCompact(fcf)} over three years; net debt ${rose ? "rose" : "did not rise"} (${fmtUsdCompact(nd(y3))} to ${fmtUsdCompact(nd(y0))})`));
    }
  }

  // Interest coverage.
  if (!y0 || !ok(y0.ebit) || !ok(y0.interestExpense)) out.push(item("interestCoverage", "no_data", "No operating income or interest expense for the latest year"));
  else if (y0.interestExpense <= 0) out.push(item("interestCoverage", "pass", "No interest expense reported for the latest year"));
  else {
    const c = y0.ebit / y0.interestExpense;
    out.push(item("interestCoverage", c < 3 ? "fail" : c < 5 ? "watch" : "pass", `EBIT covers interest ${times(c)}`));
  }

  // Maturities.
  if (!y0 || !ok(y0.debt)) out.push(item("debtMaturities", "no_data", "No debt figures for the latest year"));
  else if (y0.debt <= 0) out.push(item("debtMaturities", "pass", "No debt"));
  else if (!ok(y0.debtDueYear1) || !ok(y0.debtDueYear2)) out.push(item("debtMaturities", "no_data", "No maturity schedule reported"));
  else {
    const s = (y0.debtDueYear1 + y0.debtDueYear2) / y0.debt;
    out.push(item("debtMaturities", s > 0.3 ? "fail" : s > 0.2 ? "watch" : "pass", `${pct(s)} of debt (${fmtUsdCompact(y0.debtDueYear1 + y0.debtDueYear2)}) is due within two years`));
  }

  // Stock comp against free cash flow, and share-count growth.
  {
    const fcf = y0 ? freeCashFlow(y0) : null;
    const sbc = y0?.stockComp ?? null;
    const sh = comparableShares(y0, y3);
    const cagr = sh ? (sh[0] / sh[1]) ** (1 / 3) - 1 : null;
    const sbcShare = ok(sbc) && ok(fcf) && fcf > 0 ? sbc / fcf : null;
    const sbcOverFcf = ok(sbc) && ok(fcf) && fcf <= 0 && sbc > 0;
    if (sbcShare === null && !sbcOverFcf && cagr === null) out.push(item("stockCompDilution", "no_data", "No stock comp, free cash flow or share counts"));
    else {
      const fail = sbcOverFcf || (sbcShare !== null && sbcShare > 0.25) || (cagr !== null && cagr > 0.02);
      const watch = (sbcShare !== null && sbcShare > 0.15) || (cagr !== null && cagr > 0.01);
      const parts = [
        sbcOverFcf ? `Stock comp of ${fmtUsdCompact(sbc)} with free cash flow of ${fmtUsdCompact(fcf)}` : sbcShare !== null ? `Stock comp is ${pct(sbcShare)} of free cash flow` : null,
        cagr !== null ? `shares ${cagr >= 0 ? "grew" : "shrank"} ${pct(Math.abs(cagr))} a year over three years` : null,
      ].filter(Boolean);
      const detail = parts.join("; ");
      out.push(item("stockCompDilution", fail ? "fail" : watch ? "watch" : "pass", detail[0].toUpperCase() + detail.slice(1)));
    }
  }

  // Beneish M (watch only).
  {
    const m = y0 && y1 ? beneishM(y0, y1) : null;
    if (m === null) out.push(item("beneishM", "no_data", "Missing an input to the M-score (receivables, PP&E, SG&A, depreciation or debt)"));
    else out.push(item("beneishM", m > -1.78 ? "watch" : "pass", `M-score is ${m < 0 ? `(${Math.abs(m).toFixed(2)})` : m.toFixed(2)}; above (1.78) suggests earnings may be overstated`));
  }

  // Insider selling.
  if (!input.insider) out.push(item("insiderSelling", "no_data", "Form 4 filings unavailable"));
  else {
    const s = input.insider;
    const plan = s.planSalesExcluded ? `; ${s.planSalesExcluded} 10b5-1 plan sale${s.planSalesExcluded === 1 ? "" : "s"} left out` : "";
    const partial = s.unparsed ? `; ${s.unparsed} filing${s.unparsed === 1 ? "" : "s"} couldn't be read` : "";
    const status: CheckStatus = s.netUsd > 1_000_000 ? "fail" : s.netUsd > 0 ? "watch" : "pass";
    const what = s.netUsd > 0 ? `Officers sold ${fmtUsdCompact(s.netUsd)} net in the open market` : s.netUsd < 0 ? `Officers bought ${fmtUsdCompact(-s.netUsd)} net in the open market` : "No open-market officer trades";
    out.push(item("insiderSelling", status, `${what} in six months${plan}${partial}`));
  }

  // Filing changes.
  if (!input.filingFlags) out.push(item("filingChanges", "no_data", "Filing-change flags unavailable"));
  else {
    const { openFilingFlags: a, eightKFlags12m: b } = input.filingFlags;
    const detail = a || b ? `${a} unresolved filing-change flag${a === 1 ? "" : "s"} and ${b} 8-K flag${b === 1 ? "" : "s"} in the last 12 months` : "No unresolved filing-change or 8-K flags in the last 12 months";
    out.push(item("filingChanges", a || b ? "fail" : "pass", detail));
  }
  return out;
}

/** Unresolved filing-change and 8-K flags on a ticker from the last twelve months (the flags table). */
async function filingFlagCounts(ticker: string): Promise<FilingFlagCounts | null> {
  try {
    const [{ db }, { flags }, { and, eq, gte, isNull, sql }] = await Promise.all([import("@/db/client"), import("@/db/schema"), import("drizzle-orm")]);
    const since = new Date(Date.now() - 365 * 86_400_000);
    const rows = await db
      .select({ kind: flags.kind, n: sql<number>`count(*)::int` })
      .from(flags)
      .where(and(eq(flags.ticker, ticker.toUpperCase()), isNull(flags.dismissedAt), gte(flags.createdAt, since)))
      .groupBy(flags.kind);
    const n = (kind: string) => rows.find((r) => r.kind === kind)?.n ?? 0;
    return { openFilingFlags: n("filing_change"), eightKFlags12m: n("filing_8k") };
  } catch {
    return null;
  }
}

/**
 * The checklist for one company: its companyfacts history, officers' Form 4s from the last six months, and the
 * filing flags. `filingFlags` can be passed in (the filing-change detector owns those tables); by default it is read.
 */
export async function loadValueTrapChecklist(ticker: string, cik: string, opts: { filingFlags?: FilingFlagCounts | null } = {}): Promise<ChecklistItem[]> {
  const [{ getCompanyFacts }, { getInsiderFilingsSince, netOfficerSales }, { annualSeries }] = await Promise.all([import("@/lib/providers/edgar"), import("@/lib/providers/edgar-form4"), import("./line-items")]);
  const since = new Date(Date.now() - 182 * 86_400_000).toISOString().slice(0, 10);
  const [years, insider, filingFlags] = await Promise.all([
    getCompanyFacts(cik).then((f) => annualSeries(f, 6)).catch(() => [] as DerivedYear[]),
    getInsiderFilingsSince(cik, since)
      .then(({ filings }) => ({ ...netOfficerSales(filings, since), since }))
      .catch(() => null),
    opts.filingFlags !== undefined ? Promise.resolve(opts.filingFlags) : filingFlagCounts(ticker),
  ]);
  return computeChecklist({ years, insider, filingFlags });
}
