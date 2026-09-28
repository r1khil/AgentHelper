import { DateTime } from "luxon";
import { closeMinute, NY, OPEN_MINUTE, type MarketPhase } from "../providers/calendar";
import { computeAttribution, computeTeamAttribution, type AttributionResult } from "./attribution";
import { BENCHMARK_REFERENCE, ETF_BY_SECTOR, INDEX_REFERENCE, type GicsSector } from "./sectors";
import { buildSeries, type SeriesInputs } from "./series";

// The Daily page: today's attribution while the market is open. Nothing here writes a close. The session is priced
// from live quotes in memory and run through the same engine as Attribution, so once the 5:00 pm price run stores the
// real closes, Attribution's 1D shows the same numbers apart from the gap between the last quote and the close.

export const DOW_SYMBOL = "^DJI";
/** A quote older than this during the session is called out. */
export const STALE_QUOTE_MS = 15 * 60_000;
/** Yahoo's previous close and ours disagreeing by more than this is called out. */
const PREV_CLOSE_TOLERANCE = 0.005;

export type LiveQuote = { price: number; asOf: string; previousClose?: number };

/** live: in the session, priced from quotes. provisional: after the bell, before the price run stores closes. final: stored closes. */
export type LiveStatus = "live" | "provisional" | "final";

export type LiveHolding = {
  ticker: string;
  name: string;
  sector: GicsSector | null;
  teamId: string | null;
  /** Share of capital at the start of the session (what the contribution is weighted by). */
  weightOpen: number;
  /** Share of capital at the current price: the open weight drifted by the day's moves. */
  weightNow: number;
  price: number | null;
  ret: number;
  contribution: number;
  pnl: number;
  /** Where the price came from: a live quote, a stored close, the prior close carried (no quote yet), or a trade price. */
  source: "quote" | "close" | "carried" | "trade";
  quoteAt: string | null;
};

/** One line of the intraday path: `base` is the price at which the leg's return for the day is zero. */
export type PathLeg = { symbol: string; weight: number; base: number };

export type LiveSnapshot = {
  status: LiveStatus;
  phase: MarketPhase;
  /** The session shown, and the close its returns are measured from. */
  session: string;
  base: string;
  opensAt: string;
  closesAt: string | null;
  /** The shown session's bell times, for the chart's time axis. */
  hours: { open: string; close: string };
  /** Newest quote the numbers use; null when they come from stored closes. */
  asOf: string | null;
  generatedAt: string;
  ret: number;
  pnl: number;
  /** Capital at the current prices: the whole Fund's NAV, or the team's holdings. */
  value: number;
  spx: number | null;
  dow: number | null;
  result: AttributionResult;
  holdings: LiveHolding[];
  notes: string[];
  legs: { portfolio: PathLeg[]; benchmark: PathLeg[] };
  /** Where the intraday path ends: the holdings' contributions, and the S&P 500 (Fund) or sector benchmark (team). */
  pathEnd: { portfolio: number; benchmark: number | null };
};

export function nyDate(iso: string) {
  return DateTime.fromISO(iso).setZone(NY).toISODate()!;
}

/** The inputs with `session` priced from quotes wherever no close is stored for it. Returns which symbols were quoted, and when. */
export function withQuotes(raw: SeriesInputs, session: string, quotes: Record<string, LiveQuote>): { raw: SeriesInputs; quoted: Map<string, string> } {
  const prices = new Map(raw.prices);
  const quoted = new Map<string, string>();
  for (const [symbol, q] of Object.entries(quotes)) {
    // A quote from an earlier session means no trade yet today: leave the close to be carried.
    if (!(q.price > 0) || nyDate(q.asOf) !== session) continue;
    const series = prices.get(symbol);
    if (series?.has(session)) continue;
    const copy = new Map(series ?? []);
    copy.set(session, q.price);
    prices.set(symbol, copy);
    quoted.set(symbol, q.asOf);
  }
  return { raw: { ...raw, prices }, quoted };
}

