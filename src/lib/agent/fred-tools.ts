import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { DateTime } from "luxon";
import { NY } from "@/lib/providers/calendar";
import {
  downsample,
  fredSeriesUrl,
  getObservations,
  getSeriesInfo,
  observationStats,
  round,
  searchSeries,
  UNITS_LABEL,
  type FredAggregation,
  type FredFrequency,
  type FredSeries,
  type FredUnits,
} from "@/lib/providers/fred";
import { sourceId, type Source } from "@/lib/providers/types";
import type { ToolResult } from "./tools";

/** Points returned to the model; longer windows are thinned evenly (the stats still use every observation). */
export const MAX_POINTS = 60;
const CANDIDATES = 6;

/** Common series by the names students use, so they need no search. Keys are normalized with `aliasKey`. */
const ALIASES: { id: string; names: string[]; note?: string }[] = [
  { id: "DGS10", names: ["10y", "10yr", "10year", "10yeartreasury", "10yyield", "ust10y", "tenyear"] },
  { id: "DGS2", names: ["2y", "2yr", "2year", "2yeartreasury", "2yyield", "ust2y", "twoyear"] },
  { id: "T10Y2Y", names: ["2s10s", "10s2s", "10y2y", "2y10y", "yieldcurve", "curve"], note: "10-year minus 2-year Treasury yield, in percentage points; negative means inverted." },
  { id: "BAMLH0A0HYM2", names: ["hy", "hyspread", "hyoas", "highyield", "highyieldspread", "junkspread"], note: "ICE BofA US High Yield option-adjusted spread, in percentage points over Treasuries." },
  { id: "BAMLC0A0CM", names: ["ig", "igspread", "igoas", "investmentgrade", "investmentgradespread", "corporatespread"], note: "ICE BofA US Corporate (investment grade) option-adjusted spread, in percentage points over Treasuries." },
  { id: "CPIAUCSL", names: ["cpi", "headlinecpi", "inflation", "cpiinflation"], note: "An index level; use transform yoy for the inflation rate as usually quoted." },
  { id: "CPILFESL", names: ["corecpi", "cpicore", "coreinflation"], note: "CPI less food and energy, an index level; use transform yoy for the inflation rate as usually quoted." },
  { id: "UNRATE", names: ["unemployment", "unemploymentrate", "unrate", "joblessrate"] },
  { id: "DFF", names: ["fedfundsrate", "fedfundsdaily", "dailyfedfunds", "effr", "policyrate"], note: "Daily effective federal funds rate; the FOMC sets a target range around it. FEDFUNDS is the monthly average." },
  { id: "FEDFUNDS", names: ["fedfundsmonthly", "monthlyfedfunds"], note: "Monthly average of the effective federal funds rate; DFF is daily." },
  { id: "VIXCLS", names: ["vix", "vixclose"], note: "Cboe VIX daily close." },
  { id: "DCOILWTICO", names: ["wti", "oil", "crude", "wtioil", "crudeoil"], note: "WTI spot price at Cushing (EIA), dollars per barrel; not the front-month futures price." },
  { id: "DTWEXBGS", names: ["usd", "dollar", "dollarindex", "usdindex", "dxy", "broaddollar"], note: "The Fed's nominal broad trade-weighted dollar index (Jan 2006 = 100), not ICE's DXY." },
];

export const aliasKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** A real id always wins over a shortcut that normalizes the same way ("fed funds" is FEDFUNDS). */
const ALIAS_INDEX = new Map([...ALIASES.flatMap((a) => a.names.map((n) => [aliasKey(n), a] as const)), ...ALIASES.map((a) => [aliasKey(a.id), a] as const)]);

/** A shortcut name or a known id, resolved to its FRED series id. */
export function resolveAlias(input: string): { id: string; note?: string } | null {
  const a = ALIAS_INDEX.get(aliasKey(input));
  return a ? { id: a.id, note: a.note } : null;
}

const TRANSFORMS = { level: "lin", change: "chg", pct_change: "pch", yoy: "pc1" } as const satisfies Record<string, FredUnits>;
const FREQUENCIES = { daily: "d", weekly: "w", monthly: "m", quarterly: "q", annual: "a" } as const satisfies Record<string, FredFrequency>;
const AGGREGATIONS = { average: "avg", end_of_period: "eop", sum: "sum" } as const satisfies Record<string, FredAggregation>;

