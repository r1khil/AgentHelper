import { LOOKBACKS, type RiskReport } from "./model";

const pct = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : +(x * 100).toFixed(d));
const num = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : +x.toFixed(d));

/** The Risk page's numbers in a compact form for Hoot: headline figures, sectors, and the largest risk sources. */
export function summarizeRisk(r: RiskReport, opts: { teamNames: Map<string, string>; holdingsLimit: number }) {
  const p = r.portfolio;
  return {
    scope: r.scope,
    asOf: r.asOf,
    method: `Forward-looking: today's ledger weights applied to ${r.window.days} daily total returns (${LOOKBACKS[r.lookback].label}, ${r.window.from} to ${r.window.to}); sample covariance, annualized with √252. Beta vs SPY total return; tracking error vs the S&P 500 sector benchmark (saved sector weights on Select Sector SPDR ETFs); VaR is 1-day 95% historical simulation. Cash is riskless.`,
    navUsd: Math.round(r.nav),
    cashPct: pct(r.cash.weight),
    annualizedVolatilityPct: pct(p.vol),
    sp500VolatilityPct: pct(p.marketVol),
    beta: num(p.beta),
    trackingErrorPct: pct(p.trackingError),
    var95OneDay: { pct: pct(p.var.pct), usd: Math.round(p.var.dollars), expectedShortfallPct: pct(p.var.es), expectedShortfallUsd: Math.round(p.var.esDollars), parametricPct: pct(p.var.parametricPct) },
    sp500Down10Pct: { movePct: pct(p.stress.move), usd: Math.round(p.stress.dollars) },
    effectivePositions: num(p.effectiveN, 1),
    holdingsCount: r.holdings.length,
    top5WeightPct: pct(p.top5),
    sectors: r.sectors.map((s) => ({ sector: s.label, weightPct: pct(s.weight), benchmarkPct: pct(s.benchWeight), activePct: pct(s.active), shareOfRiskPct: pct(s.riskShare, 1), shareOfActiveRiskPct: pct(s.activeRiskShare, 1) })),
    largestRiskSources: r.holdings.slice(0, opts.holdingsLimit).map((h) => ({
      ticker: h.ticker,
      team: h.teamId ? (opts.teamNames.get(h.teamId) ?? null) : null,
      weightPct: pct(h.weight),
      shareOfRiskPct: pct(h.riskShare, 1),
      volatilityPct: pct(h.vol, 1),
      beta: num(h.beta),
      correlationToFund: num(h.corrToPortfolio),
      modeledWith: h.source === "own" ? "own returns" : h.source === "proxy" ? `sector ETF ${h.proxy}` : "not modeled",
    })),
    diversifiers: r.holdings.filter((h) => h.riskShare < 0).map((h) => ({ ticker: h.ticker, weightPct: pct(h.weight), shareOfRiskPct: pct(h.riskShare, 1) })),
    highlyCorrelatedPairs: r.correlation.tickers.flatMap((a, i) => r.correlation.tickers.slice(i + 1).map((b, j) => ({ a, b, c: r.correlation.matrix[i][i + 1 + j] }))).filter((x) => x.c >= 0.8).map((x) => `${x.a}/${x.b} ${x.c.toFixed(2)}`),
    realized: r.realized
      ? {
          days: r.realized.days,
          since: r.realized.from,
          enoughForStatistics: r.realized.enough,
          returnPct: pct(r.realized.totalReturn),
          volatilityPct: pct(r.realized.vol),
          beta: num(r.realized.beta),
          trackingErrorPct: pct(r.realized.trackingError),
          sharpe: num(r.realized.sharpe),
          maxDrawdownPct: pct(r.realized.drawdown.max),
          currentDrawdownPct: pct(r.realized.drawdown.current),
        }
      : null,
    notices: r.notices,
  };
}