const bell = (iso: string, minute: number) => DateTime.fromISO(iso, { zone: NY }).set({ hour: Math.floor(minute / 60), minute: minute % 60 }).toUTC().toISO()!;

const list = (xs: string[]) => (xs.length <= 6 ? xs.join(", ") : `${xs.slice(0, 6).join(", ")} and ${xs.length - 6} more`);

export function buildLiveSnapshot(input: {
  raw: SeriesInputs;
  quotes: Record<string, LiveQuote>;
  market: { phase: MarketPhase; session: string; opensAt: string; closesAt: string | null };
  now: Date;
  team?: { id: string; sectors: GicsSector[] };
}): LiveSnapshot | null {
  const { raw, quotes, market, now, team } = input;
  if (!raw.inception) return null;
  const notes: string[] = [];

  let status: LiveStatus = "final";
  let series = raw;
  let quoted = new Map<string, string>();
  let extraDays: string[] = [];
  if (!raw.prices.get(BENCHMARK_REFERENCE)?.has(market.session) && market.session >= raw.inception) {
    const q = withQuotes(raw, market.session, quotes);
    if (q.quoted.size) {
      ({ raw: series, quoted } = q);
      extraDays = [market.session];
      status = market.phase === "open" ? "live" : "provisional";
    }
  }

  const loaded = buildSeries(series, { extraDays });
  if (!loaded.latest) return null;
  const days = loaded.inputs.days;
  const session = days.includes(market.session) ? market.session : loaded.latest;
  if (session !== market.session) notes.push(`Closes for ${market.session} are not stored yet, and there are no quotes for it. Showing ${session}.`);
  const i = days.indexOf(session);
  const base = i > 0 ? days[i - 1] : loaded.inception!;
  const day = loaded.series.portfolio.find((d) => d.date === session);
  if (!day) return null;

  const range = { start: base, end: session };
  const result = team ? computeTeamAttribution(loaded.series, range, team.id, team.sectors) : computeAttribution(loaded.series, range);
  const inScope = day.positions.filter((p) => !team || loaded.series.meta.get(p.ticker)?.teamId === team.id);
  const valueNow = inScope.reduce((s, p) => s + p.valueEnd, 0);
  const pos = new Map(inScope.map((p) => [p.ticker, p]));

  const holdings: LiveHolding[] = result.holdings.map((h) => {
    const p = pos.get(h.ticker);
    const stored = loaded.inputs.prices.get(h.ticker)?.get(session);
    const price = stored ?? (p && p.sharesEnd > 0 ? p.valueEnd / p.sharesEnd : null);
    const denom = team ? valueNow : day.navEnd;
    return {
      ticker: h.ticker,
      name: h.name,
      sector: h.sector,
      teamId: h.teamId,
      weightOpen: h.avgWeight,
      weightNow: p && denom > 0 ? p.valueEnd / denom : 0,
      price,
      ret: h.ret,
      contribution: h.contribution,
      pnl: p?.pnl ?? 0,
      source: quoted.has(h.ticker) ? "quote" : (p?.priced ?? "close"),
      quoteAt: quoted.get(h.ticker) ?? null,
    };
  });

  if (status !== "final") {
    const carried = holdings.filter((h) => h.source === "carried").map((h) => h.ticker);
    if (carried.length) notes.push(`No quote yet this session for ${list(carried)}; held at the last close.`);
    if (market.phase === "open") {
      const stale = holdings.filter((h) => h.quoteAt && now.getTime() - Date.parse(h.quoteAt) > STALE_QUOTE_MS).map((h) => h.ticker);
      if (stale.length) notes.push(`Quotes for ${list(stale)} are more than 15 minutes old.`);
    }
    const off = holdings
      .filter((h) => {
        const prev = quotes[h.ticker]?.previousClose;
        const ours = loaded.inputs.prices.get(h.ticker)?.get(base);
        return h.source === "quote" && prev && ours && Math.abs(prev / ours - 1) > PREV_CLOSE_TOLERANCE;
      })
      .map((h) => h.ticker);
    if (off.length) notes.push(`Yahoo's previous close for ${list(off)} differs from the stored close; returns are measured from the stored close.`);
  }

  const index = loaded.index;
  const spx0 = index.get(base);
  const spx1 = index.get(session);
  const dowQuote = quotes[DOW_SYMBOL];
  const dow = dowQuote?.previousClose && nyDate(dowQuote.asOf) === session ? dowQuote.price / dowQuote.previousClose - 1 : null;

  // Intraday path: each holding from the price at which its return for the day is zero, so the path ends on the
  // engine's figure even for a position bought today; the benchmark from the base close.
  const portfolioLegs: PathLeg[] = holdings.filter((h) => h.price && h.ret > -1).map((h) => ({ symbol: h.ticker, weight: h.weightOpen, base: h.price! / (1 + h.ret) }));
  let benchmarkLegs: PathLeg[] = [];
  if (!team) {
    if (spx0) benchmarkLegs = [{ symbol: INDEX_REFERENCE, weight: 1, base: spx0 }];
  } else {
    const b = loaded.series.benchmark.find((x) => x.date === session);
    const total = b ? team.sectors.reduce((s, k) => s + b.weights[k], 0) : 0;
    if (b && total > 0) {
      benchmarkLegs = team.sectors
        .map((k) => ({ symbol: ETF_BY_SECTOR[k], weight: b.weights[k] / total, base: loaded.inputs.prices.get(ETF_BY_SECTOR[k])?.get(base) ?? 0 }))
        .filter((l) => l.base > 0 && l.weight > 0);
    }
  }

  const quoteTimes = [...quoted.values()].sort();
  return {
    status,
    phase: market.phase,
    session,
    base,
    opensAt: market.opensAt,
    closesAt: market.closesAt,
    hours: { open: bell(session, OPEN_MINUTE), close: bell(session, closeMinute(session)) },
    asOf: quoteTimes.at(-1) ?? null,
    generatedAt: now.toISOString(),
    ret: team ? result.portfolioReturn : day.ret,
    pnl: team ? inScope.reduce((s, p) => s + p.pnl, 0) : day.navEnd - day.navStart - day.extFlow,
    value: team ? valueNow : day.navEnd,
    spx: spx0 && spx1 ? spx1 / spx0 - 1 : null,
    dow,
    result,
    holdings,
    notes,
    legs: { portfolio: portfolioLegs, benchmark: benchmarkLegs },
    pathEnd: { portfolio: holdings.reduce((s, h) => s + h.contribution, 0), benchmark: team ? result.benchmarkReturn : spx0 && spx1 ? spx1 / spx0 - 1 : null },
  };
}

