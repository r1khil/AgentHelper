import { METRIC_DEFS, METRIC_KEYS, type MetricKey, type MetricTrack, type ScreenResult } from "./metrics";

/*
 * How the screen ranks. Documented here because the method is the product:
 *
 * 1. Coverage. For each metric, the share of the screened universe whose inputs were reported. A metric under 80% is
 *    left out of the ranking (it still shows on a hit when it has a value).
 * 2. Filters. Altman Z'' under 1.1 (distress) is out of both tracks. The value track also needs a meaningful EV/EBIT
 *    (positive operating income) and a positive ROIC: cheap and losing money on its capital is the classic trap. The
 *    GARP track needs ROIC above 12% and stable (see roicStable) and a three-year EPS growth figure.
 * 3. Composite. Within each track's pool, every ranked metric of that track (its own plus the "both" metrics) becomes a
 *    percentile from 0 (worst) to 1 (best), respecting whether lower is better; ties share the average. A name's
 *    composite is the mean of its percentiles, provided it has at least 60% of them.
 * 4. One track per name: the one where its composite is higher. Names are ordered by composite; the top 100 are kept,
 *    plus each team's top five if any fall outside the hundred, so every team always sees five.
 */

export const MIN_COVERAGE = 0.8;
export const TOP_N = 100;
export const TEAM_TOP = 5;
const MIN_METRIC_SHARE = 0.6;

export type RankInput = { key: string; ticker: string; teamId: string | null; result: ScreenResult };
export type Ranked = { key: string; track: "value" | "garp"; composite: number; rank: number; teamRank: number | null };

/** Share of companies whose inputs resolved, per metric (0..1). */
export function metricCoverage(results: ScreenResult[]): Record<MetricKey, number> {
  const out = {} as Record<MetricKey, number>;
  for (const k of METRIC_KEYS) out[k] = results.length ? +(results.filter((r) => r.resolved[k]).length / results.length).toFixed(4) : 0;
  return out;
}

export function rankedMetrics(coverage: Record<string, number>, track: "value" | "garp"): MetricKey[] {
  const inTrack = (t: MetricTrack) => t === track || t === "both";
  return METRIC_DEFS.filter((d) => inTrack(d.track) && (coverage[d.key] ?? 0) >= MIN_COVERAGE).map((d) => d.key);
}

/** Percentile of each value among the non-null values (0 worst, 1 best), ties sharing their average position. */
export function percentiles(values: (number | null)[], lowerIsBetter: boolean): (number | null)[] {
  const present = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null && Number.isFinite(x.v));
  const out: (number | null)[] = values.map(() => null);
  if (!present.length) return out;
  if (present.length === 1) {
    out[present[0].i] = 0.5;
    return out;
  }
  // Worst first.
  present.sort((a, b) => (lowerIsBetter ? b.v - a.v : a.v - b.v));
  let j = 0;
  while (j < present.length) {
    let k = j;
    while (k + 1 < present.length && present[k + 1].v === present[j].v) k++;
    const pos = (j + k) / 2 / (present.length - 1);
    for (let m = j; m <= k; m++) out[present[m].i] = pos;
    j = k + 1;
  }
  return out;
}

export function eligible(r: ScreenResult, track: "value" | "garp"): boolean {
  if (r.distress) return false;
  if (track === "value") return r.metrics.evEbit !== null && r.metrics.roic !== null && r.metrics.roic > 0;
  return r.garpEligible && r.metrics.epsGrowth3y !== null;
}

/** Composite scores for one track: key → mean percentile, for names that pass the track's filter. */
export function trackComposites(rows: RankInput[], track: "value" | "garp", coverage: Record<string, number>): Map<string, number> {
  const pool = rows.filter((r) => eligible(r.result, track));
  const keys = rankedMetrics(coverage, track);
  const out = new Map<string, number>();
  if (!pool.length || !keys.length) return out;
  const cols = keys.map((k) => {
    const def = METRIC_DEFS.find((d) => d.key === k)!;
    return percentiles(pool.map((r) => r.result.metrics[k]), def.lowerIsBetter);
  });
  pool.forEach((r, i) => {
    const got = cols.map((c) => c[i]).filter((x): x is number => x !== null);
    if (got.length < Math.ceil(keys.length * MIN_METRIC_SHARE)) return;
    out.set(r.key, +(got.reduce((a, b) => a + b, 0) / got.length).toFixed(4));
  });
  return out;
}

/** Rank the screened universe; returns the names to save (top 100 plus each team's top five), best first. */
export function rankScreen(rows: RankInput[], coverage: Record<string, number>): Ranked[] {
  const value = trackComposites(rows, "value", coverage);
  const garp = trackComposites(rows, "garp", coverage);
  const scored: { row: RankInput; track: "value" | "garp"; composite: number }[] = [];
  for (const row of rows) {
    const v = value.get(row.key);
    const g = garp.get(row.key);
    if (v === undefined && g === undefined) continue;
    const track = g !== undefined && (v === undefined || g > v) ? "garp" : "value";
    scored.push({ row, track, composite: (track === "garp" ? g : v)! });
  }
  scored.sort((a, b) => b.composite - a.composite || a.row.ticker.localeCompare(b.row.ticker));

  const teamRanks = new Map<string, number>();
  const perTeam = new Map<string, number>();
  for (const s of scored) {
    if (!s.row.teamId) continue;
    const n = (perTeam.get(s.row.teamId) ?? 0) + 1;
    perTeam.set(s.row.teamId, n);
    teamRanks.set(s.row.key, n);
  }
  const out: Ranked[] = [];
  scored.forEach((s, i) => {
    const teamRank = teamRanks.get(s.row.key) ?? null;
    if (i < TOP_N || (teamRank !== null && teamRank <= TEAM_TOP)) out.push({ key: s.row.key, track: s.track, composite: s.composite, rank: i + 1, teamRank });
  });
  return out;
}
