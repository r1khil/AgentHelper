import { conceptFacts, type CompanyFacts, type PeriodFact } from "@/lib/providers/edgar";

/**
 * Standard income-statement metrics resolved from XBRL company facts.
 * Each metric lists concept names in preference order; companies tag the same
 * line differently (AXP reports RevenuesNetOfInterestExpense, not Revenues).
 */
export const KEY_METRICS: { key: string; label: string; concepts: string[]; unit: string }[] = [
  {
    key: "revenue",
    label: "Revenue",
    concepts: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenuesNetOfInterestExpense", "SalesRevenueNet", "TotalRevenuesAndOtherIncome"],
    unit: "USD",
  },
  { key: "grossProfit", label: "Gross profit", concepts: ["GrossProfit"], unit: "USD" },
  { key: "operatingIncome", label: "Operating income", concepts: ["OperatingIncomeLoss"], unit: "USD" },
  {
    key: "pretaxIncome",
    label: "Pretax income",
    concepts: [
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    ],
    unit: "USD",
  },
  { key: "netIncome", label: "Net income", concepts: ["NetIncomeLoss", "ProfitLoss"], unit: "USD" },
  { key: "epsDiluted", label: "Diluted EPS", concepts: ["EarningsPerShareDiluted"], unit: "USD/shares" },
  { key: "operatingCashFlow", label: "Operating cash flow", concepts: ["NetCashProvidedByUsedInOperatingActivities"], unit: "USD" },
];

export type KeyPeriodKind = "quarter" | "annual";

export type KeyFinancialsRow = {
  start: string | null;
  end: string;
  form: string;
  filed: string;
  accession: string;
  values: Record<string, { value: number; concept: string }>;
  calculated: Record<string, number>;
};

export type KeyFinancials = {
  periodKind: KeyPeriodKind;
  metrics: { key: string; label: string; concept: string | null; unit: string }[];
  rows: KeyFinancialsRow[];
  missing: string[];
  notes: string[];
};

function factsFor(facts: CompanyFacts, concept: string, unit: string, periodKind: KeyPeriodKind): { taxonomy: string; unit: string; rows: PeriodFact[] } | null {
  for (const taxonomy of ["us-gaap", "ifrs-full"]) {
    const meta = facts.facts[taxonomy]?.[concept];
    if (!meta) continue;
    const u = meta.units[unit] ? unit : Object.keys(meta.units)[0];
    if (!u) continue;
    const rows = conceptFacts(facts, concept, u, taxonomy).filter((f) => f.periodKind === periodKind);
    if (rows.length) return { taxonomy, unit: u, rows };
  }
  return null;
}

/** Pick, per metric, the concept with the freshest data for the requested period kind, then build one row per period end. */
export function resolveKeyFinancials(facts: CompanyFacts, periodKind: KeyPeriodKind, periods: number): KeyFinancials {
  const resolved: { key: string; label: string; concept: string | null; unit: string; rows: PeriodFact[] }[] = [];
  const missing: string[] = [];

  for (const m of KEY_METRICS) {
    let best: { concept: string; unit: string; rows: PeriodFact[] } | null = null;
    for (const concept of m.concepts) {
      const hit = factsFor(facts, concept, m.unit, periodKind);
      if (!hit) continue;
      const latest = hit.rows[hit.rows.length - 1].end;
      const bestLatest = best ? best.rows[best.rows.length - 1].end : "";
      if (!best || latest > bestLatest || (latest === bestLatest && hit.rows.length > best.rows.length)) best = { concept, unit: hit.unit, rows: hit.rows };
    }
    if (best) resolved.push({ key: m.key, label: m.label, concept: best.concept, unit: best.unit, rows: best.rows });
    else {
      resolved.push({ key: m.key, label: m.label, concept: null, unit: m.unit, rows: [] });
      missing.push(m.label);
    }
  }

  // Period ends come from revenue when available (the anchor line), otherwise from the union of all metrics.
  const anchor = resolved.find((r) => r.key === "revenue" && r.rows.length) ?? null;
  const ends = new Set<string>();
  for (const r of anchor ? [anchor] : resolved) for (const f of r.rows) ends.add(f.end);
  const selected = [...ends].sort().slice(-periods).reverse();

  const rows: KeyFinancialsRow[] = selected.map((end) => {
    const values: KeyFinancialsRow["values"] = {};
    let meta: PeriodFact | undefined;
    for (const r of resolved) {
      const f = r.rows.find((x) => x.end === end);
      if (!f) continue;
      values[r.key] = { value: f.val, concept: r.concept! };
      if (!meta || f.filed > meta.filed) meta = f;
    }
    const calculated: Record<string, number> = {};
    const rev = values.revenue?.value;
    if (rev) {
      if (values.operatingIncome) calculated.operatingMarginPct = +((values.operatingIncome.value / rev) * 100).toFixed(2);
      if (values.netIncome) calculated.netMarginPct = +((values.netIncome.value / rev) * 100).toFixed(2);
      if (values.pretaxIncome) calculated.pretaxMarginPct = +((values.pretaxIncome.value / rev) * 100).toFixed(2);
    }
    return { start: meta?.start ?? null, end, form: meta?.form ?? "", filed: meta?.filed ?? "", accession: meta?.accn ?? "", values, calculated };
  });

  const notes: string[] = [];
  if (periodKind === "quarter") notes.push("Fiscal Q4 is usually not tagged as a separate quarter in XBRL; only the annual figure is. Deriving Q4 as annual minus nine-month YTD is a calculation, not a reported value.");
  notes.push("Margins under `calculated` are computed here from the reported lines; label them as calculations when you use them.");

  return { periodKind, metrics: resolved.map(({ key, label, concept, unit }) => ({ key, label, concept, unit })), rows, missing, notes };
}

/** Case-insensitive, word-scored concept search across us-gaap and ifrs-full. All-word matches rank first. */
export function searchConcepts(facts: CompanyFacts, query: string, limit = 15) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: { concept: string; label: string; units: string[]; dataPoints: number; latestEnd: string; score: number }[] = [];
  for (const taxonomy of ["us-gaap", "ifrs-full"]) {
    for (const [concept, v] of Object.entries(facts.facts[taxonomy] ?? {})) {
      const hay = `${concept} ${v.label ?? ""}`.toLowerCase();
      const matched = words.filter((w) => hay.includes(w)).length;
      if (!matched) continue;
      const all = Object.values(v.units).flat();
      const latestEnd = all.reduce((m, f) => (f.end > m ? f.end : m), "");
      out.push({ concept, label: v.label, units: Object.keys(v.units), dataPoints: all.length, latestEnd, score: matched });
    }
  }
  return out
    .sort((a, b) => b.score - a.score || (b.latestEnd > a.latestEnd ? 1 : b.latestEnd < a.latestEnd ? -1 : 0) || b.dataPoints - a.dataPoints)
    .slice(0, limit)
    .map(({ concept, label, units, dataPoints, latestEnd }) => ({ concept, label, units, dataPoints, latestEnd }));
}
