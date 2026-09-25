import { GICS_SECTORS, bucketLabel, type BucketKey, type GicsSector } from "@/lib/attribution/sectors";
import type { ConstituentSource } from "@/lib/lookthrough/parse";
import { issuerKey } from "@/lib/lookthrough/symbols";

/**
 * ETF look-through: what the Fund owns once each ETF is replaced by its holdings. Pure; an exposure report,
 * not a risk model (the covariance on Risk already sees ETF and stock overlap through returns).
 *
 * Weights are fractions of NAV unless noted. An ETF is looked through only as far as its stored list goes:
 * whatever the list doesn't cover (the ETF's cash, swaps on unnamed stocks, everything beyond Yahoo's top 10,
 * or the whole ETF when there is no list) stays in an explicit "not looked through" bucket. Every row of the
 * report therefore adds back to the book: names + not looked through + cash = 1 (up to rounding).
 */

export type EtfList = {
  etf: string;
  asOf: string;
  source: ConstituentSource;
  /** Weights in percent of the ETF's net assets. */
  constituents: { symbol: string; name: string; weight: number; sector: GicsSector | null }[];
};

export type LookthroughPosition = { ticker: string; name: string; weight: number; sector: GicsSector | null };

export type LookthroughInput = {
  /** Every position (stocks and ETFs), weights as fractions of NAV; cash separately. */
  positions: LookthroughPosition[];
  cash: number;
  /** Lists for any of the held ETFs; a position whose ticker has a list is treated as an ETF. */
  lists: EtfList[];
  /** SPY's list, for stock-level active weights and Active Share; null skips that section. */
  benchmark?: EtfList | null;
  /** Tickers known to be ETFs. An ETF with no list stays whole in the not-looked-through bucket. */
  isEtf?: (ticker: string) => boolean;
  /** GICS sector for a constituent symbol; see `buildSectorResolver`. */
  sectorOf?: (symbol: string) => GicsSector | null;
};

export type ExposureLeg = { via: string; weight: number };

export type NameExposure = {
  /** Issuer key: share classes combined (GOOGL counts as GOOG). */
  key: string;
  /** The symbols that were combined under the key. */
  symbols: string[];
  name: string;
  sector: GicsSector | null;
  total: number;
  direct: number;
  /** Heaviest first. */
  viaEtfs: ExposureLeg[];
  /** Held directly and through at least one ETF. */
  overlap: boolean;
};

export type EtfCoverageStatus = "full" | "partial" | "top-holdings" | "none";

export type EtfCoverage = {
  etf: string;
  weight: number;
  asOf: string | null;
  source: ConstituentSource | null;
  /** Share of the ETF that its list covers, 0–1. */
  coverage: number;
  lookedThrough: number;
  notLookedThrough: number;
  status: EtfCoverageStatus;
  /** Names in the list. */
  names: number;
};

export type LookthroughSector = {
  key: BucketKey;
  label: string;
  /** Each ETF counted whole in its own sector, as on Risk today. */
  asHeld: number;
  /** Through the ETFs. */
  lookthrough: number;
  /** Part of `lookthrough` that is an ETF's not-looked-through remainder, assumed to be in the ETF's own sector. */
  assumed: number;
};

export type ActiveName = { key: string; name: string; fund: number; benchmark: number; active: number };

export type ActiveWeights = {
  benchmark: { etf: string; asOf: string; source: ConstituentSource; coverage: number };
  /** Every name in either the book or the benchmark, largest absolute active weight first. Fractions of NAV. */
  rows: ActiveName[];
  largestBet: ActiveName | null;
  largestOverweight: ActiveName | null;
  largestUnderweight: ActiveName | null;
  /**
   * ½ Σ |w_fund − w_bench| over the looked-through stocks, each side scaled to sum to 1 (the standard
   * definition, which leaves cash out). 0 is an index fund; 1 shares no names with the benchmark.
   */
  activeShare: number;
  /** Share of NAV outside the Active Share calculation: cash plus the not-looked-through bucket. */
  excluded: number;
  /** Book weight in benchmark names (fractions of NAV). */
  overlapWithBenchmark: number;
};

export type LookthroughReport = {
  /** Largest total exposure first. */
  names: NameExposure[];
  etfs: EtfCoverage[];
  notLookedThrough: { total: number; byEtf: ExposureLeg[] };
  cash: number;
  sectors: LookthroughSector[];
  active: ActiveWeights | null;
  /** names + notLookedThrough + cash; 1 when the input weights add up to the book. */
  total: number;
};

const EPS = 1e-12;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/**
 * Sector for a constituent, trying in order: the securities table (names the Fund has classified), sector
 * SPDR membership (each S&P 500 name is in exactly one), then the sector the issuer printed. Null when none
 * know it; the caller then assumes the ETF's own sector.
 */
