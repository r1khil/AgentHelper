import { z } from "zod";
import { cached } from "./cache";
import { retry, spaced } from "./limiter";

// Kalshi and Polymarket publish their order books without a key. A price here is what traders pay for a contract
// that pays $1 if the outcome happens, so the bid/ask midpoint reads as the crowd's probability. It is not a survey
// of economists: callers keep it apart from consensus.
export const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";
export const POLYMARKET_API = "https://gamma-api.polymarket.com";

/** A rung whose bid and ask are further apart than this says little about the odds; skip it. */
export const MAX_SPREAD = 0.2;
/** Lifetime volume under this (contracts on Kalshi, each paying $1; dollars on Polymarket) is too thin to read. */
export const MIN_VOLUME = 1_000;

export type LadderMarket = {
  strike_type?: string | null;
  floor_strike?: number | null;
  yes_bid_dollars?: number | null;
  yes_ask_dollars?: number | null;
};

/** Each informative rung's chance the release comes in above its strike, made non-increasing. */
export function ladder(markets: LadderMarket[]) {
  const rungs = markets
    .filter((m) => (m.strike_type === "greater" || m.strike_type === "greater_or_equal") && m.floor_strike != null)
    .filter((m) => m.yes_bid_dollars != null && m.yes_ask_dollars != null && m.yes_ask_dollars > 0)
    .filter((m) => m.yes_ask_dollars! - m.yes_bid_dollars! <= MAX_SPREAD)
    .map((m) => ({ strike: m.floor_strike!, p: (m.yes_bid_dollars! + m.yes_ask_dollars!) / 2 }))
    .sort((a, b) => a.strike - b.strike);
  for (let i = 1; i < rungs.length; i++) rungs[i].p = Math.min(rungs[i].p, rungs[i - 1].p);
  return rungs;
}

/** Where the market puts even odds, interpolated between the rungs either side of 50%. */
export function impliedMedian(rungs: ReturnType<typeof ladder>) {
  for (let i = 0; i + 1 < rungs.length; i++) {
    const [a, b] = [rungs[i], rungs[i + 1]];
    if (a.p >= 0.5 && b.p < 0.5)
      return a.strike + ((a.p - 0.5) / (a.p - b.p)) * (b.strike - a.strike);
  }
  return null;
}

/** For stepped outcomes: the likeliest level and its chance. "Above 4.00%" makes 4.25% a level. */
export function likeliestOutcome(rungs: ReturnType<typeof ladder>, step: number) {
  if (!rungs.length) return null;
  const outcomes = [{ level: rungs[0].strike, p: 1 - rungs[0].p }];
  rungs.forEach((r, i) =>
    outcomes.push({ level: rungs[i + 1]?.strike ?? r.strike + step, p: r.p - (rungs[i + 1]?.p ?? 0) }),
  );
  return outcomes.reduce((best, o) => (o.p > best.p ? o : best));
}

/** The range between adjacent rungs the ladder gives the most weight, for ladders that are not stepped. */
export function likeliestRange(rungs: ReturnType<typeof ladder>, fmt: (n: number) => string) {
  if (!rungs.length) return null;
  const ranges = [{ label: `${fmt(rungs[0].strike)} or below`, p: 1 - rungs[0].p }];
  rungs.forEach((r, i) => {
    const next = rungs[i + 1];
    ranges.push({ label: next ? `above ${fmt(r.strike)} to ${fmt(next.strike)}` : `above ${fmt(r.strike)}`, p: r.p - (next?.p ?? 0) });
  });
  return ranges.reduce((best, o) => (o.p > best.p ? o : best));
}

