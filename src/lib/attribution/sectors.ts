export const GICS_SECTORS = [
  "information_technology",
  "financials",
  "health_care",
  "consumer_discretionary",
  "consumer_staples",
  "energy",
  "industrials",
  "materials",
  "utilities",
  "real_estate",
  "communication_services",
] as const;

export type GicsSector = (typeof GICS_SECTORS)[number];

export const SECTOR_LABELS: Record<GicsSector, string> = {
  information_technology: "Information Technology",
  financials: "Financials",
  health_care: "Health Care",
  consumer_discretionary: "Consumer Discretionary",
  consumer_staples: "Consumer Staples",
  energy: "Energy",
  industrials: "Industrials",
  materials: "Materials",
  utilities: "Utilities",
  real_estate: "Real Estate",
  communication_services: "Communication Services",
};

// Select Sector SPDRs stand in for the S&P 500 sector returns.
export const ETF_BY_SECTOR: Record<GicsSector, string> = {
  information_technology: "XLK",
  financials: "XLF",
  health_care: "XLV",
  consumer_discretionary: "XLY",
  consumer_staples: "XLP",
  energy: "XLE",
  industrials: "XLI",
  materials: "XLB",
  utilities: "XLU",
  real_estate: "XLRE",
  communication_services: "XLC",
};

/** Fund whose published sector weights seed the sector benchmark, and whose closes define valuation days. */
export const BENCHMARK_REFERENCE = "SPY";
/** The index the headline comparison is made against, on a price-return basis like the major-movement rule. */
export const INDEX_REFERENCE = "^GSPC";
export const INDEX_LABEL = "S&P 500";

export function benchmarkSymbols(): string[] {
  return [...Object.values(ETF_BY_SECTOR), BENCHMARK_REFERENCE, INDEX_REFERENCE];
}

// Yahoo's assetProfile.sector uses Morningstar-style names.
export const YAHOO_TO_GICS: Record<string, GicsSector> = {
  Technology: "information_technology",
  "Financial Services": "financials",
  Healthcare: "health_care",
  "Consumer Cyclical": "consumer_discretionary",
  "Consumer Defensive": "consumer_staples",
  Energy: "energy",
  Industrials: "industrials",
  "Basic Materials": "materials",
  Utilities: "utilities",
  "Real Estate": "real_estate",
  "Communication Services": "communication_services",
};

// Keys Yahoo uses in a fund's topHoldings.sectorWeightings.
export const YAHOO_FUND_KEY_TO_GICS: Record<string, GicsSector> = {
  technology: "information_technology",
  financial_services: "financials",
  healthcare: "health_care",
  consumer_cyclical: "consumer_discretionary",
  consumer_defensive: "consumer_staples",
  energy: "energy",
  industrials: "industrials",
  basic_materials: "materials",
  utilities: "utilities",
  realestate: "real_estate",
  communication_services: "communication_services",
};

// ETFs have no Yahoo sector. Sector SPDRs map to themselves; the rest are the Fund's thematic ETFs.
export const DEFAULT_ETF_SECTOR: Record<string, GicsSector> = {
  ...(Object.fromEntries(Object.entries(ETF_BY_SECTOR).map(([sector, etf]) => [etf, sector])) as Record<string, GicsSector>),
  KRE: "financials",
  SOXX: "information_technology",
  SKYY: "information_technology",
  CIBR: "information_technology",
  TDIV: "information_technology",
  DRAM: "information_technology",
  RING: "materials",
};

// Starting point for the team -> sector map, keyed by team slug. Execs can change it on the ledger page.
export const DEFAULT_TEAM_SECTORS: Record<string, GicsSector[]> = {
  consumer: ["consumer_discretionary", "consumer_staples", "communication_services"],
  tech: ["information_technology"],
  industrials: ["industrials"],
  commodities: ["energy", "materials", "utilities"],
  healthcare: ["health_care"],
  fig: ["financials", "real_estate"],
};

export function sectorFromYahoo(yahooSector: string | null | undefined): GicsSector | null {
  if (!yahooSector) return null;
  return YAHOO_TO_GICS[yahooSector.trim()] ?? null;
}

export function defaultSector(ticker: string, yahooSector?: string | null): { sector: GicsSector; source: "default" | "yahoo" } | null {
  const etf = DEFAULT_ETF_SECTOR[ticker.toUpperCase()];
  if (etf) return { sector: etf, source: "default" };
  const mapped = sectorFromYahoo(yahooSector);
  return mapped ? { sector: mapped, source: "yahoo" } : null;
}

export type BucketKey = GicsSector | "cash" | "unclassified";

export function bucketLabel(key: BucketKey): string {
  if (key === "cash") return "Cash";
  if (key === "unclassified") return "Unclassified";
  return SECTOR_LABELS[key];
}
