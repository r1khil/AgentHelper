import { classifyFact, conceptFacts, type CompanyFacts } from "@/lib/providers/edgar";

/*
 * The screener's line-item map: each line a company reports, with the XBRL tags it goes by in preference order.
 * Companies tag the same line differently, and switch tags over time (SalesRevenueNet gave way to
 * RevenueFromContractWithCustomerExcludingAssessedTax in 2018), so each fiscal year takes the first alias that has a
 * value for that year rather than one alias for the whole history.
 *
 * The same resolver reads both sources: a company's companyfacts file (the reverse DCF and the value-trap checklist)
 * and the frames the monthly screen downloads for every filer at once. The smaller seven-line map in
 * src/lib/agent/financials.ts is left as it is for Hoot's tools.
 */

export type LineItemKind = "duration" | "instant";

/**
 * Which frames the monthly screen downloads for a line: "history" for the lines behind five-year figures (every year
 * back six years), "recent" for the lines only the latest two years need, "none" for lines the screen does not use
 * (the reverse DCF and checklist read them from companyfacts).
 */
export type FramesUse = "history" | "recent" | "none";

export type LineItemDef = {
  key: string;
  label: string;
  kind: LineItemKind;
  unit: string;
  /** Tags in preference order; "dei:" marks a cover-page tag, the rest are us-gaap. */
  concepts: string[];
  frames: FramesUse;
  /** How many of the aliases the screen fetches as frames (the request budget); all of them by default. */
  framesAliases?: number;
};