export type MarketOutcome = { label: string; probabilityPct: number; spreadPct: number; volume: number };
export type PredictionMarket = {
  venue: "Kalshi" | "Polymarket";
  id: string;
  title: string;
  /** binary: one yes/no contract. ladder: "above X" rungs. outcomes: several contracts under one question. */
  kind: "binary" | "ladder" | "outcomes";
  /** True when exactly one outcome can happen, so the chances add to about 100%. */
  mutuallyExclusive: boolean;
  closes: string | null;
  url: string;
  volume: number;
  volumeUnit: "contracts" | "USD";
  openInterest: number | null;
  liquidity: number | null;
  outcomes: MarketOutcome[];
  moreOutcomes?: number;
  impliedMedian?: string | null;
  likeliest?: { label: string; probabilityPct: number } | null;
};
export type VenueResult = { markets: PredictionMarket[]; dropped: { markets: number; events: number } };

const MAX_OUTCOMES = 8;
const pct = (p: number) => Number((p * 100).toFixed(1));
const num = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().finite().nullable()).catch(null).optional();
const TIMEOUT_MS = 8_000;

async function getJson(host: string, gapMs: number, url: URL, fetcher: typeof fetch) {
  return spaced(host, gapMs, () =>
    retry(async () => {
      const res = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`${host} HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    }, 2),
  );
}

/** Top outcomes by chance, capped; the rest are counted, not listed. */
function capOutcomes(outcomes: MarketOutcome[], sort = true) {
  const sorted = sort ? [...outcomes].sort((a, b) => b.probabilityPct - a.probabilityPct) : outcomes;
  const shown = sorted.slice(0, MAX_OUTCOMES);
  return { outcomes: shown, ...(sorted.length > shown.length ? { moreOutcomes: sorted.length - shown.length } : {}) };
}

/** The top outcome of a one-winner question, unless the dropped outcomes hold too much of the odds to call it. */
function topOutcome(outcomes: MarketOutcome[]) {
  const covered = outcomes.reduce((sum, o) => sum + o.probabilityPct, 0);
  return outcomes.length && covered >= 80 ? { label: outcomes[0].label, probabilityPct: outcomes[0].probabilityPct } : null;
}

/** A contract is readable when both sides are quoted, the spread is tight enough and it has traded. */
function readable(bid: number | null | undefined, ask: number | null | undefined, volume: number, checkVolume = true) {
  if (bid == null || ask == null || ask <= 0 || ask < bid) return false;
  return ask - bid <= MAX_SPREAD && (!checkVolume || volume >= MIN_VOLUME);
}

// ---------- Search terms ----------

const STOP = new Set(
  "a an and are be before by chance did do does for from how in is it market markets odds of on or prediction probability that the this to vs what when which who will with".split(" "),
);
// Query words that Kalshi series titles spell differently.
const ALIASES: Record<string, string[]> = {
  fomc: ["fed"],
  "federal reserve": ["fed"],
  inflation: ["cpi", "inflation"],
  jobs: ["payrolls", "jobs"],
  payrolls: ["payrolls", "jobs"],
  unemployment: ["unemployment"],
  "s&p": ["s&p"],
  spx: ["s&p"],
  "s&p 500": ["s&p"],
  nasdaq: ["nasdaq"],
  oil: ["oil", "wti"],
  crude: ["oil", "wti"],
};

export function searchWords(text: string) {
  const lower = text.toLowerCase();
  const words = lower.replace(/[^a-z0-9&%.]+/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w) && !/^\d{4}$/.test(w));
  const extra = Object.entries(ALIASES).filter(([k]) => k.includes(" ") && lower.includes(k)).flatMap(([, v]) => v);
  return [...new Set([...words.flatMap((w) => ALIASES[w] ?? [w]), ...extra])];
}

const wordMatch = (q: string, words: string[]) => words.some((w) => w === q || w.startsWith(q) || w === `${q}s` || q === `${w}s`);

// ---------- Kalshi ----------

const KALSHI_HOST = "kalshi";
const KALSHI_GAP_MS = 80; // Basic tier allows 20 reads a second.
/** Kalshi's own names for the categories a fund cares about. */
export const KALSHI_CATEGORIES = ["Economics", "Financials", "Companies", "Politics", "Commodities"] as const;
const SERIES_TTL = 60 * 60 * 24;
const PRICES_TTL = 60 * 2;
const MAX_SERIES = 8;
const EVENTS_PER_SERIES = 3;

export type KalshiSeries = { ticker: string; title: string; category: string; tags: string[] };

const seriesSchema = z.object({
  series: z
    .array(z.object({ ticker: z.string(), title: z.string().default(""), category: z.string().default(""), tags: z.array(z.string()).nullish() }))
    .nullish(),
});

const kalshiMarketSchema = z.object({
  ticker: z.string(),
  status: z.string().nullish(),
  yes_sub_title: z.string().nullish(),
  strike_type: z.string().nullish(),
  floor_strike: num,
  yes_bid_dollars: num,
  yes_ask_dollars: num,
  volume_fp: num,
  volume: num,
  open_interest_fp: num,
  open_interest: num,
  close_time: z.string().nullish(),
});
const kalshiEventsSchema = z.object({
  events: z
    .array(
      z.object({
        event_ticker: z.string(),
        series_ticker: z.string().nullish(),
        title: z.string().default(""),
        sub_title: z.string().nullish(),
        mutually_exclusive: z.boolean().nullish(),
        markets: z.array(kalshiMarketSchema).default([]),
      }),
    )
    .default([]),
});
type KalshiEventRaw = z.infer<typeof kalshiEventsSchema>["events"][number];

/** A category's series, trimmed to what matching needs and kept for a day (the list is ~17 MB unfiltered). */
export async function kalshiSeries(category: string, fetcher: typeof fetch = fetch): Promise<KalshiSeries[]> {
  return cached(`kalshi:series:v1:${category}`, SERIES_TTL, async () => {
    const url = new URL(`${KALSHI_API}/series`);
    url.searchParams.set("category", category);
    const body = seriesSchema.parse(await getJson(KALSHI_HOST, KALSHI_GAP_MS, url, fetcher));
    return (body.series ?? []).map((s) => ({ ticker: s.ticker, title: s.title, category: s.category || category, tags: s.tags ?? [] }));
  });
}

/** Series whose title (or failing that, tags) share the query's words, best first. Legacy tickers lose to their KX twins. */
export function matchSeries(series: KalshiSeries[], query: string, max = MAX_SERIES) {
  const q = searchWords(query);
  if (!q.length) return [];
  const byTitle = new Map<string, KalshiSeries>();
  for (const s of series) {
    const key = `${s.category}|${s.title.toLowerCase()}`;
    const prev = byTitle.get(key);
    if (!prev || (!prev.ticker.startsWith("KX") && s.ticker.startsWith("KX"))) byTitle.set(key, s);
  }
  const need = Math.max(1, Math.ceil(q.length / 2));
  return [...byTitle.values()]
    .map((s) => {
      const title = searchWords(s.title);
      const tags = searchWords(s.tags.join(" "));
      let score = 0;
      let hits = 0;
      for (const w of q) {
        const weight = wordMatch(w, title) ? 2 : wordMatch(w, tags) ? 1 : 0;
        score += weight;
        if (weight) hits++;
      }
      return { s, score, hits };
    })
    .filter((x) => x.hits >= need)
    .sort((a, b) => b.score - a.score || a.s.title.length - b.s.title.length)
    .slice(0, max)
    .map((x) => x.s);
}

/** Write a ladder's numbers in its rungs' units: "Above $80 billion" makes 261.8 "$261.8 billion". */
export const numberFormat = (sample: string | null | undefined) => {
  const units = (sample ?? "").replace(/\u200e/g, "").match(/^(?:above|over|at least)?\s*([^\d-]*)-?[\d,.]+(.*)$/i);
  return (n: number) => `${units?.[1] ?? ""}${Number(n.toPrecision(4)).toLocaleString("en-US", { maximumFractionDigits: 2 })}${units?.[2] ?? ""}`;
};

/** One open Kalshi event as a market: a ladder reads as a median, other events list their outcomes. */
export function kalshiMarket(event: KalshiEventRaw, series: KalshiSeries | undefined): { market: PredictionMarket | null; dropped: number } {
  const live = event.markets.filter((m) => !m.status || m.status === "active" || m.status === "open");
  const volumeOf = (m: (typeof live)[number]) => m.volume_fp ?? m.volume ?? 0;
  const seriesTicker = event.series_ticker ?? series?.ticker ?? event.event_ticker.split("-")[0];
  const base = {
    venue: "Kalshi" as const,
    id: event.event_ticker,
    title: [event.title, event.sub_title].filter(Boolean).join(" — "),
    url: `https://kalshi.com/markets/${seriesTicker.toLowerCase()}`,
    volumeUnit: "contracts" as const,
    liquidity: null,
  };
  const closesOf = (ms: typeof live) => {
    const t = ms.map((m) => Date.parse(m.close_time ?? "")).filter(Number.isFinite);
    return t.length ? new Date(Math.min(...t)).toISOString() : null;
  };
  const totals = (ms: typeof live) => ({
    volume: Math.round(ms.reduce((s, m) => s + volumeOf(m), 0)),
    openInterest: Math.round(ms.reduce((s, m) => s + (m.open_interest_fp ?? m.open_interest ?? 0), 0)),
  });

  const isRung = (m: (typeof live)[number]) => (m.strike_type === "greater" || m.strike_type === "greater_or_equal") && m.floor_strike != null;
  if (live.length > 1 && live.every(isRung)) {
    // A ladder is read as a whole, so thin trading is judged on the event and each rung only needs a tight quote.
    const kept = live.filter((m) => readable(m.yes_bid_dollars, m.yes_ask_dollars, 0, false));
    const t = totals(live);
    if (kept.length < 2 || t.volume < MIN_VOLUME) return { market: null, dropped: live.length };
    const rungs = ladder(kept);
    const fmt = numberFormat(kept[0].yes_sub_title);
    const median = impliedMedian(rungs);
    const range = likeliestRange(rungs, fmt);
    const label = new Map(kept.map((m) => [m.floor_strike!, m.yes_sub_title || `Above ${fmt(m.floor_strike!)}`]));
    const spread = new Map(kept.map((m) => [m.floor_strike!, m.yes_ask_dollars! - m.yes_bid_dollars!]));
    const volume = new Map(kept.map((m) => [m.floor_strike!, Math.round(volumeOf(m))]));
    // Rungs priced near certain say little; show the ones nearest even odds, in strike order.
    const middle = rungs.filter((r) => r.p > 0.03 && r.p < 0.97);
    const nearest = [...(middle.length ? middle : rungs)].sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5)).slice(0, MAX_OUTCOMES);
    const shown = nearest.sort((a, b) => a.strike - b.strike).map((r) => ({ label: label.get(r.strike)!, probabilityPct: pct(r.p), spreadPct: pct(spread.get(r.strike)!), volume: volume.get(r.strike)! }));
    return {
      market: {
        ...base,
        kind: "ladder",
        mutuallyExclusive: false,
        closes: closesOf(kept),
        ...t,
        ...capOutcomes(shown, false),
        impliedMedian: median === null ? null : fmt(median),
        likeliest: range ? { label: range.label, probabilityPct: pct(range.p) } : null,
      },
      dropped: live.length - kept.length,
    };
  }

  const kept = live.filter((m) => readable(m.yes_bid_dollars, m.yes_ask_dollars, volumeOf(m)));
  if (!kept.length) return { market: null, dropped: live.length };
  const binary = live.length === 1;
  const outcomes = kept.map((m) => ({
    label: binary ? "Yes" : m.yes_sub_title || m.ticker,
    probabilityPct: pct((m.yes_bid_dollars! + m.yes_ask_dollars!) / 2),
    spreadPct: pct(m.yes_ask_dollars! - m.yes_bid_dollars!),
    volume: Math.round(volumeOf(m)),
  }));
  const exclusive = Boolean(event.mutually_exclusive) && !binary;
  const capped = capOutcomes(outcomes);
  const top = topOutcome([...outcomes].sort((a, b) => b.probabilityPct - a.probabilityPct));
  return {
    market: {
      ...base,
      kind: binary ? "binary" : "outcomes",
      mutuallyExclusive: exclusive,
      closes: closesOf(kept),
      ...totals(kept),
      ...capped,
      likeliest: exclusive ? top : undefined,
    },
    dropped: live.length - kept.length,
  };
}

