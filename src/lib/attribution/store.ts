import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import { benchmarkSectorWeights, cashFlows, dailyCloses, holdings, securities, securityEvents, trades, type Security } from "@/db/schema";
import { getSectorProfile, lookupCompany } from "@/lib/providers/yahoo";
import type { Db } from "@/lib/prices";
import type { AttributionSeries } from "./attribution";
import { buildBenchmarkDays } from "./benchmark";
import { adjustForSplits, buildPortfolioDays, latestPositions } from "./ledger";
import { BENCHMARK_REFERENCE, benchmarkSymbols, defaultSector, type GicsSector } from "./sectors";
import type { BenchmarkQuality, BenchmarkWeightSet, CashFlow, DateSeries, LedgerQuality, Split, Trade } from "./types";

/** Days of closes kept before inception so first-day returns have a prior close. */
export const HISTORY_MARGIN_DAYS = 10;

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
  quality: { ledger: LedgerQuality; benchmark: BenchmarkQuality };
  /** The raw inputs the series was built from (references, not copies), for data lineage. */
  inputs: { prices: DateSeries; dividends: DateSeries; splits: Split[]; days: string[] };
};

function put(series: DateSeries, ticker: string, date: string, value: number) {
  let m = series.get(ticker);
  if (!m) series.set(ticker, (m = new Map()));
  m.set(date, value);
}

export async function loadLedger(db: Db): Promise<{ trades: Trade[]; cashFlows: CashFlow[]; inception: string | null }> {
  const [t, f] = await Promise.all([
    db.select().from(trades).where(isNull(trades.voidedAt)).orderBy(asc(trades.tradeDate), asc(trades.createdAt)),
    db.select().from(cashFlows).where(isNull(cashFlows.voidedAt)).orderBy(asc(cashFlows.flowDate), asc(cashFlows.createdAt)),
  ]);
  const dates = [...t.map((x) => x.tradeDate), ...f.map((x) => x.flowDate)].sort();
  return {
    trades: t.map((x) => ({ date: x.tradeDate, ticker: x.ticker, side: x.side, shares: Number(x.shares), price: Number(x.price), fees: Number(x.fees) })),
    cashFlows: f.map((x) => ({ date: x.flowDate, kind: x.kind, amount: Number(x.amount) })),
    inception: dates[0] ?? null,
  };
}

export function historyFrom(inception: string) {
  return DateTime.fromISO(inception).minus({ days: HISTORY_MARGIN_DAYS }).toISODate()!;
}

