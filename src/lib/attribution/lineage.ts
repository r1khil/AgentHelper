import type { SectorBreakdown } from "./attribution";
import { ETF_BY_SECTOR, type BucketKey, type GicsSector } from "./sectors";
import type { BenchmarkDay, BenchmarkWeightSet, DateSeries, PortfolioDay, Split } from "./types";

export type LineageFlag = { date: string; kind: "stale" | "unpriced" | "etf-stale" | "before-first-weights"; ticker?: string };

/** Which stored rows fed one sector's attribution over a period, and where the data was thin. */
export type SectorLineage = {
  tickers: string[];
  /** daily_closes coverage per ticker inside the period, plus held days with no close of their own. */
  closes: { ticker: string; from: string | null; to: string | null; rows: number; missingDays: string[] }[];
  /** security_events (dividends, splits) inside the period for the sector's tickers. */
  events: { ticker: string; date: string; kind: "dividend" | "split"; amount?: number; ratio?: number }[];
  /** Sector ETF coverage; null for cash and unclassified holdings. */
  benchmark: { etf: string; from: string | null; to: string | null; rows: number; staleDays: string[] } | null;
  /** Saved benchmark weight sets and the valuation days each was in effect for (drifted daily). */
  weightSets: { asOf: string; weight: number | null; appliedFrom: string | null; appliedTo: string | null }[];
  flags: LineageFlag[];
};

export type LineageInputs = {
  prices: DateSeries;
  dividends: DateSeries;
  splits: Split[];
  weightSets: BenchmarkWeightSet[];
  portfolio: PortfolioDay[];
  benchmark: BenchmarkDay[];
};

const inPeriod = (date: string, range: { start: string; end: string }) => date > range.start && date <= range.end;

function coverage(series: Map<string, number> | undefined, range: { start: string; end: string }) {
  const dates = series ? [...series.keys()].filter((d) => inPeriod(d, range)).sort() : [];
  return { from: dates[0] ?? null, to: dates.at(-1) ?? null, rows: dates.length };
}

/**
 * Pure: derives lineage from the loaded inputs and the sector's breakdown rows. `sector` is a
 * GICS sector, "cash" or "unclassified"; the last two have no benchmark ETF.
 */
export function buildSectorLineage(inputs: LineageInputs, sector: BucketKey, range: { start: string; end: string }, breakdown: SectorBreakdown | null): SectorLineage {
  const tickers = [...new Set((breakdown?.days ?? []).flatMap((d) => d.positions.map((p) => p.ticker)))].sort();
  const flags: LineageFlag[] = [];

  const missingByTicker = new Map<string, string[]>();
  for (const d of breakdown?.days ?? []) {
    for (const p of d.positions) {
      if (p.priced === "carried" || p.priced === "trade") {
        missingByTicker.set(p.ticker, [...(missingByTicker.get(p.ticker) ?? []), d.date]);
        flags.push({ date: d.date, kind: p.priced === "carried" ? "stale" : "unpriced", ticker: p.ticker });
      }
    }
  }
  const closes = tickers.map((t) => ({ ticker: t, ...coverage(inputs.prices.get(t), range), missingDays: missingByTicker.get(t) ?? [] }));

  const events: SectorLineage["events"] = [];
  for (const t of tickers) {
    for (const [date, amount] of inputs.dividends.get(t) ?? []) if (inPeriod(date, range)) events.push({ ticker: t, date, kind: "dividend", amount });
    for (const s of inputs.splits) if (s.ticker === t && inPeriod(s.date, range)) events.push({ ticker: t, date: s.date, kind: "split", ratio: s.ratio });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));

  const etf = sector in ETF_BY_SECTOR ? ETF_BY_SECTOR[sector as GicsSector] : null;
  const benchDays = inputs.benchmark.filter((b) => inPeriod(b.date, range));
  let benchmark: SectorLineage["benchmark"] = null;
  if (etf) {
    const staleDays = benchDays.filter((b) => b.staleEtfs.includes(etf)).map((b) => b.date);
    for (const d of staleDays) flags.push({ date: d, kind: "etf-stale", ticker: etf });
    benchmark = { etf, ...coverage(inputs.prices.get(etf), range), staleDays };
  }

  const applied = new Map<string, { from: string; to: string }>();
  for (const b of benchDays) {
    const a = applied.get(b.weightSetAsOf);
    if (a) a.to = b.date;
    else applied.set(b.weightSetAsOf, { from: b.date, to: b.date });
    if (b.weightSetAsOf >= b.date) flags.push({ date: b.date, kind: "before-first-weights" });
  }
  const weightSets = [...inputs.weightSets]
    .sort((a, b) => a.asOf.localeCompare(b.asOf))
    .map((w) => ({
      asOf: w.asOf,
      weight: etf ? (w.weights[sector as GicsSector] ?? null) : null,
      appliedFrom: applied.get(w.asOf)?.from ?? null,
      appliedTo: applied.get(w.asOf)?.to ?? null,
    }));

  flags.sort((a, b) => a.date.localeCompare(b.date));
  return { tickers, closes, events, benchmark, weightSets, flags };
}
