export function compound(returns: number[]): number {
  let g = 1;
  for (const r of returns) g *= 1 + r;
  return g - 1;
}

function carinoK(rp: number, rb: number): number {
  if (Math.abs(rp - rb) < 1e-14) return 1 / (1 + rp);
  return (Math.log(1 + rp) - Math.log(1 + rb)) / (rp - rb);
}

/**
 * Carino smoothing: scale day t's effects by k_t / K so that linked effects add up to the
 * compounded active return exactly, regardless of day order.
 */
export function carinoCoefficients(days: { rp: number; rb: number }[]): number[] {
  const K = carinoK(compound(days.map((d) => d.rp)), compound(days.map((d) => d.rb)));
  return days.map((d) => carinoK(d.rp, d.rb) / K);
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