export const LINE_ITEMS = [
  // ---- income statement (durations) ----
  { key: "revenue", label: "Revenue", kind: "duration", unit: "USD", concepts: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "SalesRevenueGoodsNet"], frames: "history", framesAliases: 3 },
  { key: "costOfRevenue", label: "Cost of revenue", kind: "duration", unit: "USD", concepts: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"], frames: "recent", framesAliases: 2 },
  { key: "grossProfit", label: "Gross profit", kind: "duration", unit: "USD", concepts: ["GrossProfit"], frames: "recent" },
  { key: "operatingIncome", label: "Operating income", kind: "duration", unit: "USD", concepts: ["OperatingIncomeLoss"], frames: "history" },
  {
    key: "pretaxIncome",
    label: "Pretax income",
    kind: "duration",
    unit: "USD",
    concepts: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic"],
    frames: "history",
    framesAliases: 2,
  },
  { key: "netIncome", label: "Net income", kind: "duration", unit: "USD", concepts: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"], frames: "history", framesAliases: 2 },
  { key: "eps", label: "Diluted EPS", kind: "duration", unit: "USD/shares", concepts: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"], frames: "history", framesAliases: 2 },
  { key: "incomeTax", label: "Income tax", kind: "duration", unit: "USD", concepts: ["IncomeTaxExpenseBenefit", "IncomeTaxExpenseBenefitContinuingOperations"], frames: "history", framesAliases: 1 },
  { key: "depreciation", label: "Depreciation and amortization", kind: "duration", unit: "USD", concepts: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet", "Depreciation"], frames: "recent" },
  // InterestPaidNet is cash interest paid, the most widely tagged line and a close proxy; it comes after the expense tags.
  { key: "interestExpense", label: "Interest expense", kind: "duration", unit: "USD", concepts: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestPaidNet", "InterestAndDebtExpense"], frames: "history", framesAliases: 4 },
  { key: "sga", label: "SG&A", kind: "duration", unit: "USD", concepts: ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"], frames: "recent", framesAliases: 1 },
  { key: "researchAndDevelopment", label: "R&D", kind: "duration", unit: "USD", concepts: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"], frames: "none" },
  { key: "stockComp", label: "Stock-based compensation", kind: "duration", unit: "USD", concepts: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"], frames: "recent" },
  { key: "dilutedShares", label: "Diluted weighted shares", kind: "duration", unit: "shares", concepts: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"], frames: "history", framesAliases: 1 },
  // ---- cash flow (durations) ----
  { key: "operatingCashFlow", label: "Operating cash flow", kind: "duration", unit: "USD", concepts: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"], frames: "history", framesAliases: 1 },
  { key: "capex", label: "Capital expenditure", kind: "duration", unit: "USD", concepts: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements"], frames: "recent", framesAliases: 2 },
  { key: "capitalizedSoftware", label: "Capitalized software", kind: "duration", unit: "USD", concepts: ["PaymentsToDevelopSoftware", "PaymentsForSoftware", "CapitalizedComputerSoftwareAdditions"], frames: "none" },
  { key: "buybacks", label: "Share buybacks", kind: "duration", unit: "USD", concepts: ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"], frames: "recent", framesAliases: 1 },
  // ---- balance sheet (instants) ----
  { key: "totalAssets", label: "Total assets", kind: "instant", unit: "USD", concepts: ["Assets"], frames: "history" },
  { key: "totalLiabilities", label: "Total liabilities", kind: "instant", unit: "USD", concepts: ["Liabilities"], frames: "recent" },
  { key: "liabilitiesAndEquity", label: "Liabilities and equity", kind: "instant", unit: "USD", concepts: ["LiabilitiesAndStockholdersEquity"], frames: "recent" },
  { key: "currentAssets", label: "Current assets", kind: "instant", unit: "USD", concepts: ["AssetsCurrent"], frames: "history" },
  { key: "currentLiabilities", label: "Current liabilities", kind: "instant", unit: "USD", concepts: ["LiabilitiesCurrent"], frames: "history" },
  { key: "cash", label: "Cash", kind: "instant", unit: "USD", concepts: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"], frames: "history", framesAliases: 2 },
  { key: "receivables", label: "Receivables", kind: "instant", unit: "USD", concepts: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "AccountsNotesAndLoansReceivableNetCurrent"], frames: "recent", framesAliases: 2 },
  { key: "inventory", label: "Inventory", kind: "instant", unit: "USD", concepts: ["InventoryNet", "InventoryGross"], frames: "recent", framesAliases: 1 },
  { key: "ppe", label: "PP&E, net", kind: "instant", unit: "USD", concepts: ["PropertyPlantAndEquipmentNet", "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization"], frames: "none" },
  { key: "goodwill", label: "Goodwill", kind: "instant", unit: "USD", concepts: ["Goodwill"], frames: "recent" },
  { key: "equity", label: "Shareholders' equity", kind: "instant", unit: "USD", concepts: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], frames: "history" },
  { key: "retainedEarnings", label: "Retained earnings", kind: "instant", unit: "USD", concepts: ["RetainedEarningsAccumulatedDeficit"], frames: "recent" },
  { key: "leases", label: "Lease liabilities", kind: "instant", unit: "USD", concepts: ["OperatingLeaseLiability", "FinanceLeaseLiability", "OperatingLeaseLiabilityNoncurrent"], frames: "recent", framesAliases: 2 },
  // Debt is a sum of parts; see totalDebt(). These eight tags are its aliases.
  { key: "longTermDebt", label: "Long-term debt", kind: "instant", unit: "USD", concepts: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "LongTermDebt"], frames: "none" },
  { key: "debtLongTermTotal", label: "Long-term debt incl. current", kind: "instant", unit: "USD", concepts: ["LongTermDebt"], frames: "history" },
  { key: "debtLongTermNoncurrent", label: "Long-term debt, noncurrent", kind: "instant", unit: "USD", concepts: ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"], frames: "history" },
  { key: "debtCurrentTotal", label: "Debt, current", kind: "instant", unit: "USD", concepts: ["DebtCurrent"], frames: "history" },
  { key: "debtLongTermCurrent", label: "Current portion of long-term debt", kind: "instant", unit: "USD", concepts: ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"], frames: "history" },
  { key: "shortTermBorrowings", label: "Short-term borrowings", kind: "instant", unit: "USD", concepts: ["ShortTermBorrowings", "CommercialPaper"], frames: "recent" },
  { key: "debtDueYear1", label: "Debt due within a year", kind: "instant", unit: "USD", concepts: ["LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths"], frames: "none" },
  { key: "debtDueYear2", label: "Debt due in year two", kind: "instant", unit: "USD", concepts: ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo"], frames: "none" },
  // Cover-page shares are dated after the year end (the 10-K's cover date); the nearest one to the year end is used.
  { key: "shares", label: "Shares outstanding", kind: "instant", unit: "shares", concepts: ["dei:EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding"], frames: "history", framesAliases: 1 },
] as const satisfies readonly LineItemDef[];

export type LineItemKey = (typeof LINE_ITEMS)[number]["key"];

/** Items the screen's coverage report lists: the spec's line items, each after derivation (debt summed, liabilities backed out). */
export const COVERAGE_ITEMS: LineItemKey[] = [
  "revenue", "grossProfit", "operatingIncome", "pretaxIncome", "netIncome", "eps", "operatingCashFlow", "debtLongTermTotal", "cash", "leases", "capex",
  "receivables", "inventory", "goodwill", "equity", "stockComp", "buybacks", "shares", "incomeTax", "depreciation", "interestExpense", "sga",
  "totalAssets", "totalLiabilities", "currentAssets", "currentLiabilities", "longTermDebt", "retainedEarnings",
];

export function lineItem(key: LineItemKey): LineItemDef {
  return LINE_ITEMS.find((l) => l.key === key)!;
}

/** "dei:EntityCommonStockSharesOutstanding" → taxonomy dei; a bare tag is us-gaap. */
export function splitConcept(c: string): { taxonomy: "us-gaap" | "dei"; concept: string } {
  return c.startsWith("dei:") ? { taxonomy: "dei", concept: c.slice(4) } : { taxonomy: "us-gaap", concept: c };
}

/** One reported value for a concept: an annual duration (start..end) or an instant (end). */
export type PeriodValue = { end: string; start?: string; val: number; accn?: string };

/** All values a company reported for a concept (annual durations and instants only). */
export type FactLookup = (concept: string) => PeriodValue[];

export type YearValues = Partial<Record<LineItemKey, number>>;

/** One fiscal year for one company, after aliases are resolved. */
export type FiscalYear = {
  /** The fiscal year's end (from the annual income statement). */
  end: string;
  /** The balance-sheet date used for this year; can differ from `end` when only a nearby instant was available. */
  bsEnd: string | null;
  values: YearValues;
  /** Which tag answered each line, for audit. */
  concepts: Partial<Record<LineItemKey, string>>;
  /** Accession numbers behind the year's figures (the annual report first). */
  accessions: string[];
};

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

/** Lines whose annual periods define a company's fiscal years. */
const ANCHORS: LineItemKey[] = ["revenue", "operatingIncome", "netIncome"];

export type ResolveOptions = {
  /** Farthest an instant may sit from the year end and still count as that year's balance sheet. */
  instantWindowDays?: number;
  /** How many fiscal years to return, newest first. */
  years?: number;
};

/**
 * Resolve every line item for each fiscal year a company reported, newest first. Fiscal years come from the annual
 * periods of revenue, operating income and net income (ends within ten days are one year: 52/53-week calendars).
 * A duration line takes, per year, the first alias with an annual value ending within ten days of the year end; an
 * instant line takes the first alias with a value within the window, nearest first.
 */
export function resolveFiscalYears(lookup: FactLookup, opts: ResolveOptions = {}): FiscalYear[] {
  const window = opts.instantWindowDays ?? 10;
  const ends: string[] = [];
  for (const key of ANCHORS) {
    for (const c of lineItem(key).concepts) {
      for (const v of lookup(c)) {
        if (!v.start || !isAnnual(v)) continue;
        if (!ends.some((e) => days(e, v.end) <= 10)) ends.push(v.end);
      }
    }
  }
  ends.sort((a, b) => (a < b ? 1 : -1));
  const selected = opts.years ? ends.slice(0, opts.years) : ends;

  return selected.map((end) => {
    const values: YearValues = {};
    const concepts: FiscalYear["concepts"] = {};
    const accessions: string[] = [];
    let bsEnd: string | null = null;
    for (const item of LINE_ITEMS) {
      for (const c of item.concepts) {
        const rows = lookup(c);
        let hit: PeriodValue | undefined;
        if (item.kind === "duration") {
          hit = rows.find((v) => v.start && isAnnual(v) && days(v.end, end) <= 10);
        } else {
          let best: PeriodValue | undefined;
          for (const v of rows) {
            if (v.start) continue;
            const d = days(v.end, end);
            if (d > window) continue;
            if (!best || d < days(best.end, end)) best = v;
          }
          hit = best;
        }
        if (!hit) continue;
        values[item.key] = hit.val;
        concepts[item.key] = c;
        if (item.kind === "instant" && item.key === "totalAssets") bsEnd = hit.end;
        if (hit.accn && (ANCHORS.includes(item.key) || item.key === "totalAssets") && !accessions.includes(hit.accn)) accessions.push(hit.accn);
        break;
      }
    }
    return { end, bsEnd, values, concepts, accessions };
  });
}

function isAnnual(v: PeriodValue) {
  if (!v.start) return false;
  const d = (Date.parse(v.end) - Date.parse(v.start)) / DAY;
  return d >= 340 && d <= 380;
}

/**
 * Total debt from its parts, in this order:
 *   1. LongTermDebt (which includes current maturities) plus short-term borrowings or commercial paper;
 *   2. noncurrent long-term debt plus DebtCurrent (which already holds short-term borrowings), or else plus the current
 *      portion of long-term debt and short-term borrowings;
 *   3. only current debt lines.
 * A balance sheet with no debt line at all reads as no debt (0): companies without borrowings tag nothing. Without a
 * balance sheet (no total assets) the answer is null.
 */
export function totalDebt(v: YearValues): number | null {
  const stb = v.shortTermBorrowings ?? 0;
  if (v.debtLongTermTotal !== undefined) return v.debtLongTermTotal + stb;
  const current = v.debtCurrentTotal ?? (v.debtLongTermCurrent ?? 0) + stb;
  if (v.debtLongTermNoncurrent !== undefined) return v.debtLongTermNoncurrent + current;
  if (v.debtCurrentTotal !== undefined || v.debtLongTermCurrent !== undefined || v.shortTermBorrowings !== undefined) return current;
  return v.totalAssets !== undefined ? 0 : null;
}

/** The derived lines every metric reads: debt summed, gross profit and liabilities backed out where not tagged. */
export type DerivedYear = {
  end: string;
  bsEnd: string | null;
  revenue: number | null;
  grossProfit: number | null;
  ebit: number | null;
  pretaxIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  incomeTax: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  depreciation: number | null;
  interestExpense: number | null;
  sga: number | null;
  researchAndDevelopment: number | null;
  capitalizedSoftware: number | null;
  stockComp: number | null;
  buybacks: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  cash: number | null;
  debt: number | null;
  longTermDebt: number | null;
  equity: number | null;
  retainedEarnings: number | null;
  receivables: number | null;
  inventory: number | null;
  goodwill: number | null;
  ppe: number | null;
  leases: number | null;
  debtDueYear1: number | null;
  debtDueYear2: number | null;
  /** Shares outstanding (cover page, else balance sheet, else diluted weighted average) and which source answered. */
  shares: number | null;
  sharesSource: "dei" | "balance" | "diluted" | null;
  /** Diluted weighted-average shares for the year: the most consistently tagged count, used for share-count changes. */
  dilutedShares: number | null;
  /**
   * What this year's share count and EPS were multiplied (shares) or divided (EPS) by to put them on today's share
   * basis after a stock split; 1 when no split came after it. See adjustForSplits.
   */
  splitFactor: number;
  accessions: string[];
};

const n = (x: number | undefined) => (x === undefined ? null : x);

export function deriveYear(y: FiscalYear): DerivedYear {
  const v = y.values;
  const grossProfit = v.grossProfit ?? (v.revenue !== undefined && v.costOfRevenue !== undefined ? v.revenue - v.costOfRevenue : undefined);
  const ebit = v.operatingIncome ?? (v.pretaxIncome !== undefined && v.interestExpense !== undefined ? v.pretaxIncome + v.interestExpense : undefined);
  const totalLiabilities = v.totalLiabilities ?? (v.liabilitiesAndEquity !== undefined && v.equity !== undefined ? v.liabilitiesAndEquity - v.equity : undefined);
  const longTermDebt = v.debtLongTermNoncurrent ?? v.longTermDebt ?? (v.debtLongTermTotal !== undefined ? v.debtLongTermTotal - (v.debtLongTermCurrent ?? 0) : undefined);
  const shareConcept = y.concepts.shares;
  const shares = v.shares ?? v.dilutedShares;
  return {
    end: y.end,
    bsEnd: y.bsEnd,
    revenue: n(v.revenue),
    grossProfit: n(grossProfit),
    ebit: n(ebit),
    pretaxIncome: n(v.pretaxIncome),
    netIncome: n(v.netIncome),
    eps: n(v.eps),
    incomeTax: n(v.incomeTax),
    operatingCashFlow: n(v.operatingCashFlow),
    capex: n(v.capex),
    depreciation: n(v.depreciation),
    interestExpense: n(v.interestExpense),
    sga: n(v.sga),
    researchAndDevelopment: n(v.researchAndDevelopment),
    capitalizedSoftware: n(v.capitalizedSoftware),
    stockComp: n(v.stockComp),
    buybacks: n(v.buybacks),
    totalAssets: n(v.totalAssets),
    totalLiabilities: n(totalLiabilities),
    currentAssets: n(v.currentAssets),
    currentLiabilities: n(v.currentLiabilities),
    cash: n(v.cash),
    debt: totalDebt(v),
    longTermDebt: n(longTermDebt),
    equity: n(v.equity),
    retainedEarnings: n(v.retainedEarnings),
    receivables: n(v.receivables),
    inventory: n(v.inventory),
    goodwill: n(v.goodwill),
    ppe: n(v.ppe),
    leases: n(v.leases),
    debtDueYear1: n(v.debtDueYear1),
    debtDueYear2: n(v.debtDueYear2),
    shares: n(shares),
    sharesSource: v.shares !== undefined ? (shareConcept?.startsWith("dei:") ? "dei" : "balance") : v.dilutedShares !== undefined ? "diluted" : null,
    dilutedShares: n(v.dilutedShares),
    splitFactor: 1,
    accessions: y.accessions,
  };
}

/** Split ratios the heuristic recognizes when no split history is given (2-for-1 and up; reverse splits as 1/k). */
const COMMON_SPLITS = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50];

/**
 * Put every year's share counts and EPS on today's share basis. XBRL keeps each year as last reported, so a year
 * reported only before a split is on the old basis (NVIDIA's 2022 count is a tenth of its 2025 one). Walking from the
 * newest year back, a jump between neighbouring years that matches a split ratio is read as a split, and older years
 * are scaled by it. The point-in-time count and the diluted average are walked separately (one year's two counts can
 * come from filings either side of a split); EPS follows the diluted average, which is reported beside it. With
 * `splits` (ratios from a price source's split history) those ratios are matched within 10%; without, only whole
 * 2-for-1-and-up ratios (and their reverses) within 6%, so an acquisition that grew the count by half is never read
 * as a split.
 */
export function adjustForSplits(years: DerivedYear[], splits?: number[]): DerivedYear[] {
  const known = splits?.filter((r) => r > 0 && r !== 1) ?? [];
  const candidates = known.length ? [...new Set([...known, ...known.flatMap((a) => known.map((b) => a * b))])] : COMMON_SPLITS;
  const tolerance = known.length ? 0.1 : 0.06;
  const match = (r: number) => {
    for (const k of candidates) {
      if (Math.abs(r / k - 1) <= tolerance) return k;
      if (Math.abs(r * k - 1) <= tolerance) return 1 / k;
    }
    return null;
  };
  const factors = (series: (number | null)[]) => {
    let factor = 1;
    let prev: number | null = null;
    return series.map((v) => {
      if (v !== null && v > 0 && prev !== null) {
        const k = match(prev / (v * factor));
        if (k !== null) factor *= k;
      }
      if (v !== null && v > 0) prev = v * factor;
      return factor;
    });
  };
  const pointF = factors(years.map((y) => y.shares));
  const dilutedF = factors(years.map((y) => y.dilutedShares));
  return years.map((y, i) => {
    const fp = pointF[i];
    const fd = dilutedF[i];
    if (fp === 1 && fd === 1) return y;
    const epsF = y.dilutedShares !== null ? fd : fp;
    return {
      ...y,
      shares: y.shares !== null ? y.shares * fp : null,
      dilutedShares: y.dilutedShares !== null ? y.dilutedShares * fd : null,
      eps: y.eps !== null ? y.eps / epsF : null,
      splitFactor: y.dilutedShares !== null ? fd : fp,
    };
  });
}

/**
 * Two years' share counts to compare: the diluted averages when both years have them (the same tag every year), else
 * the point-in-time counts when both came from the same source. Null otherwise.
 */
export function comparableShares(a: DerivedYear | undefined, b: DerivedYear | undefined): [number, number] | null {
  if (!a || !b) return null;
  if (a.dilutedShares !== null && b.dilutedShares !== null && a.dilutedShares > 0 && b.dilutedShares > 0) return [a.dilutedShares, b.dilutedShares];
  if (a.shares !== null && b.shares !== null && b.shares > 0 && a.sharesSource === b.sharesSource) return [a.shares, b.shares];
  return null;
}

/** A FactLookup over a companyfacts file: annual durations and instants, the latest filing per period. */
export function companyFactsLookup(facts: CompanyFacts): FactLookup {
  const memo = new Map<string, PeriodValue[]>();
  return (c: string) => {
    const hit = memo.get(c);
    if (hit) return hit;
    const { taxonomy, concept } = splitConcept(c);
    const units = facts.facts[taxonomy]?.[concept]?.units ?? {};
    const def = LINE_ITEMS.find((l) => (l.concepts as readonly string[]).includes(c));
    const unit = def && units[def.unit] ? def.unit : Object.keys(units)[0];
    const rows: PeriodValue[] = [];
    if (unit) {
      for (const f of conceptFacts(facts, concept, unit, taxonomy)) {
        const kind = classifyFact(f);
        if (kind !== "annual" && kind !== "instant") continue;
        rows.push({ end: f.end, ...(f.start ? { start: f.start } : {}), val: f.val, accn: f.accn });
      }
    }
    rows.sort((a, b) => (a.end < b.end ? 1 : -1));
    memo.set(c, rows);
    return rows;
  };
}

/** A company's fiscal years from its companyfacts file, newest first, with the derived lines. */
export function annualSeries(facts: CompanyFacts, years = 11): DerivedYear[] {
  return adjustForSplits(resolveFiscalYears(companyFactsLookup(facts), { years }).map(deriveYear));
}

/** Line items that resolve for each company's latest year, as a share of the companies given (0..1). */
export function lineItemCoverage(latest: (DerivedYear | null)[]): Record<string, number> {
  const total = latest.length;
  const out: Record<string, number> = {};
  if (!total) return out;
  const derivedKey: Partial<Record<LineItemKey, keyof DerivedYear>> = { debtLongTermTotal: "debt", operatingIncome: "ebit" };
  for (const key of COVERAGE_ITEMS) {
    const k = (derivedKey[key] ?? key) as keyof DerivedYear;
    const have = latest.filter((y) => y && y[k] !== null && y[k] !== undefined).length;
    out[key === "debtLongTermTotal" ? "debt" : key] = +(have / total).toFixed(4);
  }
  return out;
}
