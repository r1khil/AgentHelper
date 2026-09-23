import type { EconomicEvent } from "@/lib/economic-calendar/types";

/** Economic events below this importance are noise for a one-page deck. */
export const MARKET_NEWS_MIN_IMPORTANCE = 2;
export const MARKET_NEWS_MAX = 12;

/**
 * Releases the deck never lists, whatever importance the feed gives them: Treasury auctions, Fed
 * speeches, weekly oil inventories, mortgage surveys and rig counts, and futures positioning.
 */
const NOISE = /\b(auction|speech|speaks|testimon|CFTC|Baker Hughes|rig count|EIA\b|Cushing|Non-Commercial|API Crude|Redbook|MBA\b|Weekly\b|Fed Balance Sheet|Money Supply|Bill Rate)/i;

/** "Retail Sales m/m" and "Retail Sales" are one release, as are "GDP Growth Rate QoQ Final" and "GDP Growth Rate". */
function baseName(name: string): string {
  let base = name.trim();
  for (let prev = ""; prev !== base; ) {
    prev = base;
    base = base
      .replace(/\s*\((?:m\/m|y\/y|q\/q|mom|yoy|qoq|prel|final|flash|adv|prelim)\)\s*$/i, "")
      .replace(/\s+(?:m\/m|y\/y|q\/q|mom|yoy|qoq)\s*$/i, "")
      .replace(/\s+(?:prel|final|flash|adv|prelim)\.?\s*$/i, "")
      .trim();
  }
  return base;
}

/** Families whose headline release is the only one worth a bullet. */
const HEADLINE_OF: { test: RegExp; headline: RegExp }[] = [
  { test: /^Michigan\b/i, headline: /^Michigan Consumer Sentiment$/i },
  { test: /Jobless Claims$/i, headline: /^Initial Jobless Claims$/i },
  { test: /^Core\s/i, headline: /^(?!Core\s)/ },
  { test: /^(?:CPI|Inflation Rate)\b/i, headline: /^Inflation Rate$/i },
  { test: /^(?:Fed Interest Rate Decision|Fed Press Conference|FOMC Economic Projections)$/i, headline: /^Fed Interest Rate Decision$/i },
  { test: /^S&P Global .*PMI$/i, headline: /^S&P Global Composite PMI$/i },
  { test: /^GDP\b/i, headline: /^GDP Growth Rate$/i },
];

export type MarketNewsPick = Pick<EconomicEvent, "date" | "name" | "importance">;

/**
 * The week's scheduled releases worth a line on the deck, in date order and most important first
 * within a day. Companion series (core, m/m vs y/y, the Michigan sub-indices, continuing claims)
 * collapse into their headline release, an event running several days is listed on its first, and
 * the list is capped so it stays one bullet long.
 */
export function pickMarketNews(events: MarketNewsPick[], range: { from: string; to: string }, max = MARKET_NEWS_MAX): MarketNewsPick[] {
  const inRange = events.filter((e) => (e.importance ?? 0) >= MARKET_NEWS_MIN_IMPORTANCE && e.date >= range.from && e.date <= range.to && !NOISE.test(e.name));
  const sorted = [...inRange].sort((a, b) => a.date.localeCompare(b.date) || (b.importance ?? 0) - (a.importance ?? 0) || a.name.localeCompare(b.name));
  const out: MarketNewsPick[] = [];
  const seen = new Set<string>();
  for (const e of sorted) {
    const base = baseName(e.name);
    const key = base.toLowerCase();
    if (seen.has(key)) continue;
    // "Retail Sales Ex Autos" and "Retail Sales Control Group" ride on "Retail Sales" the same day.
    if (sorted.some((o) => o.date === e.date && key.startsWith(`${baseName(o.name).toLowerCase()} `))) continue;
    // A companion series only stands in when its headline release is not on the same day.
    const family = HEADLINE_OF.find((f) => f.test.test(base));
    if (family && !family.headline.test(base)) {
      const headlineSameDay = sorted.some((o) => o.date === e.date && family.headline.test(baseName(o.name)) && family.test.test(baseName(o.name)) === family.test.test(base));
      const coreParent = /^Core\s/i.test(base) && sorted.some((o) => o.date === e.date && baseName(o.name).toLowerCase() === base.replace(/^Core\s+/i, "").toLowerCase());
      if (headlineSameDay || coreParent) continue;
    }
    seen.add(key);
    out.push({ date: e.date, name: base, importance: e.importance });
    if (out.length >= max) break;
  }
  return out;
}
