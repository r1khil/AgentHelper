import type { AttributionSeries } from "./attribution";
import { buildBenchmarkDays } from "./benchmark";
import { adjustForSplits, buildPortfolioDays } from "./ledger";
import { BENCHMARK_REFERENCE, INDEX_REFERENCE } from "./sectors";
import type { BenchmarkQuality, BenchmarkWeightSet, CashFlow, DateSeries, LedgerQuality, SecurityMeta, Split, Trade } from "./types";

// Pure: no database. `store.ts` reads the rows; this turns them into the engine's series, so the live Daily page can
// replay the same rows with a session priced from quotes.

export type LoadedSeries = {
  series: AttributionSeries;
  /** First ledger date; null when nothing has been recorded. */
  inception: string | null;
  /** Last valuation day; null until prices are loaded. */
  latest: string | null;
  weightSets: BenchmarkWeightSet[];
  /** Reference index total return by date, for the methodology footnote. */
  reference: Map<string, number>;
  referenceDividends: Map<string, number>;
  /** S&P 500 index closes by date, for the headline comparison. */
  index: Map<string, number>;
  quality: { ledger: LedgerQuality; benchmark: BenchmarkQuality };
  /** The raw inputs the series was built from (references, not copies), for data lineage. */
  inputs: { prices: DateSeries; dividends: DateSeries; splits: Split[]; days: string[] };
};

/** The stored rows the engine replays: the ledger, the benchmark weight sets, closes, corporate actions and securities. */
export type SeriesInputs = {
  trades: Trade[];
  cashFlows: CashFlow[];
  inception: string | null;
  weightSets: BenchmarkWeightSet[];
  prices: DateSeries;
  dividends: DateSeries;
  splits: Split[];
  meta: Map<string, SecurityMeta>;
};

/**
 * Replay stored inputs into the engine's series. A valuation day is one the reference ETF closed on; `extraDays` adds
 * days that have no close yet (a what-if replay's ledger dates, or a session priced from live quotes).
 */
export function buildSeries(raw: SeriesInputs, opts: { extraDays?: string[] } = {}): LoadedSeries {
  const { inception, weightSets, prices, dividends, splits } = raw;
  const empty: LoadedSeries = {
    series: { portfolio: [], benchmark: [], meta: new Map() },
    inception,
    latest: null,
    weightSets,
    reference: new Map(),
    referenceDividends: new Map(),
    index: new Map(),
    quality: { ledger: { stale: [], unpriced: [], oversold: [] }, benchmark: { beforeFirstWeights: false, staleEtf: [] } },
    inputs: { prices: new Map(), dividends: new Map(), splits: [], days: [] },
  };
  if (!inception) return empty;

  const reference = prices.get(BENCHMARK_REFERENCE) ?? new Map<string, number>();
  const daySet = new Set([...reference.keys()].filter((d) => d >= inception));
  for (const d of opts.extraDays ?? []) if (d >= inception) daySet.add(d);
  const days = [...daySet].sort();
  if (!days.length) return { ...empty, reference, inputs: { prices, dividends, splits, days } };

  const portfolio = buildPortfolioDays({ trades: adjustForSplits(raw.trades, splits), cashFlows: raw.cashFlows, prices, dividends, days });
  const benchmark = buildBenchmarkDays(weightSets, prices, dividends, days);

  return {
    series: { portfolio: portfolio.days, benchmark: benchmark.days, meta: raw.meta },
    inception,
    latest: days.at(-1)!,
    weightSets,
    reference,
    referenceDividends: dividends.get(BENCHMARK_REFERENCE) ?? new Map(),
    index: prices.get(INDEX_REFERENCE) ?? new Map(),
    quality: { ledger: portfolio.quality, benchmark: benchmark.quality },
    inputs: { prices, dividends, splits, days },
  };
}
