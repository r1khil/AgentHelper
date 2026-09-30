// Pure and client-safe: pitch cohorts, kill criteria written as checkable conditions, and the calibration figures
// (hit rate, thesis accuracy, optimism bias) by team and cohort. The database and price reads are in pitches.ts.
import type { KillCriterion, PitchOutcome } from "@/db/schema";

/** The metrics a kill criterion or key metric can name so code can check it; anything else is a quarterly review prompt. */
export const CHECKABLE_METRICS = {
  gross_margin: { label: "Gross margin", unit: "%" },
  operating_margin: { label: "Operating margin", unit: "%" },
  net_margin: { label: "Net margin", unit: "%" },
  revenue_growth: { label: "Revenue growth (year on year)", unit: "%" },
  price: { label: "Share price", unit: "$" },
} as const;
export type CheckableMetric = keyof typeof CHECKABLE_METRICS;

export const KILL_OPS = ["<", "<=", ">", ">="] as const;
export type KillOp = (typeof KILL_OPS)[number];

export const CONFIDENCE_LEVELS = [50, 70, 90] as const;

/** The semester a pitch belongs to: Spring (Jan–May), Summer (Jun–Jul) or Fall (Aug–Dec), with the year. */
export function cohortOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const season = m <= 5 ? "Spring" : m <= 7 ? "Summer" : "Fall";
  return `${season} ${y}`;
}

const OP_WORDS: Record<string, KillOp> = { "<": "<", "≤": "<=", "<=": "<=", ">": ">", "≥": ">=", ">=": ">=" };

const METRIC_WORDS: [RegExp, CheckableMetric][] = [
  [/gross\s+margin/i, "gross_margin"],
  [/operating\s+margin|ebit\s+margin/i, "operating_margin"],
  [/net\s+margin/i, "net_margin"],
  [/revenue\s+growth|sales\s+growth/i, "revenue_growth"],
  [/share\s+price|stock\s+price|\bprice\b/i, "price"],
];

/**
 * Reads a condition written in plain words ("gross margin < 40%", "FY27 operating margin ≥ 18%") as metric + operator
 * + threshold. Anything it can't read keeps only its text and becomes a review prompt instead of a code check.
 */
export function parseCondition(text: string): KillCriterion {
  const clean = text.trim();
  const m = clean.match(/(<=|>=|≤|≥|<|>)\s*\$?\s*(-?\d+(?:\.\d+)?)\s*%?/);
  const metric = METRIC_WORDS.find(([re]) => re.test(clean))?.[1];
  if (!m || !metric) return { text: clean };
  return { text: clean, metric, op: OP_WORDS[m[1]], threshold: Number(m[2]) };
}

export function isCheckable(c: KillCriterion): c is KillCriterion & { metric: CheckableMetric; op: KillOp; threshold: number } {
  return !!c.metric && c.metric in CHECKABLE_METRICS && !!c.op && typeof c.threshold === "number" && Number.isFinite(c.threshold);
}

/** Whether a value meets a condition. Percent metrics are compared in percent (0.38 → 38). */
export function meets(value: number, op: KillOp, threshold: number): boolean {
  switch (op) {
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
  }
}

export type MetricReadings = Partial<Record<CheckableMetric, { value: number; asOf: string }>>;

/** Checks each criterion that code can read; a criterion is tripped when its condition holds. The rest are left as they were. */
export function checkKillCriteria(criteria: KillCriterion[], readings: MetricReadings, today: string): KillCriterion[] {
  return criteria.map((c) => {
    if (!isCheckable(c)) return c;
    const r = readings[c.metric];
    if (!r) return c;
    return { ...c, lastChecked: today, tripped: meets(r.value, c.op, c.threshold) };
  });
}

export type ScoredPitch = {
  teamId: string;
  cohort: string;
  confidence: number;
  intrinsicValue: number;
  outcome: PitchOutcome | null;
};

export type CalibrationRow = {
  key: string;
  /** Resolved pitches (scored at horizon). */
  n: number;
  /** Share of resolved pitches whose price reached the target within the horizon. */
  hitRate: number | null;
  /** Share of resolved pitches with a checkable key metric that landed. */
  thesisAccuracy: number | null;
  thesisN: number;
  /** Average (estimated value ÷ price at horizon − 1): above zero means estimates ran high. */
  optimism: number | null;
  /** Hit rate per stated confidence, so "70%" can be compared with what happened. */
  byConfidence: { confidence: number; n: number; hitRate: number | null }[];
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function row(key: string, pitches: ScoredPitch[]): CalibrationRow {
  const resolved = pitches.filter((p) => p.outcome);
  const hits = resolved.filter((p) => p.outcome!.hitTarget !== null);
  const thesis = resolved.filter((p) => p.outcome!.keyMetricMet !== null);
  const gaps = resolved.flatMap((p) => (p.outcome!.valueGapPct !== null ? [p.outcome!.valueGapPct] : []));
  const share = (xs: ScoredPitch[], f: (p: ScoredPitch) => boolean | null) => (xs.length ? xs.filter((p) => f(p) === true).length / xs.length : null);
  return {
    key,
    n: resolved.length,
    hitRate: share(hits, (p) => p.outcome!.hitTarget),
    thesisAccuracy: share(thesis, (p) => p.outcome!.keyMetricMet),
    thesisN: thesis.length,
    optimism: avg(gaps),
    byConfidence: [50, 70, 90].map((c) => {
      const at = hits.filter((p) => p.confidence === c);
      return { confidence: c, n: at.length, hitRate: share(at, (p) => p.outcome!.hitTarget) };
    }),
  };
}

/** Calibration by team and by cohort (scored by team, never by person), each with its sample size. */
export function calibrate(pitches: ScoredPitch[]): { byTeam: CalibrationRow[]; byCohort: CalibrationRow[]; overall: CalibrationRow } {
  const group = (f: (p: ScoredPitch) => string) => {
    const m = new Map<string, ScoredPitch[]>();
    for (const p of pitches) m.set(f(p), [...(m.get(f(p)) ?? []), p]);
    return [...m.entries()].map(([k, xs]) => row(k, xs));
  };
  return { byTeam: group((p) => p.teamId), byCohort: group((p) => p.cohort), overall: row("overall", pitches) };
}

/** A price path's outcome at the horizon: did it reach the target, and how far the estimate was from where it ended. */
export function scoreOutcome(
  p: { priceTarget: number; intrinsicValue: number; priceAtPitch: number | null },
  closes: { date: string; close: number }[],
  keyMetricMet: boolean | null,
  scoredAt: string,
): PitchOutcome {
  const last = closes.at(-1)?.close ?? null;
  const up = p.priceAtPitch === null || p.priceTarget >= p.priceAtPitch;
  const hitTarget = closes.length ? closes.some((c) => (up ? c.close >= p.priceTarget : c.close <= p.priceTarget)) : null;
  return { scoredAt, priceAtHorizon: last, hitTarget, keyMetricMet, valueGapPct: last ? p.intrinsicValue / last - 1 : null };
}

/** The date a pitch's horizon ends, as YYYY-MM-DD. */
export function horizonEnd(pitchedOn: string, months: number): string {
  const [y, m, d] = pitchedOn.split("-").map(Number);
  // Day clamped to the target month (Jan 31 + 1 month is Feb 28, not Mar 3).
  const last = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}
