import { ETF_BY_SECTOR, GICS_SECTORS, type GicsSector } from "./sectors";
import type { BenchmarkDay, BenchmarkQuality, BenchmarkWeightSet, DateSeries } from "./types";

function zeros(): Record<GicsSector, number> {
  return Object.fromEntries(GICS_SECTORS.map((s) => [s, 0])) as Record<GicsSector, number>;
}

export function normaliseWeights(weights: Partial<Record<GicsSector, number>>): Record<GicsSector, number> {
  const out = zeros();
  let total = 0;
  for (const s of GICS_SECTORS) total += Math.max(0, weights[s] ?? 0);
  if (total <= 0) return out;
  for (const s of GICS_SECTORS) out[s] = Math.max(0, weights[s] ?? 0) / total;
  return out;
}

/**
 * Benchmark = saved S&P 500 sector weights x sector ETF total returns. A weight set dated X is
 * the end-of-day X allocation, so it takes effect on the first valuation day after X and then
 * drifts with sector returns until the next set. Because the benchmark return is defined as
 * sum(w x r), Brinson effects add up to the active return with no residual.
 */
export function buildBenchmarkDays(
  weightSets: BenchmarkWeightSet[],
  etfPrices: DateSeries,
  etfDividends: DateSeries,
  days: string[],
): { days: BenchmarkDay[]; quality: BenchmarkQuality } {
  const quality: BenchmarkQuality = { beforeFirstWeights: false, staleEtf: [] };
  const sets = [...weightSets].sort((a, b) => a.asOf.localeCompare(b.asOf));
  if (!sets.length || !days.length) return { days: [], quality };

  // Last close strictly before the first day seeds each ETF's prior close.
  const prev = new Map<GicsSector, number>();
  for (const s of GICS_SECTORS) {
    const series = etfPrices.get(ETF_BY_SECTOR[s]);
    if (!series) continue;
    let best: string | undefined;
    for (const d of series.keys()) if (d < days[0] && (best === undefined || d > best)) best = d;
    if (best !== undefined) prev.set(s, series.get(best)!);
  }

  const out: BenchmarkDay[] = [];
  let weights: Record<GicsSector, number> | null = null;
  let activeSet = -1;

  for (const date of days) {
    let idx = -1;
    for (let i = 0; i < sets.length; i++) if (sets[i].asOf < date) idx = i;
    if (idx === -1) { idx = 0; quality.beforeFirstWeights = true; }
    if (idx !== activeSet || !weights) { weights = normaliseWeights(sets[idx].weights); activeSet = idx; }

    const returns = zeros();
    let ret = 0;
    for (const s of GICS_SECTORS) {
      const etf = ETF_BY_SECTOR[s];
      const p0 = prev.get(s);
      let close = etfPrices.get(etf)?.get(date);
      if (close === undefined) {
        if (weights[s] > 0) quality.staleEtf.push({ ticker: etf, date });
        close = p0;
      }
      const div = etfDividends.get(etf)?.get(date) ?? 0;
      returns[s] = p0 !== undefined && p0 > 0 && close !== undefined ? (close + div) / p0 - 1 : 0;
      if (close !== undefined) prev.set(s, close);
      ret += weights[s] * returns[s];
    }
    out.push({ date, weights: { ...weights }, returns, ret });

    const next = zeros();
    for (const s of GICS_SECTORS) next[s] = (weights[s] * (1 + returns[s])) / (1 + ret);
    weights = next;
  }
  return { days: out, quality };
}
