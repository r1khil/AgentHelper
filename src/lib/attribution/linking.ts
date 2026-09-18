export function compound(returns: number[]): number {
  let g = 1;
  for (const r of returns) g *= 1 + r;
  return g - 1;
}

/** Carino's k for one period: the log-return ratio, with the limit 1/(1+r) when rp = rb. */
export function carinoK(rp: number, rb: number): number {
  if (Math.abs(rp - rb) < 1e-14) return 1 / (1 + rp);
  return (Math.log(1 + rp) - Math.log(1 + rb)) / (rp - rb);
}

/**
 * Carino smoothing: scale day t's effects by k_t / K so that linked effects add up to the
 * compounded active return exactly, regardless of day order.
 */
export function carinoCoefficients(days: { rp: number; rb: number }[]): number[] {
  return carinoDetail(days).coef;
}

/** The pieces behind `carinoCoefficients`, for the transparency breakdown: K over the period, k per day, and coef = k/K. */
export function carinoDetail(days: { rp: number; rb: number }[]): { Rp: number; Rb: number; K: number; k: number[]; coef: number[] } {
  const Rp = compound(days.map((d) => d.rp));
  const Rb = compound(days.map((d) => d.rb));
  const K = carinoK(Rp, Rb);
  const k = days.map((d) => carinoK(d.rp, d.rb));
  return { Rp, Rb, K, k, coef: k.map((x) => x / K) };
}

/** Growth of the portfolio before each day; scaling daily contributions by it makes them sum to the compounded return. */
export function priorGrowth(portfolioReturns: number[]): number[] {
  const out: number[] = [];
  let g = 1;
  for (const r of portfolioReturns) {
    out.push(g);
    g *= 1 + r;
  }
  return out;
}
