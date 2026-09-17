import { DateTime } from "luxon";
import { conceptFacts, filingUrlForFact, restatedValues, type CompanyFacts, type PeriodFact } from "@/lib/providers/edgar";

export type MappingSpec = {
  concept: string;
  taxonomy: string;
  unit: string;
  scale: number; // model shows value / scale (e.g. 1e6 for $ millions)
  sign: number; // 1 or -1
  periodType: "quarterly" | "annual";
  periodColumns: Record<string, string>; // column letter -> period end (ISO date)
};

export type Proposal = {
  column: string;
  periodEnd: string;
  status: "proposed" | "exception";
  value: number | null; // value as it should appear in the model (scaled, signed)
  rawValue: number | null;
  unit: string;
  reportedLabel: string;
  fiscalPeriod: string | null;
  form: string | null;
  accession: string | null;
  filedAt: string | null;
  sourceUrl: string | null;
  derivation: string | null;
  exceptionReason: string | null;
};

const SCALES = [1, 1e3, 1e6, 1e9];

function findByEnd(rows: PeriodFact[], kind: PeriodFact["periodKind"] | PeriodFact["periodKind"][], end: string) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  return rows.find((r) => kinds.includes(r.periodKind) && r.end === end);
}

/** Build proposals for every mapped period column from company facts. Pure; no network. */
export function buildProposals(facts: CompanyFacts, cik: string, mapping: MappingSpec): Proposal[] {
  const meta = facts.facts[mapping.taxonomy]?.[mapping.concept];
  const label = meta?.label ?? mapping.concept;
  const out: Proposal[] = [];
  const base = (column: string, periodEnd: string): Proposal => ({
    column,
    periodEnd,
    status: "exception",
    value: null,
    rawValue: null,
    unit: mapping.unit,
    reportedLabel: label,
    fiscalPeriod: null,
    form: null,
    accession: null,
    filedAt: null,
    sourceUrl: null,
    derivation: null,
    exceptionReason: null,
  });

  if (!meta) {
    for (const [column, periodEnd] of Object.entries(mapping.periodColumns)) out.push({ ...base(column, periodEnd), exceptionReason: `Concept ${mapping.concept} is not reported by this company` });
    return out;
  }
  if (!meta.units[mapping.unit]) {
    for (const [column, periodEnd] of Object.entries(mapping.periodColumns)) out.push({ ...base(column, periodEnd), exceptionReason: `Unit ${mapping.unit} not reported; available: ${Object.keys(meta.units).join(", ")}` });
    return out;
  }

  const rows = conceptFacts(facts, mapping.concept, mapping.unit, mapping.taxonomy);
  const isFlow = rows.some((r) => r.periodKind !== "instant");

  for (const [column, periodEnd] of Object.entries(mapping.periodColumns).sort((a, b) => (a[1] < b[1] ? -1 : 1))) {
    const p = base(column, periodEnd);
    let fact: PeriodFact | undefined;
    let derivation: string | null = null;
    let rawValue: number | null = null;

    if (!isFlow) {
      fact = findByEnd(rows, "instant", periodEnd);
      rawValue = fact?.val ?? null;
    } else if (mapping.periodType === "annual") {
      fact = findByEnd(rows, "annual", periodEnd);
      rawValue = fact?.val ?? null;
    } else {
      fact = findByEnd(rows, "quarter", periodEnd);
      rawValue = fact?.val ?? null;
      if (!fact) {
        // Q4 derivation: fiscal year total minus the three reported quarters inside it.
        const annual = findByEnd(rows, "annual", periodEnd);
        if (annual?.start) {
          const quarters = rows.filter((r) => r.periodKind === "quarter" && r.start! >= annual.start! && r.end < periodEnd);
          if (quarters.length === 3) {
            rawValue = annual.val - quarters.reduce((s, q) => s + q.val, 0);
            fact = annual;
            derivation = `Derived: FY (${annual.start}..${annual.end}) ${annual.val} minus Q1..Q3 [${quarters.map((q) => `${q.end}: ${q.val}`).join(", ")}]`;
          } else {
            p.exceptionReason = `No quarterly fact ending ${periodEnd}; found ${quarters.length} prior quarters in the fiscal year (need 3 to derive Q4)`;
          }
        } else {
          const ytd = findByEnd(rows, "ytd", periodEnd);
          p.exceptionReason = ytd ? `Only a year-to-date value ends ${periodEnd} (${ytd.start}..${ytd.end}); quarterly figure not reported and cannot be derived without the prior quarters` : `No fact for period ending ${periodEnd}`;
        }
      }
    }

    if (!fact || rawValue === null) {
      p.exceptionReason ??= `No ${isFlow ? mapping.periodType : "instant"} fact ending ${periodEnd}`;
      out.push(p);
      continue;
    }

    const restated = restatedValues(facts, mapping.concept, mapping.unit, fact.start, fact.end, mapping.taxonomy);
    const filled: Proposal = {
      ...p,
      rawValue,
      value: (rawValue * mapping.sign) / mapping.scale,
      fiscalPeriod: `${fact.fy} ${fact.fp}`,
      form: fact.form,
      accession: fact.accn,
      filedAt: fact.filed,
      sourceUrl: filingUrlForFact(cik, fact),
      derivation,
    };
    if (restated) {
      filled.status = "exception";
      filled.exceptionReason = `Restated: ${restated.map((r) => `${r.val} (${r.form} filed ${r.filed})`).join(" vs ")}. Latest filing used; confirm which the model should carry.`;
    } else {
      filled.status = "proposed";
    }
    out.push(filled);
  }
  return out;
}