/** Everything the attribution engine needs, replayed from inception. Period-independent. */
export async function loadSeries(db: Db, overrides?: { trades?: Trade[]; cashFlows?: CashFlow[] }): Promise<LoadedSeries> {
  const ledger = await loadLedger(db);
  const tradeList = overrides?.trades ?? ledger.trades;
  const flowList = overrides?.cashFlows ?? ledger.cashFlows;
  const inception = [...tradeList.map((t) => t.date), ...flowList.map((f) => f.date)].sort()[0] ?? null;

  const weightRows = await db.select().from(benchmarkSectorWeights).orderBy(asc(benchmarkSectorWeights.asOf));
  const byAsOf = new Map<string, BenchmarkWeightSet>();
  for (const w of weightRows) {
    const set = byAsOf.get(w.asOf) ?? { asOf: w.asOf, weights: {} };
    set.weights[w.sector] = Number(w.weightPct);
    byAsOf.set(w.asOf, set);
  }
  const weightSets = [...byAsOf.values()];

  const empty: LoadedSeries = {
    series: { portfolio: [], benchmark: [], meta: new Map() },
    inception,
    latest: null,
    weightSets,
    reference: new Map(),
    referenceDividends: new Map(),
    quality: { ledger: { stale: [], unpriced: [], oversold: [] }, benchmark: { beforeFirstWeights: false, staleEtf: [] } },
    inputs: { prices: new Map(), dividends: new Map(), splits: [], days: [] },
  };
  if (!inception) return empty;

  const symbols = [...new Set([...tradeList.map((t) => t.ticker), ...benchmarkSymbols()])];
  const from = historyFrom(inception);
  const [closeRows, eventRows, securityRows] = await Promise.all([
    db
      .select({ ticker: dailyCloses.ticker, date: dailyCloses.sessionDate, close: dailyCloses.close })
      .from(dailyCloses)
      .where(and(inArray(dailyCloses.ticker, symbols), gte(dailyCloses.sessionDate, from))),
    db.select().from(securityEvents).where(inArray(securityEvents.ticker, symbols)),
    db.select().from(securities),
  ]);

  const prices: DateSeries = new Map();
  for (const r of closeRows) put(prices, r.ticker, r.date, Number(r.close));
  const dividends: DateSeries = new Map();
  const splits: Split[] = [];
  for (const e of eventRows) {
    if (e.kind === "dividend" && e.amount) put(dividends, e.ticker, e.exDate, Number(e.amount));
    if (e.kind === "split" && e.ratio) splits.push({ ticker: e.ticker, date: e.exDate, ratio: Number(e.ratio) });
  }

  // A valuation day is one the reference index closed on.
  const reference = prices.get(BENCHMARK_REFERENCE) ?? new Map<string, number>();
  const daySet = new Set([...reference.keys()].filter((d) => d >= inception));
  // A what-if replay (validating an edit) must see ledger dates that have no close yet.
  if (overrides) for (const d of [...tradeList.map((t) => t.date), ...flowList.map((f) => f.date)]) daySet.add(d);
  const days = [...daySet].sort();
  if (!days.length) return { ...empty, reference, inputs: { prices, dividends, splits, days } };

  const portfolio = buildPortfolioDays({ trades: adjustForSplits(tradeList, splits), cashFlows: flowList, prices, dividends, days });
  const benchmark = buildBenchmarkDays(weightSets, prices, dividends, days);
  const meta = new Map(securityRows.map((s) => [s.ticker, { ticker: s.ticker, name: s.name, sector: s.sector, teamId: s.teamId }]));

  return {
    series: { portfolio: portfolio.days, benchmark: benchmark.days, meta },
    inception,
    latest: days.at(-1)!,
    weightSets,
    reference,
    referenceDividends: dividends.get(BENCHMARK_REFERENCE) ?? new Map(),
    quality: { ledger: portfolio.quality, benchmark: benchmark.quality },
    inputs: { prices, dividends, splits, days },
  };
}

/** Symbols the price job maintains: everything ever traded plus the benchmark ETFs. */
export async function ledgerSymbols(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ ticker: trades.ticker }).from(trades).where(isNull(trades.voidedAt));
  return [...new Set([...rows.map((r) => r.ticker), ...benchmarkSymbols()])];
}

/** Create the securities row for a ticker on first use: name, default sector and owning team. */
export async function ensureSecurity(db: Db, rawTicker: string): Promise<Security | null> {
  const ticker = rawTicker.toUpperCase();
  const [existing] = await db.select().from(securities).where(eq(securities.ticker, ticker)).limit(1);
  if (existing) return existing;
  const company = await lookupCompany(ticker);
  if (!company) return null;
  const profile = await getSectorProfile(ticker);
  const guess = defaultSector(ticker, profile.sector);
  const [covering] = await db
    .select({ teamId: holdings.teamId, name: holdings.companyName })
    .from(holdings)
    .where(eq(holdings.ticker, ticker))
    .orderBy(asc(holdings.status), desc(holdings.createdAt))
    .limit(1);
  const [row] = await db
    .insert(securities)
    .values({
      ticker,
      name: covering?.name ?? company.name,
      sector: (guess?.sector ?? null) as GicsSector | null,
      sectorSource: guess?.source ?? null,
      yahooSector: profile.sector,
      industry: profile.industry,
      teamId: covering?.teamId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? (await db.select().from(securities).where(eq(securities.ticker, ticker)).limit(1))[0] ?? null;
}

/** Once a ledger exists it owns share counts: copy the latest positions onto active holdings. */
export async function syncHoldingsFromLedger(db: Db): Promise<number> {
  const loaded = await loadSeries(db);
  if (!loaded.latest) return 0;
  const positions = new Map(latestPositions(loaded.series.portfolio).map((p) => [p.ticker, p]));
  const active = await db.select({ id: holdings.id, ticker: holdings.ticker }).from(holdings).where(eq(holdings.status, "active"));
  for (const h of active) {
    const p = positions.get(h.ticker);
    await db
      .update(holdings)
      .set({ shares: p ? p.shares.toFixed(6) : null, weightPct: p ? (p.weight * 100).toFixed(2) : null })
      .where(eq(holdings.id, h.id));
  }
  return active.length;
}
