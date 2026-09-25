import { cached } from "./cache";
import { retry, spaced } from "./limiter";

/**
 * FRED (Federal Reserve Bank of St. Louis) API v1: series search, series metadata and observations.
 * Free key in FRED_API_KEY; the documented limit is 120 requests a minute per key.
 * https://fred.stlouisfed.org/docs/api/fred/
 */
const HOST = "fred";
const GAP_MS = 550; // ~109/min, under the 120/min limit
const BASE = "https://api.stlouisfed.org/fred";
/** Most series update once a day at most; a few hours keeps intraday releases (CPI at 8:30) reasonably fresh. */
const TTL_SECONDS = 60 * 60 * 3;

export function fredConfigured() {
  return Boolean(process.env.FRED_API_KEY);
}

export const fredSeriesUrl = (id: string) => `https://fred.stlouisfed.org/series/${encodeURIComponent(id)}`;

/** FRED's `units` transforms: lin = as published, chg = change, ch1 = change from a year ago, pch = % change, pc1 = % change from a year ago, pca = compounded annual rate, cch/cca = continuously compounded, log = natural log. */
export const FRED_UNITS = ["lin", "chg", "ch1", "pch", "pc1", "pca", "cch", "cca", "log"] as const;
export type FredUnits = (typeof FRED_UNITS)[number];
/** Aggregation targets; FRED can only aggregate to a lower frequency than the series has. */
export const FRED_FREQUENCIES = ["d", "w", "bw", "m", "q", "sa", "a"] as const;
export type FredFrequency = (typeof FRED_FREQUENCIES)[number];
export type FredAggregation = "avg" | "sum" | "eop";

export const UNITS_LABEL: Record<FredUnits, string> = {
  lin: "Level",
  chg: "Change from previous observation",
  ch1: "Change from a year ago",
  pch: "Percent change from previous observation",
  pc1: "Percent change from a year ago",
  pca: "Compounded annual rate of change",
  cch: "Continuously compounded rate of change",
  cca: "Continuously compounded annual rate of change",
  log: "Natural log",
};

export type FredSeries = {
  id: string;
  title: string;
  frequency: string;
  frequencyShort: string;
  units: string;
  unitsShort: string;
  seasonalAdjustment: string;
  seasonalAdjustmentShort: string;
  /** As FRED prints it, e.g. "2026-09-24 15:18:03-05". */
  lastUpdated: string;
  observationStart: string;
  observationEnd: string;
  popularity: number;
  notes?: string;
};

/** A missing value (FRED's ".", e.g. a market holiday in a daily series) is null. */
export type FredObservation = { date: string; value: number | null };

export type FredObservations = {
  seriesId: string;
  units: FredUnits;
  frequency: FredFrequency | null;
  aggregation: FredAggregation | null;
  start: string;
  end: string;
  observations: FredObservation[];
};

type RawSeries = {
  id: string;
  title: string;
  frequency: string;
  frequency_short: string;
  units: string;
  units_short: string;
  seasonal_adjustment: string;
  seasonal_adjustment_short: string;
  last_updated: string;
  observation_start: string;
  observation_end: string;
  popularity?: number;
  notes?: string;
};

type RawObservations = { observations: { date: string; value: string }[] };

/** A FRED error the caller should not retry (a bad series id or parameter). `message` is FRED's own text, never the URL or key. */
export class FredError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FredError";
  }
}

async function fred<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY is not configured");
  const qs = new URLSearchParams({ api_key: key, file_type: "json" });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const outcome = await spaced(HOST, GAP_MS, () =>
    retry(async () => {
      const res = await fetch(`${BASE}${path}?${qs}`, { headers: { Accept: "application/json" } });
      if (res.ok) return { ok: true as const, body: (await res.json()) as T };
      const message = await errorMessage(res);
      // 429 and 5xx are transient; 400/404 (unknown series, bad parameter) are answered once.
      if (res.status === 429 || res.status >= 500) throw new Error(`FRED ${res.status}: ${message}`);
      return { ok: false as const, status: res.status, message };
    }),
  );
  if (!outcome.ok) throw new FredError(outcome.message, outcome.status);
  return outcome.body;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error_message?: string };
    if (body.error_message) return body.error_message.replace(/\s+/g, " ").replace(/ Read https?:\S+ for more information\.?/, "").trim();
  } catch {
    // Not JSON (a proxy error page); fall through to the status text.
  }
  return res.statusText || `HTTP ${res.status}`;
}