export type ConceptSuggestion = { concept: string; label: string; unit: string; scale: number; periodKind: string; value: number; start?: string; end: string; exact: boolean };

/** Value-match a number typed in the model against every fact ending on the anchor period. Deterministic, no LLM. */
export function suggestConcepts(facts: CompanyFacts, periodEnd: string, cellValue: number, taxonomy = "us-gaap", limit = 12): ConceptSuggestion[] {
  const out: ConceptSuggestion[] = [];
  const t = facts.facts[taxonomy] ?? {};
  if (!Number.isFinite(cellValue) || cellValue === 0) return out;
  for (const [concept, meta] of Object.entries(t)) {
    for (const [unit, arr] of Object.entries(meta.units)) {
      for (const f of arr) {
        if (f.end !== periodEnd) continue;
        for (const scale of SCALES) {
          const target = cellValue * scale;
          const diff = Math.abs(Math.abs(f.val) - Math.abs(target));
          const tol = Math.max(Math.abs(target) * 0.005, 0.5);
          if (diff <= tol) {
            const days = f.start ? Math.round((Date.parse(f.end) - Date.parse(f.start)) / 86400000) : 0;
            const periodKind = !f.start ? "instant" : days >= 80 && days <= 100 ? "quarter" : days >= 350 ? "annual" : "ytd";
            out.push({ concept, label: meta.label, unit, scale, periodKind, value: f.val, start: f.start, end: f.end, exact: diff === 0 });
            break;
          }
        }
      }
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => Number(b.exact) - Number(a.exact))
    .filter((s) => {
      const k = `${s.concept}|${s.unit}|${s.scale}|${s.periodKind}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

/** Period ends for the last N fiscal quarters/years actually reported for a concept, newest first. Used to pre-fill column mapping. */
export function reportedPeriodEnds(facts: CompanyFacts, concept: string, unit: string, periodType: "quarterly" | "annual", taxonomy = "us-gaap") {
  const rows = conceptFacts(facts, concept, unit, taxonomy);
  const kinds = periodType === "annual" ? ["annual", "instant"] : ["quarter", "instant", "annual"];
  return [...new Set(rows.filter((r) => kinds.includes(r.periodKind)).map((r) => r.end))].sort().reverse();
}

export function isoQuarterLabel(end: string) {
  const d = DateTime.fromISO(end);
  return d.isValid ? d.toFormat("MMM yyyy") : end;
}