export type IntradayBar = { t: string; close: number };
/** Returns in fractions from the base close, at each bar time. */
export type PathPoint = { t: string; portfolio: number; benchmark: number | null };

/**
 * The day so far, on the union of every leg's bar times. A leg with no bar yet sits at its base (zero return); after
 * that it holds its last bar. `end` (the snapshot's own figures) closes the line on the numbers the page shows.
 */
export function intradayPath(legs: LiveSnapshot["legs"], bars: Record<string, IntradayBar[]>, end?: PathPoint): PathPoint[] {
  const times = [...new Set([...legs.portfolio, ...legs.benchmark].flatMap((l) => (bars[l.symbol] ?? []).map((b) => b.t)))].sort();
  const level = (ls: PathLeg[], t: string, cursor: Map<string, number>) =>
    ls.reduce((s, l) => {
      const series = bars[l.symbol] ?? [];
      let k = cursor.get(l.symbol) ?? -1;
      while (k + 1 < series.length && series[k + 1].t <= t) k++;
      cursor.set(l.symbol, k);
      const price = k >= 0 ? series[k].close : l.base;
      return s + l.weight * (price / l.base - 1);
    }, 0);
  const pc = new Map<string, number>();
  const bc = new Map<string, number>();
  const out = times.map((t) => ({ t, portfolio: level(legs.portfolio, t, pc), benchmark: legs.benchmark.length ? level(legs.benchmark, t, bc) : null }));
  if (end && (!out.length || end.t > out.at(-1)!.t)) out.push(end);
  return out;
}