export async function kalshiOpenEvents(seriesTicker: string, fetcher: typeof fetch = fetch) {
  return cached(
    `kalshi:events:${seriesTicker}`,
    PRICES_TTL,
    async () => {
      const url = new URL(`${KALSHI_API}/events`);
      url.search = new URLSearchParams({ series_ticker: seriesTicker, status: "open", with_nested_markets: "true" }).toString();
      return kalshiEventsSchema.parse(await getJson(KALSHI_HOST, KALSHI_GAP_MS, url, fetcher)).events;
    },
    { db: false },
  );
}

/** Kalshi has no free-text search: match the query against the day's series list, then read those series' open events. */
export async function searchKalshi(query: string, limit: number, fetcher: typeof fetch = fetch): Promise<VenueResult> {
  const lists = await Promise.allSettled(KALSHI_CATEGORIES.map((c) => kalshiSeries(c, fetcher)));
  if (lists.every((l) => l.status === "rejected")) throw (lists[0] as PromiseRejectedResult).reason;
  const candidates = matchSeries(lists.flatMap((l) => (l.status === "fulfilled" ? l.value : [])), query);
  const settled = await Promise.allSettled(candidates.map((s) => kalshiOpenEvents(s.ticker, fetcher)));
  if (candidates.length && settled.every((s) => s.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
  const markets: PredictionMarket[] = [];
  const dropped = { markets: 0, events: 0 };
  settled.forEach((s, i) => {
    if (s.status !== "fulfilled") return;
    // Nearest-closing events first; a series with a year of monthly events should not crowd out the others.
    const events = [...s.value].sort((a, b) => nearestClose(a) - nearestClose(b));
    let taken = 0;
    for (const e of events) {
      if (taken >= EVENTS_PER_SERIES) break;
      const r = kalshiMarket(e, candidates[i]);
      dropped.markets += r.dropped;
      if (!r.market) dropped.events++;
      else {
        markets.push(r.market);
        taken++;
      }
    }
  });
  return { markets: markets.slice(0, limit), dropped };
}

const nearestClose = (e: KalshiEventRaw) => Math.min(...e.markets.map((m) => Date.parse(m.close_time ?? "")).filter(Number.isFinite), Infinity);

// ---------- Polymarket ----------

const POLY_HOST = "polymarket";
const POLY_GAP_MS = 100; // public-search allows 350 requests per 10 seconds.

const jsonList = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}, z.array(z.string()).nullable().catch(null)).optional();
const polyMarketSchema = z.object({
  id: z.string(),
  question: z.string().default(""),
  slug: z.string().nullish(),
  groupItemTitle: z.string().nullish(),
  outcomes: jsonList,
  endDate: z.string().nullish(),
  active: z.boolean().nullish(),
  closed: z.boolean().nullish(),
  acceptingOrders: z.boolean().nullish(),
  umaResolutionStatus: z.string().nullish(),
  bestBid: num,
  bestAsk: num,
  volumeNum: num,
  volume: num,
  liquidityNum: num,
});
const polySearchSchema = z.object({
  events: z
    .array(
      z.object({
        id: z.string(),
        slug: z.string(),
        title: z.string().default(""),
        active: z.boolean().nullish(),
        closed: z.boolean().nullish(),
        archived: z.boolean().nullish(),
        negRisk: z.boolean().nullish(),
        volume: num,
        liquidity: num,
        openInterest: num,
        markets: z.array(polyMarketSchema).default([]),
      }),
    )
    .nullish(),
});
type PolyEventRaw = NonNullable<z.infer<typeof polySearchSchema>["events"]>[number];

