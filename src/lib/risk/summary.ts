import { activeRiskBreakdown } from "./active";
import { buildExposure } from "./exposure";
import { FACTOR_KEYS, FACTORS, factorReadings, isFactorReport, type FactorFit, type FactorKey } from "./factors";
import { LOOKBACKS, type RiskReport } from "./model";
import type { StressResult } from "./stress";

const pct = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : +(x * 100).toFixed(d));
const num = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : +x.toFixed(d));

/**
 * The Risk and Exposure pages' numbers in a compact form for Hoot: headline figures, sector exposure, the largest
 * risk sources, and where the active risk (tracking error) comes from.
 */
export function summarizeRisk(r: RiskReport, opts: { teamNames: Map<string, string>; holdingsLimit: number }) {
  const p = r.portfolio;
  const x = buildExposure(r);
  const a = activeRiskBreakdown(r);
  const shown = a ? a.holdings.slice(0, opts.holdingsLimit) : [];
  const byMarginal = a ? [...a.holdings].sort((m, n) => n.marginalTe - m.marginalTe) : [];
  const marginalOut = (h: (typeof byMarginal)[number]) => ({ ticker: h.ticker, marginalTePpPer1Pp: num(h.marginalTe, 3) });
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
    top10WeightPct: pct(p.top10),
    largestActiveSectorBet: x.largestBet
      ? { sector: x.largestBet.label, etf: x.largestBet.etf, activePct: pct(x.largestBet.active), weightPct: pct(x.largestBet.weight), benchmarkPct: pct(x.largestBet.benchWeight), note: "By sector only: the benchmark is sector ETFs, so stock-level active bets are not measured." }
      : null,
    sectorOverweightsTotalPct: pct(x.overweight),
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
    activeRisk: a
      ? {
          method:
            "Share of tracking-error variance (Euler: aᵢ(Σa)ᵢ ÷ aᵀΣa) with the holdings long and the benchmark's sector ETFs short; the holdings plus the benchmark side add to 100%, and a negative share means the position reduces tracking error. Marginal tracking error is ∂TE/∂wᵢ = (Σa)ᵢ ÷ TE: the change in tracking error, in percentage points, from moving 1 percentage point of weight into the holding from cash.",
          trackingErrorPct: pct(a.trackingError),
          holdings: shown.map((h) => ({ ticker: h.ticker, weightPct: pct(h.weight), shareOfActiveRiskPct: pct(h.share, 1), trackingErrorPointsPct: pct(h.teContribution), marginalTePpPer1Pp: num(h.marginalTe, 3) })),
          otherHoldingsShareOfActiveRiskPct: a.holdings.length > shown.length ? pct(a.holdings.slice(shown.length).reduce((s, h) => s + h.share, 0), 1) : null,
          benchmarkSide: {
            shareOfActiveRiskPct: pct(a.benchmark.share, 1),
            legs: a.benchmark.legs.map((l) => ({ etf: l.etf, sector: l.label, benchmarkWeightPct: pct(-l.weight), fundActivePct: pct(l.sectorActive), shareOfActiveRiskPct: pct(l.activeRiskShare, 1) })),
          },
          largestMarginal: byMarginal.slice(0, 3).map(marginalOut),
          mostReducingMarginal: byMarginal.filter((h) => h.marginalTe < 0).slice(-3).reverse().map(marginalOut),
          readings: a.sentences,
        }
      : null,
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
    factorSensitivities: summarizeFactors(r),
    notices: r.notices,
  };
}

/** The Exposure page's factor section for Hoot: every beta with its t-stat, and the page's plain-English readings. */
export function summarizeFactors(r: RiskReport) {
  const f = r.factors;
  if (!isFactorReport(f)) return { note: f.reason };
  const row = (x: FactorFit | null) =>
    x
      ? {
          ...(Object.fromEntries(FACTOR_KEYS.map((k) => [k, { beta: num(x.betas[k].beta, 3), t: num(x.betas[k].t, 1), significant: x.betas[k].significant }])) as Record<FactorKey, { beta: number | null; t: number | null; significant: boolean }>),
          rSquared: num(x.r2, 2),
        }
      : null;
  const read = factorReadings(f, { basis: r.scope === "fund" ? "NAV" : "the team's holdings" });
  return {
    method: `One OLS regression with an intercept per holding of daily total returns on seven factors over ${f.sample.n} days (${f.sample.from} to ${f.sample.to}): ${FACTORS.map((x) => `${x.label} = ${x.definition}`).join("; ")}. The portfolio's beta is the weight-sum of holding betas (identical to regressing the portfolio's return). |t| < 2 means not statistically significant: describe it as no clear exposure, never as a position. Descriptive of past co-movement only; not a recommendation.`,
    portfolio: row(f.fund),
    benchmark: row(f.benchmark),
    activeVsBenchmark: row(f.active),
    readings: read.fund.map((x) => x.text),
    clearActiveTilts: read.active.map((x) => x.text),
    holdingsModeledWithSectorEtf: f.holdings.filter((h) => h.source === "proxy").map((h) => `${h.ticker} via ${h.proxy}`),
  };
}

/** The Risk page's historical stress tests in a compact form for Hoot. */
export function summarizeStress(results: StressResult[]) {
  return results.map((r) =>
    r.status !== "ok"
      ? { window: r.label, from: r.from, to: r.to, note: r.reason }
      : {
          window: r.label,
          from: r.start,
          to: r.end,
          about: r.note,
          method: "Today's positions bought at the starting close and held without rebalancing (buy-and-hold) to the ending close; total returns with dividends reinvested, from stored closes. Holdings not yet trading use their sector ETF.",
          fundReturnPct: pct(r.fund),
          sp500ReturnPct: pct(r.market),
          sectorBenchmarkReturnPct: pct(r.benchmark),
          activeReturnPct: pct(r.active),
          impactOnTodaysValueUsd: Math.round(r.dollars),
          dailyRebalancedReturnPct: pct(r.rebalanced),
          worstContributors: r.worst.map((h) => ({ ticker: h.ticker, contributionPct: pct(h.contribution), returnPct: pct(h.ret), usd: Math.round(h.dollars), ...(h.proxied ? { modeledWith: h.series } : {}) })),
          bestContributors: [...r.holdings].reverse().slice(0, 3).map((h) => ({ ticker: h.ticker, contributionPct: pct(h.contribution), returnPct: pct(h.ret) })),
          stoodIn: r.holdings.filter((h) => h.proxied).map((h) => `${h.ticker} via ${h.series} (${h.proxyReason})`),
        },
  );
}