export function buildSectorResolver(opts: { direct?: Map<string, GicsSector | null>; lists?: EtfList[]; sectorEtfs?: Record<string, GicsSector> }) {
  const bySymbol = new Map<string, GicsSector>();
  const issuerStated = new Map<string, GicsSector>();
  const sectorEtfs = opts.sectorEtfs ?? {};
  for (const l of opts.lists ?? []) {
    const etfSector = sectorEtfs[l.etf];
    for (const c of l.constituents) {
      if (etfSector && !bySymbol.has(c.symbol)) bySymbol.set(c.symbol, etfSector);
      if (c.sector && !issuerStated.has(c.symbol)) issuerStated.set(c.symbol, c.sector);
    }
  }
  return (symbol: string): GicsSector | null => opts.direct?.get(symbol) ?? bySymbol.get(symbol) ?? issuerStated.get(symbol) ?? null;
}

function statusFor(list: EtfList | undefined, coverage: number): EtfCoverageStatus {
  if (!list) return "none";
  if (list.source === "yahoo-top10") return "top-holdings";
  return coverage >= 0.98 ? "full" : "partial";
}

export function buildLookthrough(input: LookthroughInput): LookthroughReport {
  const lists = new Map(input.lists.map((l) => [l.etf.toUpperCase(), l]));
  const sectorOf = input.sectorOf ?? (() => null);
  const isEtf = (t: string) => lists.has(t) || (input.isEtf?.(t) ?? false);

  type Acc = { key: string; symbols: Set<string>; name: string; nameFromDirect: boolean; sector: GicsSector | null; direct: number; via: Map<string, number> };
  const acc = new Map<string, Acc>();
  const entry = (symbol: string, name: string) => {
    const key = issuerKey(symbol.toUpperCase());
    let a = acc.get(key);
    if (!a) acc.set(key, (a = { key, symbols: new Set(), name, nameFromDirect: false, sector: null, direct: 0, via: new Map() }));
    a.symbols.add(symbol.toUpperCase());
    return a;
  };

  const etfs: EtfCoverage[] = [];
  const notLooked: ExposureLeg[] = [];
  const sectorAsHeld = new Map<BucketKey, number>();
  const sectorThrough = new Map<BucketKey, number>();
  const sectorAssumed = new Map<BucketKey, number>();
  const add = (m: Map<BucketKey, number>, k: BucketKey, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  // The Fund's own classification of a company it holds directly wins for that company inside ETFs too.
  const directSector = new Map<string, GicsSector>();
  for (const p of input.positions) if (p.sector && !lists.has(p.ticker.toUpperCase()) && !isEtf(p.ticker.toUpperCase())) directSector.set(issuerKey(p.ticker.toUpperCase()), p.sector);

  for (const p of input.positions) {
    const ticker = p.ticker.toUpperCase();
    const ownSector: BucketKey = p.sector ?? "unclassified";
    add(sectorAsHeld, ownSector, p.weight);
    const list = lists.get(ticker);
    if (!list && !isEtf(ticker)) {
      const a = entry(ticker, p.name);
      a.direct += p.weight;
      if (!a.nameFromDirect) {
        a.name = p.name;
        a.nameFromDirect = true;
      }
      a.sector = p.sector ?? a.sector;
      add(sectorThrough, ownSector, p.weight);
      continue;
    }
    // A list whose weights add to more than 100% (rounding in the issuer's file) is scaled back to the ETF.
    const listTotal = list ? sum(list.constituents.map((c) => c.weight)) : 0;
    const covered = Math.min(1, listTotal / 100);
    const scale = listTotal > 100 ? 100 / listTotal : 1;
    for (const c of list?.constituents ?? []) {
      const w = p.weight * (c.weight / 100) * scale;
      const a = entry(c.symbol, c.name);
      a.via.set(ticker, (a.via.get(ticker) ?? 0) + w);
      const sector = directSector.get(issuerKey(c.symbol.toUpperCase())) ?? sectorOf(c.symbol) ?? c.sector ?? p.sector;
      if (!a.sector && sector) a.sector = sector;
      add(sectorThrough, sector ?? "unclassified", w);
    }
    const remainder = p.weight * (1 - covered);
    if (remainder > EPS || remainder < -EPS) {
      notLooked.push({ via: ticker, weight: remainder });
      add(sectorThrough, ownSector, remainder);
      add(sectorAssumed, ownSector, remainder);
    }
    etfs.push({
      etf: ticker,
      weight: p.weight,
      asOf: list?.asOf ?? null,
      source: list?.source ?? null,
      coverage: covered,
      lookedThrough: p.weight * covered,
      notLookedThrough: remainder,
      status: statusFor(list, covered),
      names: list?.constituents.length ?? 0,
    });
  }
  add(sectorAsHeld, "cash", input.cash);
  add(sectorThrough, "cash", input.cash);

  const names: NameExposure[] = [...acc.values()]
    .map((a) => {
      const viaEtfs = [...a.via.entries()].map(([via, weight]) => ({ via, weight })).sort((x, y) => y.weight - x.weight || x.via.localeCompare(y.via));
      const total = a.direct + sum(viaEtfs.map((v) => v.weight));
      return { key: a.key, symbols: [...a.symbols].sort(), name: a.name, sector: a.sector, total, direct: a.direct, viaEtfs, overlap: a.direct > EPS && viaEtfs.length > 0 };
    })
    .sort((x, y) => y.total - x.total || x.key.localeCompare(y.key));

  const sectorKeys: BucketKey[] = [...GICS_SECTORS, "unclassified", "cash"];
  const sectors: LookthroughSector[] = sectorKeys
    .map((key) => ({ key, label: bucketLabel(key), asHeld: sectorAsHeld.get(key) ?? 0, lookthrough: sectorThrough.get(key) ?? 0, assumed: sectorAssumed.get(key) ?? 0 }))
    .filter((s) => Math.abs(s.asHeld) > EPS || Math.abs(s.lookthrough) > EPS)
    .sort((a, b) => b.lookthrough - a.lookthrough);

  const notLookedTotal = sum(notLooked.map((l) => l.weight));
  const active = input.benchmark ? activeWeights(names, input.benchmark, input.cash + notLookedTotal) : null;
  etfs.sort((a, b) => b.weight - a.weight);
  notLooked.sort((a, b) => b.weight - a.weight);

  return {
    names,
    etfs,
    notLookedThrough: { total: notLookedTotal, byEtf: notLooked },
    cash: input.cash,
    sectors,
    active,
    total: sum(names.map((n) => n.total)) + notLookedTotal + input.cash,
  };
}

/** Book vs benchmark per name (issuer keys, so the book's GOOG meets SPY's GOOG + GOOGL). */
export function activeWeights(names: NameExposure[], benchmark: EtfList, excluded: number): ActiveWeights {
  const bench = new Map<string, { name: string; weight: number }>();
  for (const c of benchmark.constituents) {
    const key = issuerKey(c.symbol.toUpperCase());
    const b = bench.get(key);
    if (b) b.weight += c.weight / 100;
    else bench.set(key, { name: c.name, weight: c.weight / 100 });
  }
  const fund = new Map(names.map((n) => [n.key, n]));
  const keys = new Set([...fund.keys(), ...bench.keys()]);
  const rows: ActiveName[] = [...keys].map((key) => {
    const f = fund.get(key)?.total ?? 0;
    const b = bench.get(key)?.weight ?? 0;
    return { key, name: fund.get(key)?.name ?? bench.get(key)!.name, fund: f, benchmark: b, active: f - b };
  });
  rows.sort((x, y) => Math.abs(y.active) - Math.abs(x.active) || x.key.localeCompare(y.key));

  const fundTotal = sum(rows.map((r) => r.fund));
  const benchTotal = sum(rows.map((r) => r.benchmark));
  const activeShare =
    fundTotal > EPS && benchTotal > EPS ? 0.5 * sum(rows.map((r) => Math.abs(r.fund / fundTotal - r.benchmark / benchTotal))) : fundTotal > EPS || benchTotal > EPS ? 1 : 0;
  const pick = (pred: (r: ActiveName) => boolean, by: (r: ActiveName) => number) => rows.filter(pred).sort((a, b) => by(b) - by(a) || a.key.localeCompare(b.key))[0] ?? null;

  return {
    benchmark: { etf: benchmark.etf, asOf: benchmark.asOf, source: benchmark.source, coverage: Math.min(1, benchTotal) },
    rows,
    largestBet: rows[0] ?? null,
    largestOverweight: pick((r) => r.active > EPS, (r) => r.active),
    largestUnderweight: pick((r) => r.active < -EPS, (r) => -r.active),
    activeShare,
    excluded,
    overlapWithBenchmark: sum(rows.filter((r) => r.benchmark > 0).map((r) => r.fund)),
  };
}

const pctText = (x: number) => `${(x * 100).toFixed(1)}%`;

/** "NVDA 4.1% = 3.0% direct + 0.9% SOXX + 0.2% SKYY". */
export function describeExposure(n: NameExposure): string {
  const parts = [...(n.direct > EPS ? [`${pctText(n.direct)} direct`] : []), ...n.viaEtfs.map((v) => `${pctText(v.weight)} ${v.via}`)];
  return `${n.key} ${pctText(n.total)} = ${parts.join(" + ")}`;
}

/** "SOXX 99.9% looked through, as of Sep 23, iShares". */
export function describeCoverage(e: EtfCoverage, sourceLabel: (s: ConstituentSource) => string): string {
  if (!e.source || !e.asOf) return `${e.etf} not looked through (no holdings list)`;
  const date = new Date(`${e.asOf}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${e.etf} ${(e.coverage * 100).toFixed(1)}% looked through, as of ${date}, ${sourceLabel(e.source)}`;
}
