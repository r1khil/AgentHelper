import type { GicsSector } from "@/lib/attribution/sectors";
import type { Position } from "@/lib/backtesting/engine";
import { buildRiskReport, type LookbackKey, type RiskHolding, type RiskInput, type RiskReport } from "./model";

export type ScenarioMetrics = { vol: number; beta: number; trackingError: number | null; var: number; es: number; effectiveN: number; top5: number };

export type ScenarioRisk = {
  asOf: string;
  lookback: LookbackKey;
  window: { from: string | null; to: string | null; days: number };
  before: ScenarioMetrics;
  after: ScenarioMetrics;
  /** Holdings whose weight changed, plus the largest risk sources on either side. */
  holdings: { ticker: string; weightBefore: number; weightAfter: number; shareBefore: number; shareAfter: number }[];
  sectors: { label: string; weightBefore: number; weightAfter: number; activeBefore: number | null; activeAfter: number | null; shareBefore: number; shareAfter: number }[];
  benchmarkLabel: string;
  notices: string[];
};

const metrics = (r: RiskReport): ScenarioMetrics => ({
  vol: r.portfolio.vol,
  beta: r.portfolio.beta,
  trackingError: r.portfolio.trackingError,
  var: r.portfolio.var.pct,
  es: r.portfolio.var.es,
  effectiveN: r.portfolio.effectiveN,
  top5: r.portfolio.top5,
});


/** Pure: the saved and modified weights through the same risk model and window, side by side. */
export function compareScenario(args: {
  positions: Position[];
  weights: Record<string, number>;
  sectorOf: Map<string, GicsSector | null>;
  window: RiskInput["window"];
  benchmarkWeights: RiskInput["benchmarkWeights"];
  riskFree: RiskInput["riskFree"];
  scope: RiskInput["scope"];
  asOf: string;
  lookback: LookbackKey;
  benchmarkLabel: string;
  notices?: string[];
}): ScenarioRisk {
  const { positions, weights, sectorOf, window, benchmarkWeights, riskFree, scope, asOf, lookback } = args;
  const holdings = positions.filter((p) => p.kind !== "cash");
  const cash = positions.find((p) => p.kind === "cash");
  const report = (w: (id: string, fallback: number) => number) => {
    // Two teams can hold the same ticker: it is one exposure, so their weights are combined into one row.
    const byTicker = new Map<string, RiskHolding>();
    for (const p of holdings) {
      const weight = w(p.id, p.weight);
      const row = byTicker.get(p.ticker);
      if (row) {
        row.weight += weight;
        row.value += weight;
      } else byTicker.set(p.ticker, { ticker: p.ticker, name: p.name, teamId: null, sector: sectorOf.get(p.ticker) ?? null, value: weight, weight });
    }
    const rows = [...byTicker.values()].filter((h) => h.weight > 0);
    const cashWeight = cash ? w(cash.id, cash.weight) : 0;
    return buildRiskReport({ scope, asOf, lookback, nav: 1, cash: { value: cashWeight, weight: cashWeight }, holdings: rows, benchmarkWeights, window, riskFree, realized: null });
  };
  const before = report((_, saved) => saved);
  const after = report((id, saved) => weights[id] ?? saved);
  const bBefore = new Map(before.holdings.map((h) => [h.ticker, h]));
  const bAfter = new Map(after.holdings.map((h) => [h.ticker, h]));
  const changed = holdings.filter((p) => Math.abs((weights[p.id] ?? p.weight) - p.weight) > 1e-8).map((p) => p.ticker);
  const largest = [...before.holdings.slice(0, 5), ...after.holdings.slice(0, 5)].map((h) => h.ticker);
  const shown = [...new Set([...changed, ...largest])];

  const sBefore = new Map(before.sectors.map((s) => [s.label, s]));
  const sAfter = new Map(after.sectors.map((s) => [s.label, s]));
  const labels = [...new Set([...before.sectors, ...after.sectors].map((s) => s.label))];

  return {
    asOf,
    lookback,
    window: { from: after.window.from, to: after.window.to, days: after.window.days },
    before: metrics(before),
    after: metrics(after),
    holdings: shown.map((t) => ({
      ticker: t,
      weightBefore: bBefore.get(t)?.weight ?? 0,
      weightAfter: bAfter.get(t)?.weight ?? 0,
      shareBefore: bBefore.get(t)?.riskShare ?? 0,
      shareAfter: bAfter.get(t)?.riskShare ?? 0,
    })),
    sectors: labels
      .map((l) => {
        const b = sBefore.get(l);
        const a = sAfter.get(l);
        return { label: l, weightBefore: b?.weight ?? 0, weightAfter: a?.weight ?? 0, activeBefore: b?.active ?? null, activeAfter: a?.active ?? null, shareBefore: b?.riskShare ?? 0, shareAfter: a?.riskShare ?? 0 };
      })
      .filter((s) => Math.abs(s.weightAfter - s.weightBefore) > 1e-6 || Math.abs(s.shareAfter - s.shareBefore) > 0.005),
    benchmarkLabel: args.benchmarkLabel,
    notices: [...new Set([...(args.notices ?? []), ...after.notices.filter((n) => !n.includes("^IRX"))])],
  };
}
