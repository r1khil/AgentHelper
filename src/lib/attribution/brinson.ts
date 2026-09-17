import type { BucketDay, BucketInput, BucketKey } from "./types";

/**
 * One-period Brinson-Fachler.
 *   allocation  = (wp - wb)(rb - Rb)
 *   selection   = wb (rp - rb)
 *   interaction = (wp - wb)(rp - rb)
 * A bucket missing on one side borrows the other side's return, which puts its whole effect
 * in allocation and keeps the three effects summing to Rp - Rb.
 */
export function brinsonDay(
  portfolio: Partial<Record<BucketKey, BucketInput>>,
  benchmark: Partial<Record<BucketKey, BucketInput>>,
  benchmarkReturn: number,
): Partial<Record<BucketKey, BucketDay>> {
  const out: Partial<Record<BucketKey, BucketDay>> = {};
  const keys = new Set<BucketKey>([...(Object.keys(portfolio) as BucketKey[]), ...(Object.keys(benchmark) as BucketKey[])]);
  for (const key of keys) {
    const wp = portfolio[key]?.weight ?? 0;
    const wb = benchmark[key]?.weight ?? 0;
    if (wp === 0 && wb === 0) continue;
    let rp = portfolio[key]?.ret ?? 0;
    let rb = benchmark[key]?.ret ?? 0;
    if (wb === 0) rb = rp;
    if (wp === 0) rp = rb;
    out[key] = {
      wp,
      wb,
      rp,
      rb,
      allocation: (wp - wb) * (rb - benchmarkReturn),
      selection: wb * (rp - rb),
      interaction: (wp - wb) * (rp - rb),
    };
  }
  return out;
}