/** Default window by the frequency the data comes back in: enough history for context, few enough points to read. */
function defaultYears(freqShort: string) {
  const f = freqShort.toUpperCase();
  if (f.startsWith("D")) return 1;
  if (f.startsWith("W") || f === "BW") return 2;
  if (f === "M") return 5;
  return 10;
}

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function candidate(s: FredSeries) {
  return {
    seriesId: s.id,
    title: s.title,
    frequency: s.frequency,
    units: s.units,
    seasonalAdjustment: s.seasonalAdjustmentShort,
    observationRange: `${s.observationStart} to ${s.observationEnd}`,
    lastUpdated: s.lastUpdated,
    popularity: s.popularity,
    ...(/discontinued/i.test(s.title) ? { discontinued: true } : {}),
  };
}

/** FRED macro and rates series for Hoot. Only registered when FRED_API_KEY is set. */
export function makeFredTools(): ToolSet {
  return {
    get_macro_series: tool({
      description:
        "Macro and rates data from FRED (Federal Reserve Bank of St. Louis): Treasury yields and curve spreads, credit spreads, inflation, jobs, policy rates, the VIX, oil, the dollar, and hundreds of thousands of other economic series. FRED is the authoritative source for these numbers: use it rather than news or the web for any macro or rates figure. Pass seriesId (a FRED id such as DGS10, or a shortcut: 10y, 2y, 2s10s, hy spread, ig spread, cpi, core cpi, unemployment, fed funds, vix, wti, usd) or query to search FRED; a search with several matches returns candidates only, so call again with the seriesId you choose (prefer seasonally adjusted, current, popular series). transform: level (as published), change (vs the previous observation), pct_change (% vs the previous observation), yoy (% vs a year earlier: CPI inflation is quoted this way); for yields, spreads and other series already in percent, use change (percentage points), not pct_change or yoy. frequency aggregates to a lower frequency (average by default, or end_of_period). Long windows are thinned to about 60 points; latest, high, low and change use every observation. State the observation date of every figure (not today's date). Monthly releases such as CPI and payrolls come out weeks after the period they cover and are revised later, so give the value as of the series' last update.",
      inputSchema: z.object({
        seriesId: z.string().min(1).max(40).optional().describe("FRED series id (e.g. DGS10, CPIAUCSL) or a shortcut name (10y, 2s10s, hy spread, core cpi, fed funds, wti, usd)"),
        query: z.string().min(2).max(200).optional().describe("Search FRED by words when you do not know the id, e.g. 'housing starts' or '30-year mortgage rate'"),
        start: iso.optional().describe("First observation date; defaults to 1 year back for daily data, 2 for weekly, 5 for monthly, 10 otherwise"),
        end: iso.optional().describe("Last observation date; defaults to today"),
        transform: z.enum(Object.keys(TRANSFORMS) as [keyof typeof TRANSFORMS, ...(keyof typeof TRANSFORMS)[]]).default("level"),
        frequency: z.enum(Object.keys(FREQUENCIES) as [keyof typeof FREQUENCIES, ...(keyof typeof FREQUENCIES)[]]).optional().describe("Aggregate to this lower frequency, e.g. monthly for a multi-year view of a daily series"),
        aggregation: z.enum(Object.keys(AGGREGATIONS) as [keyof typeof AGGREGATIONS, ...(keyof typeof AGGREGATIONS)[]]).default("average").describe("How frequency aggregates: average, end_of_period, or sum"),
      }),
      execute: async ({ seriesId, query, start, end, transform, frequency, aggregation }): Promise<ToolResult<unknown>> => {
        try {
          let id: string | null = null;
          let aliasNote: string | undefined;
          const asked = seriesId?.trim() || query?.trim();
          if (!asked) throw new Error("Pass seriesId (e.g. DGS10 or a shortcut such as 10y) or query to search FRED.");
          const alias = resolveAlias(asked);
          if (alias) {
            id = alias.id;
            aliasNote = alias.note;
          } else if (seriesId?.trim() && /^[A-Za-z0-9_]{1,25}$/.test(seriesId.trim())) {
            id = seriesId.trim().toUpperCase();
          } else {
            // Words passed as seriesId ("housing starts") are a search, not an id FRED would reject.
            query = query?.trim() || seriesId!.trim();
            const hits = await searchSeries(query, { limit: CANDIDATES });
            if (!hits.length) return { data: { query, candidates: [], note: "FRED has no series matching that search. Try fewer or more common words (e.g. 'mortgage rate', 'industrial production')." }, sources: [] };
            if (hits.length > 1) {
              return {
                data: {
                  query,
                  candidates: hits.map(candidate),
                  note: "Several FRED series match; no data was fetched yet. Call get_macro_series again with the seriesId that fits the question (usually the seasonally adjusted, still-updated, most popular one). Nothing here is citable until you do.",
                },
                sources: [],
              };
            }
            id = hits[0].id;
          }

          const info = await getSeriesInfo(id);
          if (!info) throw new Error(`FRED has no series "${id}". Pass query to search for the right id.`);

          const units = TRANSFORMS[transform];
          const freq = frequency ? FREQUENCIES[frequency] : undefined;
          const agg = freq ? AGGREGATIONS[aggregation] : undefined;
          const today = DateTime.now().setZone(NY).toISODate()!;
          const to = end ?? today;
          const from = start ?? DateTime.fromISO(to, { zone: NY }).minus({ years: defaultYears(freq ?? info.frequencyShort) }).toISODate()!;
          if (from > to) throw new Error(`start ${from} is after end ${to}.`);

          const r = await getObservations(info.id, { start: from, end: to, units, frequency: freq, aggregation: agg });
          const present = r.observations.filter((o): o is { date: string; value: number } => o.value !== null);
          const missing = r.observations.length - present.length;
          const stats = observationStats(r.observations);
          const unitsLabel = units === "lin" ? info.units : `${UNITS_LABEL[units]} (${info.units})`;
          const frequencyLabel = freq ? `${frequency} (${aggregation.replace(/_/g, " ")} of ${info.frequency.toLowerCase()} data)` : info.frequency;
          const base = {
            seriesId: info.id,
            title: info.title,
            units: unitsLabel,
            transform,
            frequency: frequencyLabel,
            seasonalAdjustment: info.seasonalAdjustment,
            lastUpdated: info.lastUpdated,
            seriesRange: `${info.observationStart} to ${info.observationEnd}`,
            window: { start: from, end: to },
            ...(aliasNote ? { seriesNote: aliasNote } : {}),
          };
          if (!stats) {
            return { data: { ...base, observations: [], note: `No observations between ${from} and ${to}. The series runs ${info.observationStart} to ${info.observationEnd}${units !== "lin" ? "; a transform needs a prior observation inside the window" : ""}.` }, sources: [] };
          }

          const shown = downsample(present, MAX_POINTS);
          const thinned = shown.length < present.length;
          const retrievedAt = new Date().toISOString();
          const source: Source = {
            id: sourceId("fred", `${info.id}:${units}:${freq ?? ""}:${agg ?? ""}:${from}:${to}`),
            title: `${info.title} (FRED ${info.id})${units === "lin" ? "" : ` · ${UNITS_LABEL[units].toLowerCase()}`} · ${stats.first.date} to ${stats.latest.date}`,
            url: fredSeriesUrl(info.id),
            publisher: "FRED, Federal Reserve Bank of St. Louis",
            publishedAt: info.lastUpdated.slice(0, 10),
            retrievedAt,
            sourceType: "Economic data",
            // The figures lead: citation repair reads only the first 160 characters of an excerpt.
            excerpt: `${info.id} ${round(stats.latest.value)} on ${stats.latest.date}${stats.previous ? `; prev ${round(stats.previous.value)} ${stats.previous.date}` : ""}; ${round(stats.first.value)} on ${stats.first.date}; chg ${stats.changeOverWindow}; high ${round(stats.high.value)} ${stats.high.date}; low ${round(stats.low.value)} ${stats.low.date}. ${info.title} (${unitsLabel}), ${info.frequency.toLowerCase()}, ${info.seasonalAdjustmentShort}; last updated ${info.lastUpdated}.`.slice(0, 360),
          };
          const point = (o: { date: string; value: number }) => ({ date: o.date, value: round(o.value) });
          return {
            data: {
              ...base,
              latest: point(stats.latest),
              previous: stats.previous ? point(stats.previous) : null,
              high: point(stats.high),
              low: point(stats.low),
              first: point(stats.first),
              changeOverWindow: stats.changeOverWindow,
              observationCount: present.length,
              observationsFormat: "[date, value], oldest first",
              observations: shown.map((o) => [o.date, round(o.value)]),
              note: [
                thinned ? `Thinned to ${shown.length} of ${present.length} observations, evenly spaced; latest, high, low and change use all of them. Pass frequency (e.g. monthly) or a shorter window for an exact series.` : null,
                missing ? `${missing} date${missing === 1 ? "" : "s"} with no value (market holidays or not yet released) left out.` : null,
                "Dates are observation dates (the period the value describes), not release dates. FRED revises published values; say the figure is as of the last update.",
              ]
                .filter(Boolean)
                .join(" "),
              sourceId: source.id,
            },
            sources: [source],
          };
        } catch (e) {
          return { data: null, sources: [], error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };
}