/** Resolved, closed or proposed-for-resolution contracts are history, not odds. */
const polyOpen = (m: PolyEventRaw["markets"][number]) =>
  m.active !== false && m.closed !== true && m.acceptingOrders !== false && !["resolved", "proposed", "disputed"].includes(m.umaResolutionStatus ?? "");

export function polymarketMarket(event: PolyEventRaw): { market: PredictionMarket | null; dropped: number } {
  const live = event.markets.filter(polyOpen);
  const volumeOf = (m: (typeof live)[number]) => m.volumeNum ?? m.volume ?? 0;
  const kept = live.filter((m) => readable(m.bestBid, m.bestAsk, volumeOf(m)));
  if (!kept.length) return { market: null, dropped: live.length };
  const binary = event.markets.length === 1;
  const outcomes = kept.map((m) => ({
    // The book's best bid and ask price the first outcome, which is "Yes" on a yes/no market.
    label: binary ? (m.outcomes?.[0] ?? "Yes") : m.groupItemTitle || m.question,
    probabilityPct: pct((m.bestBid! + m.bestAsk!) / 2),
    spreadPct: pct(m.bestAsk! - m.bestBid!),
    volume: Math.round(volumeOf(m)),
  }));
  const ends = kept.map((m) => Date.parse(m.endDate ?? "")).filter(Number.isFinite);
  const exclusive = Boolean(event.negRisk) && !binary;
  const capped = capOutcomes(outcomes, exclusive || binary);
  const top = topOutcome([...outcomes].sort((a, b) => b.probabilityPct - a.probabilityPct));
  return {
    market: {
      venue: "Polymarket",
      id: event.slug,
      title: binary ? kept[0].question || event.title : event.title,
      kind: binary ? "binary" : "outcomes",
      mutuallyExclusive: exclusive,
      closes: ends.length ? new Date(Math.min(...ends)).toISOString() : null,
      url: `https://polymarket.com/event/${event.slug}`,
      volume: Math.round(kept.reduce((s, m) => s + volumeOf(m), 0)),
      volumeUnit: "USD",
      openInterest: event.openInterest == null ? null : Math.round(event.openInterest),
      liquidity: Math.round(kept.reduce((s, m) => s + (m.liquidityNum ?? 0), 0)),
      ...capped,
      likeliest: exclusive ? top : undefined,
    },
    dropped: live.length - kept.length,
  };
}

/** Polymarket's own search, limited to active events; resolved contracts inside them are filtered here. */
export async function searchPolymarket(query: string, limit: number, fetcher: typeof fetch = fetch): Promise<VenueResult> {
  const events = await cached(
    `polymarket:search:${query.toLowerCase().trim()}`,
    PRICES_TTL,
    async () => {
      const url = new URL(`${POLYMARKET_API}/public-search`);
      url.search = new URLSearchParams({
        q: query,
        events_status: "active",
        keep_closed_markets: "0",
        limit_per_type: String(Math.min(20, limit * 2)),
        search_tags: "false",
        search_profiles: "false",
      }).toString();
      return polySearchSchema.parse(await getJson(POLY_HOST, POLY_GAP_MS, url, fetcher)).events ?? [];
    },
    { db: false },
  );
  const markets: PredictionMarket[] = [];
  const dropped = { markets: 0, events: 0 };
  for (const e of events) {
    if (e.closed || e.archived || e.active === false) continue;
    const r = polymarketMarket(e);
    dropped.markets += r.dropped;
    if (r.market) markets.push(r.market);
    else dropped.events++;
  }
  return { markets: markets.slice(0, limit), dropped };
}
