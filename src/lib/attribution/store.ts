import { asc, desc, eq, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import { benchmarkSectorWeights, cashFlows, holdings, securities, trades, type Security } from "@/db/schema";
import { loadCloses, loadEvents } from "@/lib/market-data";
import { getSectorProfile, lookupCompany } from "@/lib/providers/yahoo";
import { pickCompanyName } from "@/lib/company-name";
import type { Db } from "@/lib/prices";
import { FACTOR_ETFS } from "@/lib/risk/factor-symbols";
import { STRESS_HISTORY_FROM } from "@/lib/risk/stress";
import { latestPositions } from "./ledger";
import { buildSeries, type LoadedSeries, type SeriesInputs } from "./series";

export { buildSeries, type LoadedSeries, type SeriesInputs };
import { benchmarkSymbols, defaultSector, type GicsSector } from "./sectors";
import type { BenchmarkWeightSet, CashFlow, DateSeries, Split, Trade } from "./types";

/** Days of closes kept before inception so first-day returns have a prior close. */
export const HISTORY_MARGIN_DAYS = 10;
/** Calendar days of closes the Risk page needs for its longest (2-year) window, with margin. */
export const RISK_HISTORY_DAYS = 760;
/** 13-week Treasury bill yield, the Risk page's risk-free rate. */
export const RISK_FREE_SYMBOL = "^IRX";

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

/**
 * Where the price job backfills from: the earliest of inception, the Risk page's longest window and
 * the first stress test's start. Only symbols without that history get a backfill; the rest top up a week.
 */
export function priceHistoryFrom(inception: string, today = DateTime.now().toISODate()!) {
  const risk = DateTime.fromISO(today).minus({ days: RISK_HISTORY_DAYS }).toISODate()!;
  return [risk, historyFrom(inception), STRESS_HISTORY_FROM].sort()[0];
}

export async function readSeriesInputs(db: Db, overrides?: { trades?: Trade[]; cashFlows?: CashFlow[] }): Promise<SeriesInputs> {
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
  const base = { trades: tradeList, cashFlows: flowList, inception, weightSets: [...byAsOf.values()] };
  if (!inception) return { ...base, prices: new Map(), dividends: new Map(), splits: [], meta: new Map() };

  const symbols = [...new Set([...tradeList.map((t) => t.ticker), ...benchmarkSymbols()])];
  const from = historyFrom(inception);
  const [closeRows, eventRows, securityRows] = await Promise.all([
    loadCloses(db, symbols, { from }),
    loadEvents(db, symbols),
    db.select().from(securities),
  ]);

  const prices: DateSeries = new Map();
  for (const r of closeRows) put(prices, r.ticker, r.date, Number(r.close));
  const dividends: DateSeries = new Map();
  const splits: Split[] = [];
  for (const e of eventRows) {
    if (e.kind === "dividend" && e.amount) put(dividends, e.ticker, e.date, Number(e.amount));
    if (e.kind === "split" && e.ratio) splits.push({ ticker: e.ticker, date: e.date, ratio: Number(e.ratio) });
  }
  const meta = new Map(securityRows.map((s) => [s.ticker, { ticker: s.ticker, name: s.name, sector: s.sector, teamId: s.teamId }]));
  return { ...base, prices, dividends, splits, meta };
}

/** Everything the attribution engine needs, replayed from inception. Period-independent. */
export async function loadSeries(db: Db, overrides?: { trades?: Trade[]; cashFlows?: CashFlow[] }): Promise<LoadedSeries> {
  const raw = await readSeriesInputs(db, overrides);
  // A what-if replay (validating an edit) must see ledger dates that have no close yet.
  const extraDays = overrides ? [...raw.trades.map((t) => t.date), ...raw.cashFlows.map((f) => f.date)] : [];
  return buildSeries(raw, { extraDays });
}

/**
 * Symbols the price job maintains: everything ever traded, every active holding (one added before its first trade
 * still needs closes for its sparkline and the weekly pack), the benchmark ETFs, the risk-free rate and the factor ETFs.
 */
export async function ledgerSymbols(db: Db): Promise<string[]> {
  const [rows, active] = await Promise.all([
    db.selectDistinct({ ticker: trades.ticker }).from(trades).where(isNull(trades.voidedAt)),
    db.selectDistinct({ ticker: holdings.ticker }).from(holdings).where(eq(holdings.status, "active")),
  ]);
  return [...new Set([...rows.map((r) => r.ticker), ...active.map((r) => r.ticker), ...benchmarkSymbols(), RISK_FREE_SYMBOL, ...FACTOR_ETFS])];
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
      // The covering holding's name keeps the ledger and the holding page in step, unless it is in SEC capitals.
      name: pickCompanyName(ticker, [covering?.name, company.name]),
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
