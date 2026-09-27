import type { EconomicEvent } from "@/lib/economic-calendar/types";

/**
 * The deck's Market News line, written the way the execs write it. They list a fixed set of US headline releases under
 * their own names ("Weekly Jobless Claims", "Uni. of Mich. Consumer Survey", "U.S. Interest Rate Decision"), in time
 * order within a day, and skip regional Fed surveys, housing sub-indices, auctions and speeches, whatever importance the
 * feed gives them. The names below come from the decks of 11 and 21 September 2026; a release they never named is
 * written the way the feed does.
 */
const DECK_NAMES: { test: RegExp; label: string }[] = [
  { test: /^Initial Jobless Claims$/i, label: "Weekly Jobless Claims" },
  { test: /^(?:Inflation Rate|CPI)$/i, label: "CPI" },
  { test: /^PPI$/i, label: "PPI" },
  { test: /^Retail Sales$/i, label: "Retail Sales" },
  { test: /^Import Prices$/i, label: "Import Prices" },
  { test: /^FOMC Economic Projections$/i, label: "Federal Reserve Predictions" },
  { test: /^Fed Press Conference$/i, label: "FOMC Meeting" },
  { test: /^Fed Interest Rate Decision$/i, label: "U.S. Interest Rate Decision" },
  { test: /^Housing Starts$/i, label: "Housing Starts" },
  { test: /^New Home Sales$/i, label: "New Home Sales" },
  { test: /^Existing Home Sales$/i, label: "Existing Home Sales" },
  { test: /^Durable Goods Orders$/i, label: "Durable Goods" },
  { test: /^Michigan Consumer Sentiment$/i, label: "Uni. of Mich. Consumer Survey" },
  { test: /^(?:S&P Global|ISM) Manufacturing PMI$/i, label: "U.S. Manufacturing PMI" },
  { test: /^(?:S&P Global|ISM) Services PMI$/i, label: "U.S. Services PMI" },
  { test: /^Consumer Credit Change$/i, label: "Consumer Credit" },
  { test: /^Wholesale Inventories$/i, label: "Wholesale Trade" },
  { test: /^Monthly Budget Statement$/i, label: "Treasury Balance" },
  // Not in those decks yet; the headline releases any week of them would carry.
  { test: /^Non Farm Payrolls$/i, label: "Nonfarm Payrolls" },
  { test: /^Unemployment Rate$/i, label: "Unemployment Rate" },
  { test: /^JOLTs Job Openings$/i, label: "JOLTS Job Openings" },
  { test: /^GDP Growth Rate$/i, label: "GDP" },
  { test: /^PCE Price Index$/i, label: "PCE Price Index" },
  { test: /^Personal Income$/i, label: "Personal Income" },
  { test: /^Personal Spending$/i, label: "Personal Spending" },
  { test: /^CB Consumer Confidence$/i, label: "Consumer Confidence" },
  { test: /^ADP Employment Change$/i, label: "ADP Employment" },
  { test: /^Industrial Production$/i, label: "Industrial Production" },
];

/** "Retail Sales MoM" and "Retail Sales" are one release, as are "Michigan Consumer Sentiment Prel" and "GDP Growth Rate QoQ Final". */
export function baseName(name: string): string {
  let base = name.trim();
  for (let prev = ""; prev !== base; ) {
    prev = base;
    base = base
      .replace(/\s*\((?:m\/m|y\/y|q\/q|mom|yoy|qoq|prel|final|flash|adv|prelim)\)\s*$/i, "")
      .replace(/\s+(?:m\/m|y\/y|q\/q|mom|yoy|qoq)\s*$/i, "")
      .replace(/\s+(?:prel|final|flash|adv|prelim|2nd est|3rd est)\.?\s*$/i, "")
      .trim();
  }
  return base;
}

/** The deck's name for a release, or null when the execs don't list it. */
export function deckReleaseName(name: string): string | null {
  const base = baseName(name);
  return DECK_NAMES.find((d) => d.test.test(base))?.label ?? null;
}

export type MarketNewsPick = Pick<EconomicEvent, "date" | "name"> & { timestamp?: string | null };

/** The week's releases for the deck, in date and then time order, each named once per day the way the execs write it. */
export function deckMarketNews(events: MarketNewsPick[], range: { from: string; to: string }): { date: string; name: string }[] {
  const named = events
    .filter((e) => e.date >= range.from && e.date <= range.to)
    .map((e) => ({ date: e.date, at: e.timestamp ?? "", name: deckReleaseName(e.name) }))
    .filter((e): e is { date: string; at: string; name: string } => e.name !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at) || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  const out: { date: string; name: string }[] = [];
  for (const e of named) {
    // CPI arrives as "Inflation Rate MoM", "Inflation Rate YoY" and "CPI": one line.
    const key = `${e.date}|${e.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date: e.date, name: e.name });
  }
  return out;
}
