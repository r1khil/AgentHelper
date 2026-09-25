import { DateTime } from "luxon";
import { BENCHMARK_REFERENCE, ETF_BY_SECTOR, GICS_SECTORS, type GicsSector } from "@/lib/attribution/sectors";
import { buildLookthrough, buildSectorResolver, type EtfList, type LookthroughReport } from "./lookthrough";
import type { RiskReport } from "./model";

/**
 * Glue between the Risk report (positions, sector benchmark) and the look-through math. Pure, so the Exposure
 * page, its CSV, Hoot and the /dev preview all get the same numbers from the same stored lists.
 */

/** A held ETF's list older than this (against the positions' date) is flagged as stale on the page. */
export const STALE_AFTER_DAYS = 14;

const SECTOR_OF_ETF = Object.fromEntries(Object.entries(ETF_BY_SECTOR).map(([s, e]) => [e, s])) as Record<string, GicsSector>;

export type LookthroughState =
  | { state: "unavailable"; reason: "no-table" | "no-lists"; heldEtfs: string[] }
  | {
      state: "ok";
      report: LookthroughReport;
      heldEtfs: string[];
      /** "SPY" for the Fund; the team's sector SPDRs ("XLK + XLC") for a team. Null when its lists are missing. */
      benchmarkLabel: string | null;
      /** Why there are no stock-level active weights, when there aren't. */
      benchmarkMissing: string | null;
      /** Held ETFs whose list is older than STALE_AFTER_DAYS. */
      stale: string[];
    };

/**
 * A benchmark made of several ETFs at given weights (fractions adding to 1), as one list in percent: the team
 * view's sector SPDRs at the team's benchmark sector weights.
 */
export function composeBenchmark(label: string, legs: { list: EtfList; weight: number }[]): EtfList {
  const bySymbol = new Map<string, EtfList["constituents"][number]>();
  for (const { list, weight } of legs) {
    for (const c of list.constituents) {
      const prev = bySymbol.get(c.symbol);
      if (prev) prev.weight += c.weight * weight;
      else bySymbol.set(c.symbol, { ...c, weight: c.weight * weight });
    }
  }
  const asOf = legs.map((l) => l.list.asOf).sort()[0] ?? "";
  return { etf: label, asOf, source: legs[0]?.list.source ?? "ssga", constituents: [...bySymbol.values()].sort((a, b) => b.weight - a.weight) };
}

/**
 * The look-through for a Risk report. `lists` may hold any stored lists: those of held ETFs are looked through,
 * SPY is the Fund's stock-level benchmark, and the sector SPDRs classify constituents (and make up a team's benchmark).
 */
export function lookthroughFromRisk(r: RiskReport, lists: EtfList[], opts: { isEtf: (ticker: string) => boolean }): LookthroughState {
  const byEtf = new Map(lists.map((l) => [l.etf.toUpperCase(), l]));
  const heldEtfs = r.holdings.map((h) => h.ticker.toUpperCase()).filter((t) => opts.isEtf(t) || byEtf.has(t));
  const heldLists = heldEtfs.map((t) => byEtf.get(t)).filter((l): l is EtfList => Boolean(l));

  let benchmark: EtfList | null = null;
  let benchmarkLabel: string | null = null;
  let benchmarkMissing: string | null = null;
  if (r.scope === "fund") {
    benchmark = byEtf.get(BENCHMARK_REFERENCE) ?? null;
    benchmarkLabel = BENCHMARK_REFERENCE;
    if (!benchmark) benchmarkMissing = `${BENCHMARK_REFERENCE}'s holdings aren't stored yet.`;
  } else {
    const legs = r.sectors
      .filter((s): s is typeof s & { key: GicsSector } => (GICS_SECTORS as readonly string[]).includes(s.key) && (s.benchWeight ?? 0) > 0)
      .map((s) => ({ etf: ETF_BY_SECTOR[s.key], weight: s.benchWeight! }));
    benchmarkLabel = legs.map((l) => l.etf).join(" + ") || null;
    const missing = legs.filter((l) => !byEtf.has(l.etf)).map((l) => l.etf);
    if (!legs.length) benchmarkMissing = "The team has no benchmark sectors.";
    else if (missing.length) benchmarkMissing = `${missing.join(", ")} holdings aren't stored yet.`;
    else benchmark = composeBenchmark(benchmarkLabel!, legs.map((l) => ({ list: byEtf.get(l.etf)!, weight: l.weight })));
  }

  if (heldEtfs.length && !heldLists.length && !benchmark) return { state: "unavailable", reason: "no-lists", heldEtfs };

  const sectorOf = buildSectorResolver({ lists, sectorEtfs: SECTOR_OF_ETF });
  const report = buildLookthrough({
    positions: r.holdings.map((h) => ({ ticker: h.ticker, name: h.name, weight: h.weight, sector: h.sector })),
    cash: r.cash.weight,
    lists: heldLists,
    benchmark,
    isEtf: opts.isEtf,
    sectorOf,
  });
  const cutoff = DateTime.fromISO(r.asOf).minus({ days: STALE_AFTER_DAYS }).toISODate()!;
  const stale = heldLists.filter((l) => l.asOf < cutoff).map((l) => l.etf);
  return { state: "ok", report, heldEtfs, benchmarkLabel, benchmarkMissing, stale };
}