function toSeries(r: RawSeries): FredSeries {
  return {
    id: r.id,
    title: r.title,
    frequency: r.frequency,
    frequencyShort: r.frequency_short,
    units: r.units,
    unitsShort: r.units_short,
    seasonalAdjustment: r.seasonal_adjustment,
    seasonalAdjustmentShort: r.seasonal_adjustment_short,
    lastUpdated: r.last_updated,
    observationStart: r.observation_start,
    observationEnd: r.observation_end,
    popularity: r.popularity ?? 0,
    notes: r.notes?.trim() || undefined,
  };
}

/** FRED writes a missing observation as "."; anything unparseable is treated the same way. */
export function parseValue(v: string): number | null {
  if (v === "." || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Full-text search over series titles and notes, best match first. */
export async function searchSeries(query: string, opts: { limit?: number } = {}): Promise<FredSeries[]> {
  const q = query.trim();
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 50);
  return cached(`fred:search:${q.toLowerCase()}:${limit}`, TTL_SECONDS, async () => {
    const body = await fred<{ seriess?: RawSeries[] }>("/series/search", { search_text: q, limit });
    return (body.seriess ?? []).map(toSeries);
  });
}

/** Metadata for one series; null when FRED has no series with that id. */
export async function getSeriesInfo(seriesId: string): Promise<FredSeries | null> {
  const id = seriesId.trim().toUpperCase();
  return cached(`fred:series:${id}`, TTL_SECONDS, async () => {
    try {
      const body = await fred<{ seriess?: RawSeries[] }>("/series", { series_id: id });
      const s = body.seriess?.[0];
      return s ? toSeries(s) : null;
    } catch (e) {
      if (e instanceof FredError && (e.status === 400 || e.status === 404) && /does not exist/i.test(e.message)) return null;
      throw e;
    }
  });
}

/**
 * Observations between start and end (inclusive), oldest first, optionally transformed (`units`) and
 * aggregated to a lower frequency. Missing values stay in the list as null so callers can count them.
 */
export async function getObservations(
  seriesId: string,
  opts: { start?: string; end?: string; units?: FredUnits; frequency?: FredFrequency; aggregation?: FredAggregation } = {},
): Promise<FredObservations> {
  const id = seriesId.trim().toUpperCase();
  const units = opts.units ?? "lin";
  const start = opts.start ?? "1776-07-04";
  const end = opts.end ?? "9999-12-31";
  const frequency = opts.frequency ?? null;
  const aggregation = frequency ? (opts.aggregation ?? "avg") : null;
  return cached(`fred:obs:${id}:${start}:${end}:${units}:${frequency ?? ""}:${aggregation ?? ""}`, TTL_SECONDS, async () => {
    const body = await fred<RawObservations>("/series/observations", {
      series_id: id,
      observation_start: start,
      observation_end: end,
      units,
      frequency: frequency ?? undefined,
      aggregation_method: aggregation ?? undefined,
      sort_order: "asc",
    });
    return { seriesId: id, units, frequency, aggregation, start, end, observations: (body.observations ?? []).map((o) => ({ date: o.date, value: parseValue(o.value) })) };
  });
}

/** At most `max` points, evenly spaced, always keeping the first and the latest. */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  if (max < 2) return max < 1 ? [] : points.slice(-1);
  const out: T[] = [];
  let prev = -1;
  for (let k = 0; k < max; k++) {
    const i = Math.round((k * (points.length - 1)) / (max - 1));
    if (i !== prev) out.push(points[i]);
    prev = i;
  }
  return out;
}

export type ObservationStats = {
  first: { date: string; value: number };
  latest: { date: string; value: number };
  previous: { date: string; value: number } | null;
  high: { date: string; value: number };
  low: { date: string; value: number };
  /** latest minus first, in the series' (transformed) units. */
  changeOverWindow: number;
};

/** Window statistics over every non-missing observation; null when there are none. */
export function observationStats(obs: FredObservation[]): ObservationStats | null {
  const present = obs.filter((o): o is { date: string; value: number } => o.value !== null);
  if (!present.length) return null;
  let high = present[0];
  let low = present[0];
  for (const o of present) {
    if (o.value > high.value) high = o;
    if (o.value < low.value) low = o;
  }
  const first = present[0];
  const latest = present[present.length - 1];
  return { first, latest, previous: present.length > 1 ? present[present.length - 2] : null, high, low, changeOverWindow: round(latest.value - first.value) };
}

export const round = (x: number, dp = 4) => Number(x.toFixed(dp));
