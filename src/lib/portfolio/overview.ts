import "server-only";
import { cache } from "react";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { fmtDayMonth } from "@/lib/format";
import { computeAttribution } from "@/lib/attribution/attribution";
import { withQuotes, type LiveQuote, type LiveStatus } from "@/lib/attribution/live";
import { resolvePeriod } from "@/lib/attribution/periods";
import { BENCHMARK_REFERENCE, benchmarkSymbols, ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { buildSeries, readSeriesInputs, type LoadedSeries } from "@/lib/attribution/store";
import { indexReturn } from "@/lib/attribution/view";
import { marketPhase } from "@/lib/providers/calendar";
import { getQuotes } from "@/lib/providers/yahoo";
import { buildReturnWindow } from "@/lib/risk/inputs";
import { loadStoredPrices, windowStart } from "@/lib/risk/load";
import { MARKET } from "@/lib/risk/model";
import { joinHistory, replayLevels, type ChartPoint } from "./chart";

// The fund's book, as the Overview and a holding's page read it: the ledger replayed with today's session priced from
// live quotes (the same rule as the Daily page), so the value, today's change and every position agree with
// Performance once the closes are stored.

export type OverviewPosition = {
  ticker: string;
  name: string;
  teamId: string | null;
  shares: number;
  price: number;
  /** Percent since the previous close; null when there is none to compare with (bought today, no prior close). */
  dayPct: number | null;
  /** Dollars gained today. */
  dayPnl: number;
  value: number;
  /** Percent of the fund's value. */
  weight: number;
  /** Dollars gained since the ledger opened (realized and unrealized), and the cost that leaves the position with. */
  gain: number;
  cost: number;
};

/** What the ledger holds now and what it is worth, priced live: everything the Overview and a holding's Fund position share. */
export type LiveLedger = {
  status: LiveStatus;
  session: string;
  inception: string;
  /** The session before it, the base of today's returns; null on the ledger's first day. */
  base: string | null;
  /** Newest quote the numbers use; null when they come from stored closes. */
  quotesAsOf: string | null;
  value: number;
  dayPnl: number;
  /** Percent. */
  dayPct: number;
  /** The value the session's return is measured on: yesterday's value plus any deposit today. */
  dayBase: number;
  cash: { value: number; weightPct: number };
  positions: OverviewPosition[];
  /** Data problems worth a look, in the words "Needs you" uses: a tag (Check or Stale), what, and a line of detail. */
  attention: { tag: "Check" | "Stale"; title: string; meta: string; href: string }[];
  /** Small print under the value: quotes that are missing or old. */
  notes: string[];
  /** The replayed series, for callers that need more than the positions (they must not mutate it). */
  loaded: LoadedSeries;
};

export type Overview = LiveLedger & {
  /** Today against the benchmark in basis points, and what "the benchmark" is; null until one can be measured. */
  vsBenchmark: { bp: number; label: "the benchmark" | "the S&P 500" } | null;
  /** The ledger's whole life: the fund's time-weighted return against the benchmark, and how the difference splits. */
  since: { from: string; pct: number; benchmarkPct: number | null; activeBp: number | null; allocationBp: number | null; selectionBp: number | null } | null;
  chart: ChartPoint[];
  /** Why the chart has no replay before the ledger opened, when it doesn't. */
  chartNote: string | null;
};

const bp = (x: number) => x * 10_000;
/** Benchmark weights this many days old are stale (the same limit Performance's data notices use). */
const STALE_WEIGHTS_DAYS = 100;
const HISTORY = "2y" as const;

function dataAttention(loaded: LoadedSeries, held: string[], session: string): LiveLedger["attention"] {
  const out: LiveLedger["attention"] = [];
  const ledger = `/t/${FUND_SCOPE_SLUG}/activity`;
  const lastSet = loaded.weightSets.at(-1);
  if (!lastSet) out.push({ tag: "Check", title: "Benchmark weights", meta: "None saved, so allocation and selection can't be measured", href: `${ledger}?tab=benchmark` });
  else {
    const age = Math.floor(DateTime.fromISO(session).diff(DateTime.fromISO(lastSet.asOf), "days").days);
    if (age > STALE_WEIGHTS_DAYS) out.push({ tag: "Stale", title: "Benchmark weights", meta: `Saved ${fmtDayMonth(lastSet.asOf)}, ${age} days ago`, href: `${ledger}?tab=benchmark` });
  }
  const unpriced = loaded.quality.ledger.unpriced;
  if (unpriced.length) out.push({ tag: "Check", title: `No price history for ${unpriced.slice(0, 3).join(", ")}${unpriced.length > 3 ? ` and ${unpriced.length - 3} more` : ""}`, meta: "Valued at the trade price until the next price run", href: ledger });
  const unclassified = held.filter((t) => !loaded.series.meta.get(t)?.sector);
  if (unclassified.length) out.push({ tag: "Check", title: `No sector for ${unclassified.slice(0, 3).join(", ")}${unclassified.length > 3 ? ` and ${unclassified.length - 3} more` : ""}`, meta: "Left out of the sector effects", href: `${ledger}?tab=securities` });
  return out;
}

/** Per request. Null when nothing has been recorded or no closes are stored yet. */
export const loadLiveLedger = cache(async (): Promise<LiveLedger | null> => {
  const now = new Date();
  const market = marketPhase(now);
  const raw = await readSeriesInputs(db);
  if (!raw.inception) return null;

  const notes: string[] = [];
  const symbols = [...new Set([...raw.trades.map((t) => t.ticker), ...benchmarkSymbols()])];
  const quotes = await getQuotes(symbols).catch((e): Record<string, LiveQuote> => {
    console.error("[overview] quotes failed", e);
    notes.push("Live quotes are unavailable right now, so prices are the last stored closes.");
    return {};
  });

  let status: LiveStatus = "final";
  let series = raw;
  let quoted = new Map<string, string>();
  let extraDays: string[] = [];
  if (!raw.prices.get(BENCHMARK_REFERENCE)?.has(market.session) && market.session >= raw.inception) {
    const q = withQuotes(raw, market.session, quotes);
    if (q.quoted.size) {
      series = q.raw;
      quoted = q.quoted;
      extraDays = [market.session];
      status = market.phase === "open" ? "live" : "provisional";
    }
  }

  const loaded = buildSeries(series, { extraDays });
  const days = loaded.series.portfolio;
  const last = days.at(-1);
  if (!loaded.latest || !last) return null;
  const session = last.date;
  const base = days.at(-2)?.date ?? null;

  // Positions: what the ledger holds now, priced at the session's close (or its live quote).
  const closes = loaded.inputs.prices;
  const held = last.positions.filter((p) => p.sharesEnd > 0);
  const gains = new Map<string, number>();
  for (const d of days) for (const p of d.positions) gains.set(p.ticker, (gains.get(p.ticker) ?? 0) + p.pnl);
  const positions: OverviewPosition[] = held
    .map((p) => {
      const price = p.valueEnd / p.sharesEnd;
      const prev = base ? closes.get(p.ticker)?.get(base) : undefined;
      const gain = gains.get(p.ticker) ?? 0;
      return {
        ticker: p.ticker,
        name: loaded.series.meta.get(p.ticker)?.name ?? p.ticker,
        teamId: loaded.series.meta.get(p.ticker)?.teamId ?? null,
        shares: p.sharesEnd,
        price,
        dayPct: prev && prev > 0 && p.priced !== "trade" ? (price / prev - 1) * 100 : null,
        dayPnl: p.pnl,
        value: p.valueEnd,
        weight: last.navEnd > 0 ? (p.valueEnd / last.navEnd) * 100 : 0,
        gain,
        cost: p.valueEnd - gain,
      };
    })
    .sort((a, b) => b.value - a.value);

  if (status !== "final") {
    const carried = held.filter((p) => p.priced === "carried").map((p) => p.ticker);
    if (carried.length) notes.push(`No quote yet this session for ${carried.slice(0, 6).join(", ")}${carried.length > 6 ? ` and ${carried.length - 6} more` : ""}; held at the last close.`);
  } else if (session < market.session) {
    notes.push(`Closes for ${market.session} are not stored yet, so this is ${session}.`);
  }
  const stale = loaded.quality.ledger.stale.filter((s) => s.date === session);
  if (stale.length) notes.push(`${stale.length} position${stale.length === 1 ? " has" : "s have"} no close for ${session}; the last known price stands in.`);

  return {
    status,
    session,
    inception: loaded.inception!,
    base,
    quotesAsOf: [...quoted.values()].sort().at(-1) ?? null,
    value: last.navEnd,
    dayPnl: last.navEnd - last.navStart - last.extFlow,
    dayPct: last.ret * 100,
    dayBase: last.navStart + last.extFlow,
    cash: { value: last.cashEnd, weightPct: last.navEnd > 0 ? (last.cashEnd / last.navEnd) * 100 : 0 },
    positions,
    attention: dataAttention(loaded, held.map((p) => p.ticker), session),
    notes,
    loaded,
  };
});

/** The Overview: the live ledger plus how it did against the benchmark and its history, with today's weights replayed before the ledger opened. */
export const loadFundOverview = cache(async (): Promise<Overview | null> => {
  const live = await loadLiveLedger();
  if (!live) return null;
  const { loaded, base, session } = live;
  const days = loaded.series.portfolio;
  const last = days.at(-1)!;

  // Today against the benchmark: the sector benchmark when weights are saved (Performance's own measure), else the S&P 500.
  let vsBenchmark: Overview["vsBenchmark"] = null;
  if (base) {
    const today = computeAttribution(loaded.series, { start: base, end: session });
    if (today.activeReturn !== null) vsBenchmark = { bp: bp(today.activeReturn), label: "the benchmark" };
    else {
      const spx = indexReturn(loaded, { start: base, end: session });
      if (spx !== null) vsBenchmark = { bp: bp(last.ret - spx), label: "the S&P 500" };
    }
  }

  let since: Overview["since"] = null;
  if (days.length > 1) {
    const period = resolvePeriod("itd", { inception: live.inception, latest: loaded.latest! });
    const r = computeAttribution(loaded.series, period);
    since = {
      from: period.start,
      pct: r.portfolioReturn * 100,
      benchmarkPct: r.benchmarkReturn === null ? null : r.benchmarkReturn * 100,
      activeBp: r.activeReturn === null ? null : bp(r.activeReturn),
      allocationBp: r.effects ? bp(r.effects.allocation) : null,
      selectionBp: r.effects ? bp(r.effects.selection) : null,
    };
  }

  // History before the ledger: today's weights over those days' prices.
  let chart: ChartPoint[] = days.map((d) => ({ date: d.date, value: d.navEnd, replay: false }));
  let chartNote: string | null = null;
  try {
    const held = last.positions.filter((p) => p.sharesEnd > 0);
    const tickers = held.map((p) => p.ticker);
    const etfs = Object.values(ETF_BY_SECTOR);
    const from = [windowStart(live.inception, HISTORY), live.inception].sort()[0];
    const { prices, dividends } = await loadStoredPrices([...tickers, ...etfs, MARKET], from);
    const window = buildReturnWindow(prices, dividends, tickers, live.inception, HISTORY);
    const sectorOf = (t: string) => loaded.series.meta.get(t)?.sector ?? null;
    const levels = replayLevels(
      held.map((p) => (last.navEnd > 0 ? p.valueEnd / last.navEnd : 0)),
      held.map((p) => window.returns.get(p.ticker) ?? []),
      held.map((p) => {
        const s = sectorOf(p.ticker);
        return s ? window.returns.get(ETF_BY_SECTOR[s]) : undefined;
      }),
      window.dates.length,
    );
    chart = joinHistory({ dates: window.dates, levels }, chart);
  } catch (e) {
    console.error("[overview] replay failed", e);
    chartNote = "Price history from before the ledger opened could not be loaded.";
  }

  return { ...live, vsBenchmark, since, chart, chartNote };
});
